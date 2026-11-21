import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { verifyPassword, issueSession, accessCookieName, refreshCookieName } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { handleError, ok, fail, readJson } from '@/lib/api';
import { checkIpLimit } from '@/lib/rate-limit';
import { mailConfigured } from '@/lib/mail';

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const ipLimit = await checkIpLimit(`login:${ip}`, 20);
    if (!ipLimit.allowed) return fail(429, 'Too many sign-in attempts. Please retry shortly.');

    const { email, password } = await readJson(req, loginSchema);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return fail(401, 'Incorrect email or password.');
    }
    if (user.suspended) return fail(403, 'This account is suspended. Contact support.');

    const session = await issueSession({ id: user.id, email: user.email, role: user.role });
    const res = ok({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: Boolean(user.emailVerified) },
      needsVerification: !user.emailVerified && mailConfigured(),
    });
    const secure = env.isProd;
    res.cookies.set(accessCookieName(), session.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: session.accessMaxAge });
    res.cookies.set(refreshCookieName(), session.refreshPlain, { httpOnly: true, sameSite: 'lax', secure, path: '/api/auth', maxAge: session.refreshMaxAge });
    return res;
  } catch (err) { return handleError(err); }
}
