import { prisma } from '@/lib/db';
import { handleError, ok, fail } from '@/lib/api';
import { z } from 'zod';
import { issueOtp } from '@/lib/otp';
import { mailConfigured } from '@/lib/mail';
import { checkIpLimit } from '@/lib/rate-limit';

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const ipKey = `otp:${ip}:${req.headers.get('user-agent')?.slice(0, 40) ?? ''}`;
    const limit = await checkIpLimit(ipKey, 5);
    if (!limit.allowed) return fail(429, 'Too many code requests. Please wait a few minutes.');

    const { email } = await schema.parseAsync(await req.json().catch(() => ({})));
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified || !mailConfigured()) {
      return ok({ ok: true });
    }
    const { sent } = await issueOtp(user.id, user.email, user.name);
    if (!sent) return fail(503, 'Could not send the verification email right now. Please retry shortly.');
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
