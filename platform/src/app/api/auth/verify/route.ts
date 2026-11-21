import { prisma } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { handleError, ok, fail } from '@/lib/api';

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
