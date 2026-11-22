import { env } from '@/lib/env';
import { ok } from '@/lib/api';

export async function GET() {
  return ok({ configured: Boolean(env.googleClientId) && Boolean(env.googleClientSecret) });
}
