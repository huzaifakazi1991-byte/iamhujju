import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { z } from 'zod';
import { revokeAllSessions } from '@/lib/auth';

const schema = z.object({
  suspended: z.boolean().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req, schema);
    if (id === admin.id && (body.suspended || body.role === 'USER')) {
      return fail(400, 'You cannot suspend or demote your own admin account.');
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return fail(404, 'User not found.');
    const updated = await prisma.user.update({ where: { id }, data: body });
    if (body.suspended) await revokeAllSessions(id);
    await prisma.adminAction.create({ data: { adminId: admin.id, action: body.suspended !== undefined ? 'suspend_user' : 'update_user', targetType: 'user', targetId: id, details: body as unknown as Prisma.InputJsonValue } });
    return ok({ user: { id: updated.id, email: updated.email, role: updated.role, suspended: updated.suspended } });
  } catch (err) { return handleError(err); }
}
