import { prisma } from '@/lib/db';
import { fail, handleError, requireUser } from '@/lib/api';
import { resolvePlan } from '@/lib/gateway/run';

export async function GET() {
  try {
    const actor = await requireUser();
    const plan = await resolvePlan(actor.id);
    if (!plan || plan.isFree) {
      return fail(403, 'Usage export is available on paid plans. Upgrade to download your CSV.');
    }

    const records = await prisma.usageRecord.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        id: true, promptTokens: true, completionTokens: true, totalTokens: true,
        cost: true, status: true, latencyMs: true, createdAt: true,
        Model: { select: { slug: true, displayName: true } },
      },
    });

    const esc = (v: string | number | null) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const rows = [
      'id,created_at,model,model_name,prompt_tokens,completion_tokens,total_tokens,cost,status,latency_ms',
      ...records.map((r) => [
        r.id,
        r.createdAt.toISOString(),
        esc(r.Model?.slug ?? ''),
        esc(r.Model?.displayName ?? ''),
        r.promptTokens,
        r.completionTokens,
        r.totalTokens,
        r.cost.toString(),
        r.status,
        r.latencyMs === null ? '' : r.latencyMs,
      ].join(',')),
    ];

    const date = new Date().toISOString().slice(0, 10);
    return new Response(rows.join('\n') + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="iamhujju-usage-${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
