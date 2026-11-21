import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { modelUpsertSchema } from '@/lib/validation';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req, modelUpsertSchema.partial());
    const model = await prisma.model.findUnique({ where: { id } });
    if (!model) return fail(404, 'Model not found.');
    const updated = await prisma.model.update({ where: { id }, data: body });
    await prisma.adminAction.create({ data: { adminId: admin.id, action: 'update_model', targetType: 'model', targetId: id, details: body as unknown as Prisma.InputJsonValue } });
    return ok({ model: updated });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    await prisma.model.deleteMany({ where: { id } });
    await prisma.adminAction.create({ data: { adminId: admin.id, action: 'delete_model', targetType: 'model', targetId: id } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
