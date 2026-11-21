import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { z } from 'zod';
import { revokeAllSessions } from '@/lib/auth';

const schema = z.object({
  suspended: z.boolean().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  forceLogout: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await readJson(req, schema);
    if (id === admin.id && (body.suspended || body.forceLogout || body.role === 'USER')) {
      return fail(400, 'You cannot suspend, terminate or demote your own admin account.');
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return fail(404, 'User not found.');

    if (body.forceLogout) {
      await revokeAllSessions(id);
      await prisma.adminAction.create({ data: { adminId: admin.id, action: 'force_logout', targetType: 'user', targetId: id, details: { email: user.email } } });
      if (body.suspended === undefined && body.role === undefined) {
        return ok({ user: { id: user.id, email: user.email, role: user.role, suspended: user.suspended }, loggedOut: true });
      }
    }

    const data: { suspended?: boolean; role?: 'USER' | 'ADMIN' } = {};
    if (body.suspended !== undefined) data.suspended = body.suspended;
    if (body.role !== undefined) data.role = body.role;
    const updated = await prisma.user.update({ where: { id }, data });
    if (body.suspended) await revokeAllSessions(id);
    await prisma.adminAction.create({ data: { adminId: admin.id, action: body.suspended !== undefined ? 'suspend_user' : 'update_user', targetType: 'user', targetId: id, details: data as Prisma.InputJsonValue } });
    return ok({ user: { id: updated.id, email: updated.email, role: updated.role, suspended: updated.suspended } });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    if (id === admin.id) return fail(400, 'You cannot delete your own admin account.');
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return fail(404, 'User not found.');
    if (user.role === 'ADMIN') return fail(400, 'Demote this admin to USER before deleting.');

    await prisma.$transaction([
      prisma.usageRecord.deleteMany({ where: { userId: id } }),
      prisma.payment.deleteMany({ where: { userId: id } }),
      prisma.subscription.deleteMany({ where: { userId: id } }),
      prisma.tokenLedger.deleteMany({ where: { userId: id } }),
      prisma.rateLimit.deleteMany({ where: { userId: id } }),
      prisma.apiKey.deleteMany({ where: { userId: id } }),
      prisma.tokenBalance.deleteMany({ where: { userId: id } }),
      prisma.conversation.deleteMany({ where: { userId: id } }),
      prisma.verificationToken.deleteMany({ where: { userId: id } }),
      prisma.account.deleteMany({ where: { userId: id } }),
      prisma.session.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);
    await prisma.adminAction.create({ data: { adminId: admin.id, action: 'delete_user', targetType: 'user', targetId: id, details: { email: user.email } } });
    return ok({ ok: true, deleted: user.email });
  } catch (err) { return handleError(err); }
}
