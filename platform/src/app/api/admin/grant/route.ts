import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { z } from 'zod';
import { creditTokens } from '@/lib/gateway/run';

const schema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(-1_000_000_000).max(1_000_000_000),
});

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const { userId, amount } = await readJson(req, schema);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return fail(404, 'User not found.');
    const balance = await creditTokens(userId, amount, 'admin_grant', admin.id);
    await prisma.adminAction.create({ data: { adminId: admin.id, action: 'grant_tokens', targetType: 'user', targetId: userId, details: { amount } } });
    return ok({ available: Number(balance.available) });
  } catch (err) { return handleError(err); }
}
