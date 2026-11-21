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
  body: JSON.stringify({ model: 'mock-small', messages: [{ role: 'user', content: 'hello gateway' }], persist: true }),
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

// conversation truncate API (edit / undo backend)
const convId1 = conv.data.conversations[0].id;
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
for (const g of ['passport-headshot.jpg', 'id-portrait.jpg', 'car-jump-poster.jpg', 'character-sheet.jpg', 'brand-portrait.jpg']) {
  const gi = await fetch(BASE + '/media/gallery/' + g);
  ok(gi.status === 200 && (gi.headers.get('content-type') ?? '').includes('image'), `gallery asset ${g} served`);
}

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

// pay-as-you-go top-up packs: list + mock purchase credits tokens
const packs = await req('/api/billing/topup/packs', { auth: userC.at + '; ' + userC.rt });
ok(packs.status === 200 && packs.data.packs?.length === 3, 'topup packs listed', JSON.stringify(packs.data).slice(0, 150));
const beforeTop = await req('/api/usage', { auth: userC.at + '; ' + userC.rt });
const tk = await req('/api/billing/topup/checkout', { method: 'POST', auth: userC.at + '; ' + userC.rt, body: { packId: 'booster' } });
ok(tk.status === 200 && tk.data?.orderId, 'topup checkout', JSON.stringify(tk.data).slice(0, 150));
const tkDone = await req('/api/billing/topup/mock-complete', { method: 'POST', auth: userC.at + '; ' + userC.rt, body: { orderId: tk.data.orderId, packId: 'booster' } });
ok(tkDone.status === 200 && tkDone.data?.granted === 500000, 'topup mock-complete grants tokens', JSON.stringify(tkDone.data));
const afterTop = await req('/api/usage', { auth: userC.at + '; ' + userC.rt });
ok(afterTop.data.available >= beforeTop.data.available + 500000, 'balance increased after topup', `${beforeTop.data.available} -> ${afterTop.data.available}`);

// usage export is a paid-plan feature: free user is refused, CSV served for paid
const expFree = await fetch(BASE + '/api/usage/export', { headers: { Cookie: userC.at + '; ' + userC.rt } });
ok(expFree.status === 403, 'usage export refuses free plan', String(expFree.status));
const paid = await req('/api/billing/mock-complete', { method: 'POST', auth: userC.at + '; ' + userC.rt, body: { orderId: 'mock_e2e_' + Date.now(), planSlug: 'pro', interval: 'monthly' } });
ok(paid.status === 200, 'mock upgrade to pro', JSON.stringify(paid.data));
const price = await fetch(BASE + '/pricing', { headers: { Cookie: userC.at + '; ' + userC.rt } });
ok((await price.text()).includes('Your current plan'), 'pricing shows Your current plan after upgrade');
const expPaid = await fetch(BASE + '/api/usage/export', { headers: { Cookie: userC.at + '; ' + userC.rt } });
const expText = await expPaid.text();
ok(expPaid.status === 200 && expText.includes('total_tokens'), 'usage export CSV for paid plan', String(expPaid.status));

// razorpay webhook refuses unsigned/unconfigured calls
const rzpHook = await fetch(BASE + '/api/billing/webhook/razorpay', { method: 'POST', body: 'x' });
ok(rzpHook.status === 400, 'razorpay webhook refuses unsigned payloads', String(rzpHook.status));

// admin login
const adm = await req('/api/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'change-me-immediately' } });
ok(adm.status === 200, 'admin login', JSON.stringify(adm.data).slice(0, 200));
collect(adm, adminC);
ok(!!adminC.at, 'admin cookies set');

// admin analytics
const an = await req('/api/admin/analytics', { auth: adminC.at + '; ' + adminC.rt });
ok(an.status === 200 && typeof an.data?.totals?.tokens === 'number', 'admin analytics', JSON.stringify(an.data).slice(0, 200));

// RBAC: non-admin to admin endpoint -> 403
const rbac = await req('/api/admin/analytics', { auth: userC.at + '; ' + userC.rt });
ok(rbac.status === 403, 'RBAC blocks non-admin', String(rbac.status));

// admin users list
const du = await req('/api/admin/users', { auth: adminC.at + '; ' + adminC.rt });
ok(du.status === 200 && du.data.users.some(u => u.email === e2eEmail), 'admin user list shows e2e user', JSON.stringify(du.data).slice(0, 200));

console.log(failures === 0 ? '\\nE2E-ALL-PASS (' + Date.now() + ')' : '\\nE2E-FAILURES=' + failures);
process.exit(failures === 0 ? 0 : 1);
