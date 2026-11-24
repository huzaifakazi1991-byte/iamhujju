import { prisma } from '@/lib/db';
import { fail, handleError, ok, requireAdmin } from '@/lib/api';

/**
 * DELETE /api/admin/catalog — bulk purge of the whole AI catalog:
 * every provider and every model. Billing history (UsageRecord) and user
 * balances are preserved; usage rows keep their model slug for reporting
 * and their modelId link is simply detached. Conversations are untied from
 * deleted models (the next message uses the currently selected model).
 * Requires a typed confirmation from the admin UI.
 */
export async function DELETE(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== 'DELETE') {
      return fail(400, 'Type DELETE to confirm purging all providers and models.');
    }

    const [providerCount, modelCount] = await Promise.all([
      prisma.provider.count(),
      prisma.model.count(),
    ]);

    const detachedUsage = await prisma.usageRecord.updateMany({ data: { modelId: null } });
    const detachedConversations = await prisma.conversation.updateMany({ data: { modelId: null } });
    const deletedModels = await prisma.model.deleteMany({});
    const deletedProviders = await prisma.provider.deleteMany({});

    await prisma.adminAction.create({
      data: {
        adminId: admin.id,
        action: 'purge_catalog',
        targetType: 'provider',
        targetId: 'all',
        details: { providers: deletedProviders.count, models: deletedModels.count },
      },
    });

    return ok({
      ok: true,
      providers: deletedProviders.count,
      models: deletedModels.count,
      usageDetached: detachedUsage.count,
      conversationsUntied: detachedConversations.count,
      expectedProviders: providerCount,
      expectedModels: modelCount,
    });
  } catch (err) {
    return handleError(err);
  }
}
