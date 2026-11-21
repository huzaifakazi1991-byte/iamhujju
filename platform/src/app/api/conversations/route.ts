import { prisma } from '@/lib/db';
import { handleError, ok, requireUser } from '@/lib/api';

export async function GET() {
  try {
    const actor = await requireUser();
    const conversations = await prisma.conversation.findMany({
      where: { userId: actor.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, updatedAt: true, modelId: true },
    });
    return ok({ conversations });
  } catch (err) { return handleError(err); }
}
