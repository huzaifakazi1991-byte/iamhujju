import { env } from '@/lib/env';

export async function GET(req: Request) {
  if (!env.googleClientId || !env.googleClientSecret) {
    return new Response(null, { status: 302, headers: { Location: `${env.appUrl}/login?error=google_not_configured` } });
  }
  const redirectUri = `${env.appUrl}/api/auth/google/callback`;
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  const res = Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
  const withState = new Response(null, { status: 302, headers: res.headers });
  withState.headers.append('set-cookie', `oauth_state=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600`);
  return withState;
}
