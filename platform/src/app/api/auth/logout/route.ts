import { cookies } from 'next/headers';
import { accessCookieName, refreshCookieName, revokeSession } from '@/lib/auth';
import { handleError, ok } from '@/lib/api';

export async function POST() {
  try {
    const store = await cookies();
    const refresh = store.get(refreshCookieName())?.value;
    if (refresh) await revokeSession(refresh);
    const res = ok({ ok: true });
    res.cookies.set(accessCookieName(), '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
    res.cookies.set(refreshCookieName(), '', { httpOnly: true, sameSite: 'lax', path: '/api/auth', maxAge: 0 });
    return res;
  } catch (err) { return handleError(err); }
}
