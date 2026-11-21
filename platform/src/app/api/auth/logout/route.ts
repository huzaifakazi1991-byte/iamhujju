import { cookies } from 'next/headers';
import { refreshCookieName, revokeSession } from '@/lib/auth';
import { handleError, ok } from '@/lib/api';

export async function POST() {
  try {
    const store = await cookies();
    const refresh = store.get(refreshCookieName())?.value;
    if (refresh) await revokeSession(refresh);
    const res = ok({ ok: true });
    res.cookies.set(refreshCookieName(), '', { httpOnly: true, path: '/api/auth', maxAge: 0 });
    return res;
  } catch (err) { return handleError(err); }
}
