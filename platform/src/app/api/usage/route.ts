import { prisma } from '@/lib/db';
import { handleError, ok, requireUser } from '@/lib/api';
import { resolvePlan } from '@/lib/gateway/run';
import { nowUtcDayStart } from '@/lib/tokens';

export async function GET() {
  try {
    const actor = await requireUser();
    const plan = await resolvePlan(actor.id);
    const balance = await prisma.tokenBalance.findUnique({ where: { userId: actor.id } });
    const dayStart = nowUtcDayStart();
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const today = await prisma.usageRecord.aggregate({ _sum: { totalTokens: true }, where: { userId: actor.id, createdAt: { gte: dayStart } } });
    const month = await prisma.usageRecord.aggregate({ _sum: { totalTokens: true }, where: { userId: actor.id, createdAt: { gte: monthStart } } });
    const lifetime = await prisma.usageRecord.aggregate({ _sum: { totalTokens: true }, where: { userId: actor.id } });
    const perModel = await prisma.usageRecord.groupBy({
      by: ['modelId'],
      _sum: { totalTokens: true },
      where: { userId: actor.id, createdAt: { gte: dayStart } },
    });
    return ok({
      available: balance ? Number(balance.available) : 0,
      reserved: balance ? Number(balance.reserved) : 0,
      lifetimeUsed: balance ? Number(balance.lifetimeUsed) : 0,
      todayTokens: Number(today._sum.totalTokens ?? 0),
      monthTokens: Number(month._sum.totalTokens ?? 0),
      lifetimeTokens: Number(lifetime._sum.totalTokens ?? 0),
      perModel: perModel.map((r) => ({ modelId: r.modelId, tokens: Number(r._sum.totalTokens ?? 0) })),
      plan: plan ? { slug: plan.slug, name: plan.name, dailyTokens: plan.dailyTokens, monthlyTokens: plan.monthlyTokens, requestsPerMin: plan.requestsPerMin, isFree: plan.isFree } : null,
    });
  } catch (err) { return handleError(err); }
}
