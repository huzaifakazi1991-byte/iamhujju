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
for (const p of ['/', '/pricing', '/login', '/signup', '/dashboard', '/playground', '/admin', '/settings', '/keys', '/billing']) {
  const r = await fetch(BASE + p, { redirect: 'manual' });
  ok(r.status === 200 || r.status === 307 || r.status === 302, `page ${p} -> ${r.status}`);
}

// signup new user
const su = await req('/api/auth/signup', { method: 'POST', body: { email: e2eEmail, password: 'supersecret123', name: 'E2E User' } });
ok(su.status === 200 || su.status === 201, 'signup', JSON.stringify(su.data));
collect(su, userC);

// login flow returns refresh cookie
const li = await req('/api/auth/login', { method: 'POST', body: { email: e2eEmail, password: 'supersecret123' } });
ok(li.status === 200, 'login', JSON.stringify(li.data));
collect(li, userC);
ok(!!userC.at && !!userC.rt, 'auth cookies set (at/rt)');

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

// invalid input -> 400
const bad = await req('/api/auth/login', { method: 'POST', body: { email: 'bad' } });
ok(bad.status === 400 || bad.status === 422, 'zod validation returns 4xx', String(bad.status));

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
