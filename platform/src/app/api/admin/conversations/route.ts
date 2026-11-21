import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin } from '@/lib/api';

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.trim() ?? '';
    const userId = url.searchParams.get('userId')?.trim() ?? '';
    const take = Math.min(100, Math.max(1, Number(url.searchParams.get('take') ?? '50')));

    const conversations = await prisma.conversation.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { User: { email: { contains: q, mode: 'insensitive' } } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true, title: true, createdAt: true, updatedAt: true,
        User: { select: { id: true, email: true, name: true, suspended: true } },
        Model: { select: { slug: true, displayName: true } },
        _count: { select: { messages: true } },
      },
    });
    const summary = await prisma.message.aggregate({ _count: { id: true } });
    return ok({ conversations, totalMessages: summary._count.id });
  } catch (err) { return handleError(err); }
}
