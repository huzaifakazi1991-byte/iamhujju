import { cookies } from 'next/headers';
import { accessCookieName, refreshCookieName, rotateSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { handleError, fail, ok } from '@/lib/api';

export async function POST() {
  try {
    const store = await cookies();
    const refresh = store.get(refreshCookieName())?.value;
    if (!refresh) return fail(401, 'No session to refresh.');
    const rotated = await rotateSession(refresh);
    if (!rotated) return fail(401, 'Session expired. Please sign in again.');
    const res = ok({ ok: true });
    const secure = env.isProd;
    res.cookies.set(accessCookieName(), rotated.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: rotated.accessMaxAge });
    res.cookies.set(refreshCookieName(), rotated.refreshPlain, { httpOnly: true, sameSite: 'lax', secure, path: '/api/auth', maxAge: rotated.refreshMaxAge });
    return res;
  } catch (err) { return handleError(err); }
}
