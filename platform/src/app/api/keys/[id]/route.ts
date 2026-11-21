import { prisma } from '@/lib/db';
import { handleError, ok, requireUser } from '@/lib/api';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await ctx.params;
    await prisma.apiKey.updateMany({ where: { id, userId: actor.id }, data: { revoked: true } });
    return ok({ ok: true });
  } catch (err) { return handleError(err); }
}
