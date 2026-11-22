const BASE = process.env.E2E_BASE ?? 'http://localhost:3100';
let cookie = '';
let adminCookie = '';
let failures = 0;
function ok(cond, label, extra = '') {
  if (cond) console.log('PASS', label);
  else { failures++; console.log('FAIL', label, extra); }
}
async function req(path, { method = 'GET', body, headers = {}, auth } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (auth) h.Cookie = auth;
  const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const ct = res.headers.get('content-type') ?? '';
  let data = null;
  if (ct.includes('application/json')) data = await res.json();
  else if (!ct.includes('text/event-stream')) { try { data = JSON.parse(await res.text()); } catch { data = null; } }
  return { status: res.status, data, setCookie };
}
function collect(res, store) {
  for (const c of res.setCookie) {
    const pair = c.split(';')[0];
    if (pair.startsWith('iam_access=')) store.at = pair;
    if (pair.startsWith('iam_refresh=')) store.rt = pair;
  }
}
const e2eEmail = 'e2e-' + Date.now() + '@test.dev';
const userC = {}, adminC = {};

// health + public pages
const h = await req('/api/health');
ok(h.status === 200 && h.data?.status === 'ok', 'health endpoint', JSON.stringify(h.data));
for (const p of ['/', '/pricing', '/login', '/signup', '/dashboard', '/playground', '/admin', '/settings', '/keys', '/billing', '/privacy', '/terms']) {
  const r = await fetch(BASE + p, { redirect: 'manual' });
  ok(r.status === 200 || r.status === 307 || r.status === 302, `page ${p} -> ${r.status}`);
}

// legal pages render with real content + linked from landing footer
const pp = await fetch(BASE + '/privacy');
ok(pp.status === 200 && (await pp.text()).includes('Privacy Policy'), 'privacy page content');
const tp = await fetch(BASE + '/terms');
ok(tp.status === 200 && (await tp.text()).includes('Conditions'), 'terms page content');
const home2 = await fetch(BASE + '/');
ok((await home2.text()).includes('href="/privacy"'), 'landing footer links privacy');

// google sign-in UI present + graceful flow when unconfigured
const lp = await fetch(BASE + '/login');
ok((await lp.text()).includes('Continue with Google'), 'login page shows Google button');
const spg = await fetch(BASE + '/signup');
ok((await spg.text()).includes('Sign up with Google'), 'signup page shows Google button');
const gs = await fetch(BASE + '/api/auth/google/start', { redirect: 'manual' });
ok(gs.status === 302 || gs.status === 307, 'google start redirects gracefully', String(gs.status));
const gsLoc = gs.headers.get('location') ?? '';
ok(gsLoc.includes('accounts.google.com') || gsLoc.includes('error=google_not_configured'), 'google start redirects to Google or friendly error', gsLoc);

// signup new user
const su = await req('/api/auth/signup', { method: 'POST', body: { email: e2eEmail, password: 'supersecret123', name: 'E2E User' } });
ok(su.status === 200 || su.status === 201, 'signup', JSON.stringify(su.data));
collect(su, userC);

// login flow returns refresh cookie
const li = await req('/api/auth/login', { method: 'POST', body: { email: e2eEmail, password: 'supersecret123' } });
ok(li.status === 200, 'login', JSON.stringify(li.data));
collect(li, userC);
ok(!!userC.at && !!userC.rt, 'auth cookies set (at/rt)');

// signed-in users never see the signup/login forms again
const authedLogin = await fetch(BASE + '/login', { redirect: 'manual', headers: { Cookie: userC.at + '; ' + userC.rt } });
ok(authedLogin.status === 307 || authedLogin.status === 302, 'login page redirects signed-in users', String(authedLogin.status));
const authedSignup = await fetch(BASE + '/signup', { redirect: 'manual', headers: { Cookie: userC.at + '; ' + userC.rt } });
ok(authedSignup.status === 307 || authedSignup.status === 302, 'signup page redirects signed-in users', String(authedSignup.status));

// unauthenticated access is refused
const noAuth = await req('/api/models');
ok(noAuth.status === 401, 'models requires auth', String(noAuth.status));

// models available for free tier (admin seeded mock provider)
const mm = await req('/api/models', { auth: userC.at + '; ' + userC.rt });
ok(mm.status === 200 && Array.isArray(mm.data?.models) && mm.data.models.length > 0, 'models list for free tier', JSON.stringify(mm.data).slice(0, 300));

