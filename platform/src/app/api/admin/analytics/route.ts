import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin } from '@/lib/api';

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('days') ?? 14)));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const perDay = await prisma.$queryRaw<{ day: Date; tokens: bigint; requests: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, SUM("totalTokens") AS tokens, COUNT(*) AS requests
      FROM "UsageRecord" WHERE "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1 ASC`;
    const perModel = await prisma.$queryRaw<{ "modelId": string; slug: string; displayName: string; tokens: bigint; requests: bigint }[]>`
      SELECT u."modelId", m.slug, m."displayName", u.tokens, u.requests FROM (
        SELECT "modelId", SUM("totalTokens") AS tokens, COUNT(*) AS requests
        FROM "UsageRecord" WHERE "createdAt" >= ${since}
        GROUP BY "modelId" ORDER BY tokens DESC LIMIT 20
      ) u JOIN "Model" m ON m.id = u."modelId"`;
    const perUser = await prisma.$queryRaw<{ "userId": string; email: string; tokens: bigint; requests: bigint }[]>`
      SELECT u."userId", us.email, u.tokens, u.requests FROM (
        SELECT "userId", SUM("totalTokens") AS tokens, COUNT(*) AS requests
        FROM "UsageRecord" WHERE "createdAt" >= ${since}
        GROUP BY "userId" ORDER BY tokens DESC LIMIT 20
      ) u JOIN "User" us ON us.id = u."userId"`;
    const totals = await prisma.usageRecord.aggregate({ _sum: { totalTokens: true, cost: true }, _count: true, where: { createdAt: { gte: since } } });
    const userCount = await prisma.user.count();
    const paidSubs = await prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] }, Plan: { isFree: false } } });
    const paymentAgg = await prisma.payment.aggregate({
      _sum: { amount: true }, _count: true,
      where: { status: 'succeeded', createdAt: { gte: since } },
    });

    return ok({
      days,
      totals: { tokens: Number(totals._sum.totalTokens ?? 0), cost: String(totals._sum.cost ?? 0), requests: totals._count, userCount, paidSubs, revenueInrPaise: Number(paymentAgg._sum.amount ?? 0), payments: paymentAgg._count },
      perDay: perDay.map((d) => ({ day: d.day.toISOString().slice(0, 10), tokens: Number(d.tokens), requests: Number(d.requests) })),
      perModel: perModel.map((m) => ({ modelId: m.modelId, slug: m.slug, displayName: m.displayName, tokens: Number(m.tokens), requests: Number(m.requests) })),
      perUser: perUser.map((u) => ({ userId: u.userId, email: u.email, tokens: Number(u.tokens), requests: Number(u.requests) })),
    });
  } catch (err) { return handleError(err); }
}
