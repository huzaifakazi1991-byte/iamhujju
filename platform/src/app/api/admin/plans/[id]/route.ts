import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { planUpdateSchema } from '@/lib/validation';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req, planUpdateSchema);
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) return fail(404, 'Plan not found.');
    const updated = await prisma.plan.update({ where: { id }, data: body });
    await prisma.adminAction.create({ data: { adminId: admin.id, action: 'update_plan', targetType: 'plan', targetId: id, details: body as unknown as Prisma.InputJsonValue } });
    return ok({ plan: updated });
  } catch (err) { return handleError(err); }
}
