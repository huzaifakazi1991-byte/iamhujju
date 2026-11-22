import { handleError, ok, requireAdmin, fail } from '@/lib/api';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    try {
      const deleted = await prisma.groupMessage.delete({ where: { id } });
      await prisma.adminAction.create({ data: { adminId: admin.id, action: 'delete_group_message', targetType: 'group_message', targetId: id, details: { senderId: deleted.senderId } as Prisma.InputJsonValue } });
      return ok({ ok: true, deleted: id });
    } catch {
      return fail(404, 'Message not found.');
    }
  } catch (err) { return handleError(err); }
}
