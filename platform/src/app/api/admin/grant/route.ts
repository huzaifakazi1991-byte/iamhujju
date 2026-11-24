import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { z } from 'zod';
import { creditTokens } from '@/lib/gateway/run';

/**
 * Admin credit control.
 * - `amount`: signed delta (+add / −reduce), clamped so the balance never goes below 0.
 * - `setTo`: set the balance to an exact value ≥ 0 (the delta is computed server-side).
 * Exactly one of `amount` / `setTo` must be provided. Every change is audited in AdminAction.
 */
const schema = z
  .object({
    userId: z.string().min(1),
    amount: z.number().int().min(-1_000_000_000).max(1_000_000_000).optional(),
    setTo: z.number().int().min(0).max(1_000_000_000).optional(),
  })
  .refine((d) => (d.amount !== undefined) !== (d.setTo !== undefined), {
    message: 'Provide exactly one of: amount, setTo',
  });

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const { userId, amount, setTo } = await readJson(req, schema);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return fail(404, 'User not found.');

    const current = Number((await prisma.tokenBalance.findUnique({ where: { userId } }))?.available ?? 0);

    // Full control, but never below zero: reducing more than the balance zeroes it out.
    const delta = setTo !== undefined ? setTo - current : Math.max(amount as number, -current);

    if (delta === 0) return ok({ available: current, unchanged: true });

    const action = delta >= 0 ? 'grant_tokens' : 'reduce_tokens';
    const balance = await creditTokens(userId, delta, action, admin.id);
    await prisma.adminAction.create({
      data: {
        adminId: admin.id,
        action,
        targetType: 'user',
        targetId: userId,
        details: { delta, requestedDelta: amount ?? null, setTo: setTo ?? null },
      },
    });
    return ok({ available: Number(balance.available) });
  } catch (err) { return handleError(err); }
}
