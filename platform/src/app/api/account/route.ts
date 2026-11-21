import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleError, ok, requireUser, readJson, fail } from '@/lib/api';
import { resolvePlan } from '@/lib/gateway/run';

const schema = z.object({
  name: z.string().trim().max(120).optional().nullable(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  bio: z.string().trim().max(600).optional().nullable(),
  avatarUrl: z.string().startsWith('data:image/', 'Avatar must be an image.').max(900_000, 'Picture is too large (max ~900 KB after resize).').optional().nullable(),
});

export async function GET() {
  try {
    const actor = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        id: true, email: true, name: true, role: true, emailVerified: true, createdAt: true,
        birthday: true, country: true, bio: true, avatarUrl: true,
        balance: { select: { available: true, lifetimeUsed: true } },
      },
    });
    if (!user) return fail(401, 'Account not found.');
    const plan = await resolvePlan(actor.id);
    const payments = await prisma.payment.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, amount: true, currency: true, status: true, tokensGranted: true, createdAt: true },
    });
    return ok({
      profile: {
        id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: Boolean(user.emailVerified),
        memberSince: user.createdAt, birthday: user.birthday, country: user.country, bio: user.bio, avatarUrl: user.avatarUrl,
      },
      plan: plan ? { slug: plan.slug, name: plan.name, dailyTokens: plan.dailyTokens, monthlyTokens: plan.monthlyTokens, isFree: plan.isFree } : null,
      tokens: { available: Number(user.balance?.available ?? 0), lifetimeUsed: Number(user.balance?.lifetimeUsed ?? 0) },
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    });
  } catch (err) { return handleError(err); }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requireUser();
    const body = await readJson(req, schema);
    const data: Record<string, unknown> = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.country !== undefined ? { country: body.country } : {}),
      ...(body.bio !== undefined ? { bio: body.bio } : {}),
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      ...(body.birthday !== undefined ? { birthday: body.birthday ? new Date(`${body.birthday}T00:00:00.000Z`) : null } : {}),
    };
    const user = await prisma.user.update({
      where: { id: actor.id },
      data,
      select: { id: true, email: true, name: true, birthday: true, country: true, bio: true, avatarUrl: true },
    });
    return ok({ user });
  } catch (err) { return handleError(err); }
}
