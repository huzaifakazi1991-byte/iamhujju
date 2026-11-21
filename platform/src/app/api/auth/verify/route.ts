import { prisma } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { handleError, ok, fail } from '@/lib/api';
import { z } from 'zod';
import { verifyOtp } from '@/lib/otp';

const codeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
});

export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    if (!token) return fail(400, 'Missing verification token.');
    const row = await prisma.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.expiresAt < new Date()) return fail(400, 'This verification link is invalid or has expired.');
    await prisma.user.update({ where: { id: row.userId }, data: { emailVerified: new Date() } });
    await prisma.verificationToken.delete({ where: { id: row.id } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const { email, code } = await codeSchema.parseAsync(await req.json().catch(() => ({})));
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return fail(400, 'That code does not match. Please check and retry.');
    if (user.emailVerified) return ok({ ok: true, alreadyVerified: true });
    const okResult = await verifyOtp(user.id, code);
    if (!okResult) return fail(400, 'That code is wrong or has expired. Request a new code.');
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
