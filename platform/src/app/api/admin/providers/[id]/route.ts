import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { providerUpdateSchema } from '@/lib/validation';
import { encryptSecret } from '@/lib/crypto';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req, providerUpdateSchema);
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) return fail(404, 'Provider not found.');

    const data: { enabled?: boolean; baseUrl?: string | null; encryptedKey?: string } = {};
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
    if (body.baseUrl !== undefined) data.baseUrl = body.baseUrl || null;
    if (body.apiKey) data.encryptedKey = encryptSecret(body.apiKey);

    const updated = await prisma.provider.update({ where: { id }, data });
    await prisma.adminAction.create({
      data: { adminId: admin.id, action: 'update_provider', targetType: 'provider', targetId: id, details: { setKey: Boolean(body.apiKey), enabled: updated.enabled } },
    });
    return ok({ provider: { id: updated.id, name: updated.name, enabled: updated.enabled, keyConfigured: Boolean(updated.encryptedKey) } });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const inUse = await prisma.model.count({ where: { providerId: id, adminEnabled: true } });
    if (inUse > 0) return fail(409, 'Disable or remove this provider\u2019s models first.');
    await prisma.provider.delete({ where: { id } });
    await prisma.adminAction.create({ data: { adminId: admin.id, action: 'delete_provider', targetType: 'provider', targetId: id } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
