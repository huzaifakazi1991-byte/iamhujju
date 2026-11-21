import { prisma } from '@/lib/db';
import { handleError, ok, requireUser } from '@/lib/api';
import { resolvePlan } from '@/lib/gateway/run';

export async function GET() {
  try {
    const actor = await requireUser();
    const plan = actor.role === 'ADMIN' ? null : await resolvePlan(actor.id);
    const models = await prisma.model.findMany({
      where: { adminEnabled: true, Provider: { enabled: true } },
      include: { Provider: { select: { name: true } } },
      orderBy: [{ displayOrder: 'asc' }, { displayName: 'asc' }],
    });
    const allowed = plan && plan.allowedModels.length > 0 ? plan.allowedModels : null;
    const result = models
      .filter((m) => !allowed || allowed.includes(m.slug))
      .map((m) => ({
        id: m.id,
        slug: m.slug,
        displayName: m.displayName,
        provider: m.Provider.name,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        tierRequired: m.tierRequired,
      }));
    return ok({ models: result, planSlug: plan?.slug ?? 'admin' });
  } catch (err) { return handleError(err); }
}