// chat stream via gateway (mock provider)
const chat = await fetch(BASE + '/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: userC.at + '; ' + userC.rt },
  body: JSON.stringify({ model: 'mock-small', messages: [{ role: 'user', content: 'hello gateway\n\n--- Attached file: notes.txt ---\nThe daily token grant is generous.\n--- End of notes.txt ---' }], persist: true }),
});
ok(chat.status === 200, 'chat stream 200', String(chat.status));
const text = await chat.text();
ok(text.includes('event: done') || text.includes('"type":"done"'), 'stream completes with done', text.slice(0, 300));

// usage recorded + balance decreased
const us = await req('/api/usage', { auth: userC.at + '; ' + userC.rt });
ok(us.status === 200 && typeof us.data?.available === 'number' && us.data.available >= 0, 'usage/balance endpoint', JSON.stringify(us.data).slice(0, 300));

// conversations persisted
const conv = await req('/api/conversations', { auth: userC.at + '; ' + userC.rt });
ok(conv.status === 200 && conv.data?.conversations?.length >= 1, 'conversation persisted', JSON.stringify(conv.data).slice(0, 200));

// conversation truncate API (edit / undo backend) — on a dedicated throwaway chat
await fetch(BASE + '/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: userC.at + '; ' + userC.rt },
  body: JSON.stringify({ model: 'mock-small', messages: [{ role: 'user', content: 'truncate me please' }] }),
});
const convListTr = await req('/api/conversations', { auth: userC.at + '; ' + userC.rt });
const convId1 = convListTr.data.conversations[0].id;
const det1 = await req('/api/conversations/' + convId1, { auth: userC.at + '; ' + userC.rt });
const beforeCount = det1.data?.conversation?.messages?.length ?? 0;
const trunc = await req('/api/conversations/' + convId1, { method: 'PATCH', auth: userC.at + '; ' + userC.rt, body: { keepCount: Math.max(0, beforeCount - 2) } });
ok(trunc.status === 200 && trunc.data?.deleted === 2, 'undo truncates last exchange', JSON.stringify(trunc.data));
const det2 = await req('/api/conversations/' + convId1, { auth: userC.at + '; ' + userC.rt });
ok(det2.status === 200 && det2.data?.conversation?.messages?.length === beforeCount - 2, 'messages removed server-side', String(det2.data?.conversation?.messages?.length));
const truncOther = await req('/api/conversations', { method: 'PATCH', auth: userC.at + '; ' + userC.rt, body: { keepCount: 0 } });
ok(truncOther.status === 404 || truncOther.status === 405, 'truncate on unknown conversation -> 404', String(truncOther.status));
const truncBad = await req('/api/conversations/' + convId1, { method: 'PATCH', auth: userC.at + '; ' + userC.rt, body: { keepCount: -5 } });
ok(truncBad.status === 422 || truncBad.status === 400, 'truncate validates keepCount', String(truncBad.status));

// invalid input -> 400
const bad = await req('/api/auth/login', { method: 'POST', body: { email: 'bad' } });
ok(bad.status === 400 || bad.status === 422, 'zod validation returns 4xx', String(bad.status));

// OTP verification endpoints: strict + non-enumerating
const otpBad = await req('/api/auth/verify', { method: 'POST', body: { email: 'nobody@test.dev', code: '123456' } });
ok(otpBad.status === 400 || otpBad.status === 422, 'otp verify rejects unknown email/code', String(otpBad.status));
const otpMalformed = await req('/api/auth/verify', { method: 'POST', body: { email: 'a@b.com', code: '12ab' } });
ok(otpMalformed.status === 422, 'otp verify rejects non-6-digit codes', String(otpMalformed.status));
const otpResend = await req('/api/auth/verify/resend', { method: 'POST', body: { email: 'nobody@test.dev' } });
ok(otpResend.status === 200, 'otp resend never reveals account existence', String(otpResend.status));

