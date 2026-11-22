import { handleError, ok, requireAdmin } from '@/lib/api';
import { prisma } from '@/lib/db';
import { PRESENCE_WINDOW_MS } from '@/lib/presence';

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin();
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const threads = await prisma.directThread.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        User: { select: { id: true, email: true, name: true, avatarUrl: true, presenceLastSeen: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const filtered = q
      ? threads.filter((t) => t.User.email.toLowerCase().includes(q) || (t.User.name ?? '').toLowerCase().includes(q))
      : threads;
    const unreadRows = await prisma.directMessage.groupBy({
      by: ['threadId'],
      where: { senderId: { not: admin.id }, Thread: { ownerReadAt: null }, threadId: { in: filtered.map((t) => t.id) } },
      _count: { id: true },
    });
    const unreadByThread = new Map(unreadRows.map((r) => [r.threadId, r._count.id]));
    return ok({
      threads: filtered.map((t) => ({
        id: t.id,
        user: {
          id: t.User.id, email: t.User.email, name: t.User.name, avatarUrl: t.User.avatarUrl,
          online: Boolean(t.User.presenceLastSeen && Date.now() - t.User.presenceLastSeen.getTime() < PRESENCE_WINDOW_MS),
        },
        lastMessage: t.messages[0] ? { body: t.messages[0].body, senderId: t.messages[0].senderId, createdAt: t.messages[0].createdAt } : null,
        unread: unreadByThread.get(t.id) ?? 0,
      })),
    });
  } catch (err) { return handleError(err); }
}
