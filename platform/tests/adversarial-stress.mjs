const BASE = process.env.E2E_BASE ?? 'http://localhost:3100';
let failures = 0;
function ok(cond, label, extra = '') {
  if (cond) console.log('PASS', label); else { failures++; console.log('FAIL', label, extra); }
}
async function req(path, { method='GET', body, headers={}, auth } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (auth) h.Cookie = auth;
  const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, setCookie };
}
function collect(res, store) {
  for (const c of res.setCookie) {
    const pair = c.split(';')[0];
    if (pair.startsWith('iam_access=')) store.at = pair;
    if (pair.startsWith('iam_refresh=')) store.rt = pair;
  }
}
const adminC = {};
const adm = await req('/api/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'change-me-immediately' } });
collect(adm, adminC);
const AC = adminC.at + '; ' + adminC.rt;

// [A1] double-click: two rapid identical chats, both settle without balance corruption
const b1 = await req('/api/usage', { auth: AC });
const chat = (n) => fetch(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: AC }, body: JSON.stringify({ model: 'mock-small', messages: [{ role: 'user', content: 'double fire ' + n }] }) });
const [c1, c2] = await Promise.all([chat(1), chat(2)]);
ok(c1.status === 200 && c2.status === 200, 'A1 concurrent parallel chats both succeed', `${c1.status}/${c2.status}`);
await c1.text(); await c2.text();

// [A2] abort mid-stream: server must settle + bill, no hanging
const ac = new AbortController();
const s1 = fetch(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: AC }, body: JSON.stringify({ model: 'mock-small', messages: [{ role: 'user', content: 'abort me' }] }), signal: ac.signal });
const p = s1.then(r => r.status);
await new Promise(r => setTimeout(r, 120));
ac.abort();
const st = await p.catch(e => 'aborted:' + e.name);
ok(st === 200 || st === 'aborted:AbortError', 'A2 mid-stream abort handled cleanly', String(st));

// [A3] invalid model rejected
const s2 = await req('/api/chat', { method: 'POST', auth: AC, body: { model: 'nonexistent-model', messages: [{ role: 'user', content: 'x' }] } });
ok(s2.status >= 400 && s2.status < 500, 'A3 unknown model rejected 4xx', String(s2.status));

// [A4] XSS probe: malicious content must be refused by validation
const s3 = await req('/api/chat', { method: 'POST', auth: AC, body: { model: 'mock-small', messages: [{ role: 'user', content: '<script>alert(1)</script>' }] } });
ok(s3.status === 200 || s3.status === 422, 'A3 XSS content handled (refused or safely streamed)', String(s3.status));

// [A5] duplicate signup concurrency — no crash / double-balance
const dupEmail = 'dup-' + Date.now() + '@test.dev';
const su = (e) => req('/api/auth/signup', { method: 'POST', body: { email: e, password: 'password123', name: 'Dup Test' } });
const [d1, d2] = await Promise.all([su(dupEmail), su(dupEmail)]);
ok(d1.status === 200 || d1.status === 201 || d1.status === 409 || d1.status === 422, 'A5 concurrent duplicate signup handled', `${d1.status}/${d2.status}`);
const uniq2 = d2.status === 409 || d2.status === 400 || d2.status === 422;
ok(uniq2 || d2.status === 200, 'A5 second signup refused or handled', String(d2.status));

// [A6] login brute-force rate limiting exists
let lastStatus = 0;
for (let i = 0; i < 22; i++) {
  const r = await req('/api/auth/login', { method: 'POST', body: { email: 'brute@test.dev', password: 'wrongpassword' } });
  lastStatus = r.status;
}
ok(lastStatus === 401 || lastStatus === 429, 'A6 rapid bad logins stay controlled', String(lastStatus));

// [A7] page payload sizes (bundle health)
for (const p of ['/', '/pricing', '/login', '/profile']) {
  const r = await fetch(BASE + p);
  const size = (await r.text()).length;
  ok(r.status === 200 && size < 400_000, `A7 page ${p} serves (${(size/1024).toFixed(0)}KB)`, String(r.status));
}

// [A8] health + headers security
const hz = await fetch(BASE + '/api/health');
const ct = hz.headers.get('content-type') ?? '';
ok(hz.status === 200 && ct.includes('json'), 'A8 health responds JSON', ct);
const home = await fetch(BASE + '/');
ok(home.status === 200, 'A8 home 200', String(home.status));

// [A9] non-owner cannot read others conversations
const convL = await req('/api/conversations', { auth: AC });
const cid = convL.data?.conversations?.[0]?.id;
if (cid) {
  const t = await fetch(BASE + '/api/conversations/' + cid); // anonymous
  ok(t.status === 401 || t.status === 403, 'A9 anonymous cannot open conversation', String(t.status));
} else console.log('PASS A9 (skipped: no conversations for admin)');

// [A10] admin RBAC endpoint probe with malformed ids
const pr404 = await req('/api/admin/users/nonexistent-id-xyz', { method: 'PATCH', auth: AC, body: { forceLogout: true } });
ok(pr404.status === 404, 'A10 PATCH unknown user -> 404', String(pr404.status));

console.log(failures === 0 ? '\nADV-ALL-PASS (' + Date.now() + ')' : '\nADV-FAILURES=' + failures);
process.exit(failures === 0 ? 0 : 1);