// huzaifa.ai support assistant: widget present, answers guests without auth
const land = await fetch(BASE + '/');
const landHtml = await land.text();
ok(landHtml.includes('huzaifa-ai.jpg'), 'assistant avatar on landing page');
const ask = await req('/api/assistant', { method: 'POST', body: { messages: [{ role: 'user', content: 'What do the plans include and how much is Pro?' }] } });
ok(ask.status === 200 && typeof ask.data?.answer === 'string' && ask.data.answer.length > 20, 'assistant answers guests', JSON.stringify(ask.data).slice(0, 200));
ok((ask.data?.answer ?? '').includes('Pro') || (ask.data?.answer ?? '').includes('₹1,299'), 'assistant answer mentions pricing');
const badAsk = await req('/api/assistant', { method: 'POST', body: { messages: [] } });
ok(badAsk.status === 422 || badAsk.status === 400, 'assistant validates empty input', String(badAsk.status));

// about section: founder card, narration control, social icons
ok(landHtml.includes('id="about"'), 'about section present on landing');
ok(landHtml.includes('huzaifa-kazi.jpg'), 'founder photo in about section');
ok(landHtml.includes('Owner &amp; CEO'), 'founder role shown');
ok(landHtml.includes('Listen to our story'), 'voice narration button present');
ok(landHtml.includes('instagram.com/iam_hujju_'), 'instagram social link points to profile');
for (const social of ['YouTube', 'Telegram', 'LinkedIn']) {
  ok(landHtml.includes(`IamHujju on ${social}`), `${social} icon present`);
}
const founderImg = await fetch(BASE + '/media/huzaifa-kazi.jpg');
ok(founderImg.status === 200 && (founderImg.headers.get('content-type') ?? '').includes('image'), 'founder photo asset served');

// ai gallery: folders, stories, assets
ok(landHtml.includes('id="gallery"'), 'gallery section present on landing');
ok(landHtml.includes('Made by machines'), 'gallery headline present');
for (const folder of ['Passport &amp; IDs', 'Posters &amp; Reels', 'Character Sheets', 'Brand &amp; Web']) {
  ok(landHtml.includes(folder), `gallery folder tab: ${folder}`);
}
ok(landHtml.indexOf('Brand &amp; Web') < landHtml.indexOf('Passport &amp; IDs'), 'gallery folder order: Brand & Web first, Passport & IDs last');
ok(landHtml.includes('data-template="brand-portrait"'), 'gallery card exposes ready-made template slug');
for (const g of ['passport-headshot.jpg', 'id-portrait.jpg', 'car-jump-poster.jpg', 'character-sheet.jpg', 'brand-portrait.jpg']) {
  const gi = await fetch(BASE + '/media/gallery/' + g);
  ok(gi.status === 200 && (gi.headers.get('content-type') ?? '').includes('image'), `gallery asset ${g} served`);
}
ok(landHtml.includes('gallery-reel-demo.mp4') || landHtml.includes('data-template="gallery-reel-demo"'), 'gallery demo reel card renders');
const reelVideo = await fetch(BASE + '/media/gallery/gallery-reel-demo.mp4');
ok(reelVideo.status === 200 && (reelVideo.headers.get('content-type') ?? '').includes('video'), 'gallery video asset served as video', String(reelVideo.status));
const tplPage = await fetch(BASE + '/playground?template=passport-headshot');
ok(tplPage.status === 200, 'playground accepts template query param', String(tplPage.status));

// web-page reader tool: auth required, validates URLs, blocks private ranges
const browseUnauth = await req('/api/tools/browse', { method: 'POST', body: { url: 'https://example.com' } });
ok(browseUnauth.status === 401, 'browse tool requires auth', String(browseUnauth.status));
const browseBad = await req('/api/tools/browse', { method: 'POST', body: { url: 'not a url' }, auth: userC.at + '; ' + userC.rt });
ok(browseBad.status === 422 || browseBad.status === 400, 'browse tool rejects invalid URLs', String(browseBad.status));
const browsePrivate = await req('/api/tools/browse', { method: 'POST', body: { url: 'http://127.0.0.1:5433/platform' }, auth: userC.at + '; ' + userC.rt });
ok(browsePrivate.status === 400, 'browse tool blocks private/loopback addresses', String(browsePrivate.status));
const browseFtp = await req('/api/tools/browse', { method: 'POST', body: { url: 'ftp://example.com/x' }, auth: userC.at + '; ' + userC.rt });
ok(browseFtp.status === 422 || browseFtp.status === 400, 'browse tool blocks non-http schemes', String(browseFtp.status));
let browseOk = false;
try {
  const browseGood = await req('/api/tools/browse', { method: 'POST', body: { url: 'https://example.com' }, auth: userC.at + '; ' + userC.rt });
  browseOk = browseGood.status === 200 && typeof browseGood.data?.text === 'string' && browseGood.data.text.length > 10;
  ok(browseOk, 'browse tool reads a public page', JSON.stringify(browseGood.data).slice(0, 120));
} catch { ok(false, 'browse tool reads a public page', 'network unavailable'); }

