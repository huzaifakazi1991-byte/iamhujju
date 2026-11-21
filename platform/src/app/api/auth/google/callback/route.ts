import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { issueSession, accessCookieName, refreshCookieName } from '@/lib/auth';
import { fail } from '@/lib/api';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const store = await cookies();
  const expected = store.get('oauth_state')?.value;
  if (!code || !state || !expected || state !== expected) return fail(400, 'Invalid OAuth state.');
  if (!env.googleClientId || !env.googleClientSecret) return fail(501, 'Google sign-in is not configured.');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: `${env.appUrl}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return fail(502, 'Google token exchange failed.');
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return fail(502, 'Google did not return an access token.');

  const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!profileRes.ok) return fail(502, 'Could not load Google profile.');
  const profile = (await profileRes.json()) as { sub: string; email?: string; name?: string; email_verified?: boolean };
  if (!profile.email) return fail(400, 'Google account has no email.');

  const email = profile.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: profile.name ?? null,
        emailVerified: profile.email_verified ? new Date() : null,
      },
    });
    await prisma.tokenBalance.create({ data: { userId: user.id } });
    await prisma.account.create({
      data: { userId: user.id, provider: 'google', providerId: profile.sub },
    });
  } else {
    await prisma.account.upsert({
      where: { provider_providerId: { provider: 'google', providerId: profile.sub } },
      update: {},
      create: { userId: user.id, provider: 'google', providerId: profile.sub },
    });
  }

  const home = NextHome(user.suspended);
  const session = await issueSession({ id: user.id, email: user.email, role: user.role });
  const secure = env.isProd;
  const res = NextHome(user.suspended) as unknown as Response;
  void home;
  res.headers.append('set-cookie', `iam_access=${session.accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${session.accessMaxAge}${secure ? '; Secure' : ''}`);
  res.headers.append('set-cookie', `iam_refresh=${session.refreshPlain}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${session.refreshMaxAge}${secure ? '; Secure' : ''}`);
  return res;
}

function NextHome(suspended: boolean): Response {
  const url = suspended ? `${env.appUrl}/login?suspended=1` : `${env.appUrl}/playground`;
  return new Response(null, { status: 302, headers: { Location: url } });
}
