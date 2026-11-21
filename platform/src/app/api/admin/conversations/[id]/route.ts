import { prisma } from '@/lib/db';
import { handleError, ok, fail, requireAdmin } from '@/lib/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true, title: true, createdAt: true, updatedAt: true,
        User: { select: { id: true, email: true, name: true, suspended: true, createdAt: true } },
        Model: { select: { slug: true, displayName: true } },
        messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, tokensIn: true, tokensOut: true, createdAt: true } },
      },
    });
    if (!conversation) return fail(404, 'Conversation not found.');
    return ok({ conversation });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const conversation = await prisma.conversation.findUnique({ where: { id }, select: { userId: true, title: true } });
    if (!conversation) return fail(404, 'Conversation not found.');
    await prisma.conversation.delete({ where: { id } });
    await prisma.adminAction.create({ data: { adminId: admin.id, action: 'delete_conversation', targetType: 'conversation', targetId: id, details: { ownerUserId: conversation.userId, title: conversation.title } } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