// multimodal chat: text + image parts accepted, metered, streamed; bad parts rejected
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const mmRes = await fetch(BASE + '/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: userC.at + '; ' + userC.rt },
  body: JSON.stringify({
    model: 'mock-small',
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Describe the attached file: hello attachment world' },
      { type: 'image_url', image_url: { url: tinyPng } },
    ] }],
  }),
});
const mmText = mmRes.status === 200 ? await mmRes.text() : '';
ok(mmRes.status === 200 && mmText.includes('attachment') && mmText.includes('done'), 'multimodal chat (text+image parts) streams and completes', `${mmRes.status} ${mmText.slice(0, 120)}`);
const mmBad = await req('/api/chat', { method: 'POST', body: { model: 'mock-small', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'http://evil.example/x.png' } }] }] }, auth: userC.at + '; ' + userC.rt });
ok(mmBad.status === 400 || mmBad.status === 422, 'non-inline image parts rejected server-side', String(mmBad.status));

// gemini models are seeded but stay hidden until the admin pastes a key; direct calls are refused
const asFree = await req('/api/models', { auth: userC.at + '; ' + userC.rt });
ok(asFree.status === 200 && !asFree.data.models.some((m) => m.provider === 'gemini'), 'gemini hidden while provider has no key');
const gemTry = await req('/api/chat', { method: 'POST', auth: userC.at + '; ' + userC.rt, body: { model: 'gemini-2.5-pro', messages: [{ role: 'user', content: 'hi' }] } });
ok([403, 404, 503].includes(gemTry.status), 'gemini chat refused without key/payment', JSON.stringify(gemTry.data));

// pay-as-you-go top-up packs: list + SECURITY: users cannot self-complete mock purchases
const packs = await req('/api/billing/topup/packs', { auth: userC.at + '; ' + userC.rt });
ok(packs.status === 200 && packs.data.packs?.length === 3, 'topup packs listed', JSON.stringify(packs.data).slice(0, 150));
const tk = await req('/api/billing/topup/checkout', { method: 'POST', auth: userC.at + '; ' + userC.rt, body: { packId: 'booster' } });
ok([503].includes(tk.status), 'topup checkout refuses users while no payment gateway configured', JSON.stringify(tk.data).slice(0, 150));
const tkDone = await req('/api/billing/topup/mock-complete', { method: 'POST', auth: userC.at + '; ' + userC.rt, body: { orderId: 'mock_e2e_' + Date.now(), packId: 'booster' } });
ok(tkDone.status === 403, 'topup mock-complete blocked for non-admin users', String(tkDone.status));

// usage export is a paid-plan feature: free user is refused
const expFree = await fetch(BASE + '/api/usage/export', { headers: { Cookie: userC.at + '; ' + userC.rt } });
ok(expFree.status === 403, 'usage export refuses free plan', String(expFree.status));
const paid = await req('/api/billing/mock-complete', { method: 'POST', auth: userC.at + '; ' + userC.rt, body: { orderId: 'mock_e2e_' + Date.now(), planSlug: 'pro', interval: 'monthly' } });
ok(paid.status === 403, 'SECURITY: mock plan upgrade blocked for non-admin users', String(paid.status));
const priceFree = await fetch(BASE + '/pricing', { headers: { Cookie: userC.at + '; ' + userC.rt } });
const priceFreeText = await (await fetch(BASE + '/pricing', { headers: { Cookie: userC.at + '; ' + userC.rt } })).text();
ok(priceFreeText.includes('Upgrade'), 'free user still sees upgrade CTAs on pricing');

// razorpay webhook refuses unsigned/unconfigured calls
const rzpHook = await fetch(BASE + '/api/billing/webhook/razorpay', { method: 'POST', body: 'x' });
ok(rzpHook.status === 400, 'razorpay webhook refuses unsigned payloads', String(rzpHook.status));

