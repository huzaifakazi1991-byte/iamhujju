import { prisma } from '@/lib/db';
import { handleError, ok, requireUser } from '@/lib/api';

export async function GET() {
  try {
    const actor = await requireUser();
    const usage = await prisma.usageRecord.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, modelId: true, promptTokens: true, completionTokens: true, totalTokens: true, status: true, latencyMs: true, createdAt: true },
    });
    return ok({ usage });
  } catch (err) { return handleError(err); }
}
