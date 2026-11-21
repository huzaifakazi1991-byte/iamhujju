import { prisma } from '@/lib/db';
import { handleError, ok, requireUser, fail, readJson } from '@/lib/api';
import { conversationTruncateSchema } from '@/lib/validation';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await ctx.params;
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: actor.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, tokensIn: true, tokensOut: true, createdAt: true } } },
    });
    if (!conversation) return fail(404, 'Conversation not found.');
    return ok({ conversation });
  } catch (err) { return handleError(err); }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await ctx.params;
    const body = await readJson(req, conversationTruncateSchema);
    const conversation = await prisma.conversation.findFirst({ where: { id, userId: actor.id } });
    if (!conversation) return fail(404, 'Conversation not found.');
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const deleteIds = messages.slice(body.keepCount).map((m) => m.id);
    if (deleteIds.length > 0) {
      await prisma.message.deleteMany({ where: { id: { in: deleteIds } } });
    }
    return ok({ ok: true, deleted: deleteIds.length });
  } catch (err) { return handleError(err); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await ctx.params;
    await prisma.conversation.deleteMany({ where: { id, userId: actor.id } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