// admin login
const adm = await req('/api/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'change-me-immediately' } });
ok(adm.status === 200, 'admin login', JSON.stringify(adm.data).slice(0, 200));
collect(adm, adminC);
ok(!!adminC.at, 'admin cookies set');

// admin can still use mock checkout for testing: topup + plan upgrade
const beforeTopA = await req('/api/usage', { auth: adminC.at + '; ' + adminC.rt });
const tkA = await req('/api/billing/topup/checkout', { method: 'POST', auth: adminC.at + '; ' + adminC.rt, body: { packId: 'booster' } });
ok(tkA.status === 200 && tkA.data?.orderId, 'admin topup checkout (mock allowed)', JSON.stringify(tkA.data).slice(0, 150));
const tkADone = await req('/api/billing/topup/mock-complete', { method: 'POST', auth: adminC.at + '; ' + adminC.rt, body: { orderId: tkA.data.orderId, packId: 'booster' } });
ok(tkADone.status === 200 && tkADone.data?.granted === 500000, 'admin topup mock-complete grants tokens', JSON.stringify(tkADone.data));
const afterTopA = await req('/api/usage', { auth: adminC.at + '; ' + adminC.rt });
ok(afterTopA.data.available > beforeTopA.data.available, 'admin balance increased after topup', `${beforeTopA.data.available} -> ${afterTopA.data.available}`);
const paidA = await req('/api/billing/mock-complete', { method: 'POST', auth: adminC.at + '; ' + adminC.rt, body: { orderId: 'mock_e2e_' + Math.random().toString(36).slice(2), planSlug: 'pro', interval: 'monthly' } });
ok(paidA.status === 200, 'admin mock plan upgrade works', JSON.stringify(paidA.data));
const priceA = await fetch(BASE + '/pricing', { headers: { Cookie: adminC.at + '; ' + adminC.rt } });
ok((await priceA.text()).includes('Your current plan'), 'pricing shows Your current plan for upgraded admin');
const expPaid = await fetch(BASE + '/api/usage/export', { headers: { Cookie: adminC.at + '; ' + adminC.rt } });
const expText = await expPaid.text();
ok(expPaid.status === 200 && expText.includes('total_tokens'), 'usage export CSV for paid plan', String(expPaid.status));

// admin analytics
const an = await req('/api/admin/analytics', { auth: adminC.at + '; ' + adminC.rt });
ok(an.status === 200 && typeof an.data?.totals?.tokens === 'number', 'admin analytics', JSON.stringify(an.data).slice(0, 200));

// admin settings incl. mail delivery monitor
const st = await req('/api/admin/settings', { auth: adminC.at + '; ' + adminC.rt });
ok(st.status === 200 && Array.isArray(st.data?.settings) && Array.isArray(st.data?.mailLogs), 'admin settings exposes mail delivery log', String(st.status));
ok(Array.isArray(st.data?.mailLogs) && st.data.mailLogs.every((m) => typeof m.delivered === 'boolean' && typeof m.to === 'string'), 'mail log entries carry delivered flag', JSON.stringify(st.data?.mailLogs).slice(0, 200));

// RBAC: non-admin to admin endpoint -> 403
const rbac = await req('/api/admin/analytics', { auth: userC.at + '; ' + userC.rt });
ok(rbac.status === 403, 'RBAC blocks non-admin', String(rbac.status));

// admin users list
const du = await req('/api/admin/users', { auth: adminC.at + '; ' + adminC.rt });
ok(du.status === 200 && du.data.users.some(u => u.email === e2eEmail), 'admin user list shows e2e user', JSON.stringify(du.data).slice(0, 200));

// ═══ Admin powers: chat logs, force logout, delete user ═══
const logsUserTry = await req('/api/admin/conversations', { auth: userC.at + '; ' + userC.rt });
ok(logsUserTry.status === 403, 'non-admin blocked from chat logs', String(logsUserTry.status));
const logs = await req('/api/admin/conversations?q=' + encodeURIComponent(e2eEmail), { auth: adminC.at + '; ' + adminC.rt });
ok(logs.status === 200 && logs.data.conversations?.length >= 1, 'admin chat logs list e2e conversation', JSON.stringify(logs.data).slice(0, 200));
const targetConv = (logs.data.conversations ?? []).find(c => (c.title ?? '').includes('hello gateway')) ?? (logs.data.conversations ?? [])[0];
if (targetConv) {
  const logDetail = await req('/api/admin/conversations/' + targetConv.id, { auth: adminC.at + '; ' + adminC.rt });
  const allContent = JSON.stringify(logDetail.data?.conversation?.messages ?? []);
  ok(logDetail.status === 200 && logDetail.data.conversation.messages.length >= 2, 'admin can open full transcript', String(logDetail.status));
  ok(allContent.includes('hello gateway'), 'transcript contains user message text');
  ok(allContent.includes('--- Attached file: notes.txt ---'), 'transcript contains attachment contents');
} else { failures++; console.log('FAIL admin chat logs list e2e conversation (none)'); }

// disposable user: force logout + permanent delete
const dispEmail = 'disp-' + Date.now() + '@test.dev';
const dispC = {};
const dispSignup = await req('/api/auth/signup', { method: 'POST', body: { email: dispEmail, password: 'password123', name: 'Disposable' } });
ok(dispSignup.status === 200, 'disposable user signup', JSON.stringify(dispSignup.data).slice(0, 120));
collect(dispSignup, dispC);
const dispUser = du.data.users.find(u => u.email === dispEmail) ?? null;
const du2 = await req('/api/admin/users?q=' + encodeURIComponent(dispEmail), { auth: adminC.at + '; ' + adminC.rt });
const dispId = du2.data.users?.[0]?.id;
if (dispId) {
  const fl = await req('/api/admin/users/' + dispId, { method: 'PATCH', auth: adminC.at + '; ' + adminC.rt, body: { forceLogout: true } });
  ok(fl.status === 200 && fl.data?.loggedOut === true, 'admin force logout terminates sessions', JSON.stringify(fl.data));
  const term = await req('/api/admin/users/' + dispId, { method: 'PATCH', auth: adminC.at + '; ' + adminC.rt, body: { suspended: true, forceLogout: true } });
  ok(term.status === 200 && term.data?.user?.suspended === true, 'admin terminate suspends + revokes access', JSON.stringify(term.data));
  const blockedLogin = await req('/api/auth/login', { method: 'POST', body: { email: dispEmail, password: 'password123' } });
  ok(blockedLogin.status === 403, 'terminated user cannot sign in', String(blockedLogin.status));
  const restore = await req('/api/admin/users/' + dispId, { method: 'PATCH', auth: adminC.at + '; ' + adminC.rt, body: { suspended: false } });
  ok(restore.status === 200 && restore.data?.user?.suspended === false, 'admin restore re-enables the user', JSON.stringify(restore.data));
  const unblocked = await req('/api/auth/login', { method: 'POST', body: { email: dispEmail, password: 'password123' } });
  ok(unblocked.status === 200, 'restored user can sign in again', String(unblocked.status));
  const del = await req('/api/admin/users/' + dispId, { method: 'DELETE', auth: adminC.at + '; ' + adminC.rt });
  ok(del.status === 200 && del.data?.deleted === dispEmail, 'admin permanently deletes user', JSON.stringify(del.data));
  const gone = await req('/api/auth/login', { method: 'POST', body: { email: dispEmail, password: 'password123' } });
  ok(gone.status === 401, 'deleted user cannot sign in', String(gone.status));
  const delSelfTry = await req('/api/admin/users', { auth: adminC.at + '; ' + adminC.rt });
  const adminId = delSelfTry.data.users.find(u => u.role === 'ADMIN')?.id;
  if (adminId) {
    const delSelf = await req('/api/admin/users/' + adminId, { method: 'DELETE', auth: adminC.at + '; ' + adminC.rt });
    ok(delSelf.status === 400, 'admin cannot delete own account', String(delSelf.status));
  }
} else { failures++; console.log('FAIL disposable admin lookup'); }

// ═══ Profile page: account API, editable fields, avatar ═══
const acc = await req('/api/account', { auth: userC.at + '; ' + userC.rt });
const accShape = typeof acc.data?.tokens?.available === 'number' && typeof acc.data?.tokens?.lifetimeUsed === 'number' && !!acc.data?.plan && Array.isArray(acc.data?.payments);
ok(acc.status === 200 && acc.data?.profile?.email === e2eEmail && accShape, 'account API returns profile, plan, tokens, payments', JSON.stringify(acc.data).slice(0, 200));
const tinyAvatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const accPatch = await req('/api/account', { method: 'PATCH', auth: userC.at + '; ' + userC.rt, body: { name: 'E2E Renamed', birthday: '1990-01-31', country: 'India', bio: 'I test the platform.', avatarUrl: tinyAvatar } });
const patched = accPatch.data?.user ?? {};
ok(accPatch.status === 200 && patched.name === 'E2E Renamed' && patched.country === 'India' && patched.bio === 'I test the platform.' && (patched.avatarUrl ?? '').startsWith('data:image/png') && !!patched.birthday, 'profile update saves name/birthday/country/bio/avatar', JSON.stringify(accPatch.data).slice(0, 250));
const accGet2 = await req('/api/account', { auth: userC.at + '; ' + userC.rt });
ok(accGet2.data?.profile?.country === 'India' && !!accGet2.data?.profile?.birthday && !!accGet2.data?.profile?.memberSince, 'profile edits persist in account API', JSON.stringify(accGet2.data?.profile).slice(0, 250));
const meNav = await req('/api/auth/me', { auth: userC.at + '; ' + userC.rt });
ok(meNav.status === 200 && (meNav.data?.user?.avatarUrl ?? '').startsWith('data:image/png'), 'header /api/auth/me returns avatarUrl for nav', JSON.stringify(meNav.data?.user).slice(0, 200));
const badAvatar = await req('/api/account', { method: 'PATCH', auth: userC.at + '; ' + userC.rt, body: { avatarUrl: 'http://evil.example/x.png' } });
ok(badAvatar.status === 400 || badAvatar.status === 422, 'profile rejects non-data-URL avatar', String(badAvatar.status));
const badBirthday = await req('/api/account', { method: 'PATCH', auth: userC.at + '; ' + userC.rt, body: { birthday: 'not-a-date' } });
ok(badBirthday.status === 400 || badBirthday.status === 422, 'profile validates birthday format', String(badBirthday.status));
const profPage = await fetch(BASE + '/profile', { redirect: 'manual', headers: { Cookie: userC.at + '; ' + userC.rt } });
ok(profPage.status === 200, 'profile page renders for signed-in user', String(profPage.status));
const profAnon = await fetch(BASE + '/profile', { redirect: 'manual' });
ok(profAnon.status === 307 || profAnon.status === 302, 'profile page redirects anonymous users', String(profAnon.status));

// ═══ Sign-out actually signs the user out ═══
const lo = await req('/api/auth/logout', { method: 'POST', auth: userC.at + '; ' + userC.rt });
const loCookies = lo.setCookie.join(' ');
ok(lo.status === 200, 'logout endpoint ok', String(lo.status));
ok(/iam_access=;[^]*max-age=0/i.test(loCookies) || /iam_access=;[^]*Max-Age=0/.test(loCookies), 'logout clears the access cookie (sign-out persists)', loCookies.slice(0, 400));
ok(/iam_refresh=;[^]*max-age=0/i.test(loCookies) || /iam_refresh=;[^]*Max-Age=0/.test(loCookies), 'logout clears the refresh cookie', loCookies.slice(0, 400));
const refTry = await fetch(BASE + '/api/auth/refresh', { method: 'POST', headers: { Cookie: userC.rt } });
ok(refTry.status === 401, 'revoked session cannot refresh after sign-out', String(refTry.status));
const reLo = await req('/api/auth/login', { method: 'POST', body: { email: e2eEmail, password: 'supersecret123' } });
ok(reLo.status === 200 && reLo.data?.otpRequired === false, 're-login after sign-out asks for credentials again', JSON.stringify(reLo.data));
collect(reLo, userC);

// ═══ Messenger: presence, direct thread (user ↔ owner), community group ═══
const presU = await req('/api/presence', { method: 'POST', auth: userC.at + '; ' + userC.rt });
ok(presU.status === 200 && presU.data?.online === true, 'presence heartbeat accepted', String(presU.status));
const dEmpty = await req('/api/threads/direct', { auth: userC.at + '; ' + userC.rt });
ok(dEmpty.status === 200 && Array.isArray(dEmpty.data?.messages) && dEmpty.data?.owner && typeof dEmpty.data.owner.online === 'boolean', 'direct thread GET returns messages + owner presence', JSON.stringify(dEmpty.data).slice(0, 200));
const dSend = await req('/api/threads/direct', { method: 'POST', auth: userC.at + '; ' + userC.rt, body: { body: 'Hello Huzaifa — requesting 5000 extra tokens please' } });
ok(dSend.status === 201 && (dSend.data?.message?.body ?? '').includes('requesting 5000'), 'user sends direct message to owner', JSON.stringify(dSend.data).slice(0, 150));
const dmNoAuth = await req('/api/threads/direct');
ok(dmNoAuth.status === 401, 'anonymous cannot read direct thread', String(dmNoAuth.status));
const dmTooLong = await req('/api/threads/direct', { method: 'POST', auth: userC.at + '; ' + userC.rt, body: { body: 'x'.repeat(2001) } });
ok(dmTooLong.status === 400 || dmTooLong.status === 422, 'message body length validated', String(dmTooLong.status));
const admThreads = await req('/api/admin/threads?q=' + encodeURIComponent(e2eEmail), { auth: adminC.at + '; ' + adminC.rt });
const threadRow = admThreads.data?.threads?.[0];
ok(admThreads.status === 200 && threadRow?.user?.email === e2eEmail && threadRow.unread >= 1 && typeof threadRow.user.online === 'boolean', 'admin inbox lists thread with unread count + presence', JSON.stringify(admThreads.data).slice(0, 250));
const admNonAdmin = await req('/api/admin/threads', { auth: userC.at + '; ' + userC.rt });
ok(admNonAdmin.status === 403, 'non-admin blocked from inbox', String(admNonAdmin.status));
if (threadRow) {
  const admReply = await req('/api/admin/threads/' + threadRow.id, { method: 'POST', auth: adminC.at + '; ' + adminC.rt, body: { body: 'Granted! Check your balance shortly.' } });
  ok(admReply.status === 201, 'owner replies in the thread', JSON.stringify(admReply.data).slice(0, 150));
  const dBack = await req('/api/threads/direct', { auth: userC.at + '; ' + userC.rt });
  ok(dBack.data?.messages?.length >= 2 && dBack.data.messages.some((m) => m.body.includes('Granted!')), 'user receives owner reply', String(dBack.data?.messages?.length));
  const adm404 = await req('/api/admin/threads/nonexistent-thread-id', { auth: adminC.at + '; ' + adminC.rt });
  ok(adm404.status === 404, 'unknown thread id -> 404', String(adm404.status));
} else { failures++; console.log('FAIL admin inbox thread row (none)'); }

// community group chat
const gEmpty = await req('/api/threads/group', { auth: userC.at + '; ' + userC.rt });
ok(gEmpty.status === 200 && Array.isArray(gEmpty.data?.messages) && Array.isArray(gEmpty.data?.online), 'group chat GET returns messages + online list', JSON.stringify(gEmpty.data).slice(0, 200));
const gSend = await req('/api/threads/group', { method: 'POST', auth: userC.at + '; ' + userC.rt, body: { body: 'Hello community — greetings from the e2e user!' } });
ok(gSend.status === 201 && gSend.data?.message?.sender, 'user posts to community group', JSON.stringify(gSend.data).slice(0, 200));
// second user sees the group message
const otherEmail = 'peer-' + Date.now() + '@test.dev';
const otherC = {};
const otherSignup = await req('/api/auth/signup', { method: 'POST', body: { email: otherEmail, password: 'password123', name: 'Peer User' } });
collect(otherSignup, otherC);
const gPeer = await req('/api/threads/group', { auth: otherC.at + '; ' + otherC.rt });
ok(gPeer.data?.messages?.some((m) => (m.body ?? '').includes('greetings from the e2e user') && m.senderId !== otherC.at), 'second user sees community message from first user', String(gPeer.data?.messages?.length));
const gMsgId = gSend.data?.message?.id;
const gDelUser = await req('/api/threads/group/' + gMsgId, { method: 'DELETE', auth: userC.at + '; ' + userC.rt });
ok(gDelUser.status === 403, 'non-admin cannot moderate group messages', String(gDelUser.status));
const gDelAdmin = await req('/api/threads/group/' + gMsgId, { method: 'DELETE', auth: adminC.at + '; ' + adminC.rt });
ok(gDelAdmin.status === 200 && gDelAdmin.data?.deleted === gMsgId, 'admin moderates (deletes) group message', JSON.stringify(gDelAdmin.data));
const presAdm = await req('/api/admin/users', { auth: adminC.at + '; ' + adminC.rt });
ok(presAdm.status === 200 && presAdm.data.users.every((u) => typeof u.online === 'boolean'), 'admin users table carries online status', String(presAdm.status));

console.log(failures === 0 ? '\\nE2E-ALL-PASS (' + Date.now() + ')' : '\\nE2E-FAILURES=' + failures);
process.exit(failures === 0 ? 0 : 1);
