import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { modelUpsertSchema } from '@/lib/validation';

export async function GET() {
  try {
    await requireAdmin();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [models, usage] = await Promise.all([
      prisma.model.findMany({
        include: { Provider: { select: { name: true, enabled: true, lastTestAt: true, lastTestOk: true, lastTestDetail: true } } },
        orderBy: [{ displayOrder: 'asc' }, { displayName: 'asc' }],
      }),
      prisma.usageRecord.groupBy({
        by: ['modelId', 'status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { totalTokens: true },
        _avg: { latencyMs: true },
      }),
    ]);

    const statsByModel = new Map<string, { requests24h: number; tokens24h: number; errors24h: number; latencySum: number; latencyCount: number }>();
    for (const row of usage) {
      const s = statsByModel.get(row.modelId) ?? { requests24h: 0, tokens24h: 0, errors24h: 0, latencySum: 0, latencyCount: 0 };
      s.requests24h += row._count._all;
      s.tokens24h += Number(row._sum.totalTokens ?? 0);
      if (row.status === 'error') s.errors24h += row._count._all;
      if (row._avg.latencyMs != null) {
        s.latencySum += row._avg.latencyMs * row._count._all;
        s.latencyCount += row._count._all;
      }
      statsByModel.set(row.modelId, s);
    }

    return ok({
      models: models.map((m) => {
        const s = statsByModel.get(m.id);
        return {
          ...m,
          providerName: m.Provider.name,
          providerHealth: {
            enabled: m.Provider.enabled,
            lastTestAt: m.Provider.lastTestAt,
            lastTestOk: m.Provider.lastTestOk,
            lastTestDetail: m.Provider.lastTestDetail,
          },
          stats: {
            requests24h: s?.requests24h ?? 0,
            tokens24h: s?.tokens24h ?? 0,
            errors24h: s?.errors24h ?? 0,
            avgLatencyMs: s && s.latencyCount > 0 ? Math.round(s.latencySum / s.latencyCount) : null,
          },
        };
      }),
    });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson(req, modelUpsertSchema);
    const existing = await prisma.model.findUnique({ where: { slug: body.slug } });
    if (existing) return fail(409, `Model "${body.slug}" already exists. Edit it instead.`);
    const created = await prisma.model.create({ data: body });
    await prisma.adminAction.create({ data: { adminId: admin.id, action: 'create_model', targetType: 'model', targetId: created.id, details: { slug: created.slug } } });
    return ok({ model: created });
  } catch (err) { return handleError(err); }
}
