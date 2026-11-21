import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { hashPassword, issueSession, accessCookieName, refreshCookieName } from '@/lib/auth';
import { signupSchema } from '@/lib/validation';
import { handleError, ok, fail, readJson } from '@/lib/api';
import { checkIpLimit } from '@/lib/rate-limit';
import { issueOtp } from '@/lib/otp';
import { mailConfigured } from '@/lib/mail';

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const ipLimit = await checkIpLimit(`signup:${ip}`, 10);
    if (!ipLimit.allowed) return fail(429, 'Too many sign-up attempts. Please retry shortly.');

    const { email, password, name } = await readJson(req, signupSchema);

    const signups = await prisma.platformSetting.findUnique({ where: { key: 'toggle:signupsEnabled' } });
    if (signups && signups.value === false) return fail(503, 'Sign-ups are currently disabled by the administrator.');

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail(409, 'An account with this email already exists. Try signing in.');

    const user = await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password) },
    });
    await prisma.tokenBalance.create({ data: { userId: user.id } });

    const mailReady = mailConfigured();
    if (mailReady) {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: null } });
      await issueOtp(user.id, user.email, user.name);
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    }

    const session = await issueSession({ id: user.id, email: user.email, role: user.role });
    const res = ok({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: !mailReady },
      needsVerification: mailReady,
    });
    const secure = env.isProd;
    res.cookies.set(accessCookieName(), session.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: session.accessMaxAge });
    res.cookies.set(refreshCookieName(), session.refreshPlain, { httpOnly: true, sameSite: 'lax', secure, path: '/api/auth', maxAge: session.refreshMaxAge });
    return res;
  } catch (err) { return handleError(err); }
}
