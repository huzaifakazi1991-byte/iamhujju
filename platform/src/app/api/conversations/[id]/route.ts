import { prisma } from '@/lib/db';
import { handleError, ok, requireUser, fail } from '@/lib/api';

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

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await ctx.params;
    await prisma.conversation.deleteMany({ where: { id, userId: actor.id } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
