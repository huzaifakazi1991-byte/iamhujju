import { handleError, ok, requireAdmin, readJson, fail } from '@/lib/api';
import { prisma } from '@/lib/db';
import { messageBodySchema } from '@/lib/validation';
import { checkRateLimit } from '@/lib/rate-limit';

const ONLINE_WINDOW_MS = 60_000;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const thread = await prisma.directThread.findUnique({
      where: { id },
      include: { User: { select: { id: true, email: true, name: true, avatarUrl: true, presenceLastSeen: true } } },
    });
    if (!thread) return fail(404, 'Thread not found.');
    await prisma.directThread.update({ where: { id: thread.id }, data: { ownerReadAt: new Date() } });
    const messages = await prisma.directMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    return ok({
      threadId: thread.id,
      user: {
        id: thread.User.id, email: thread.User.email, name: thread.User.name, avatarUrl: thread.User.avatarUrl,
        online: Boolean(thread.User.presenceLastSeen && Date.now() - thread.User.presenceLastSeen.getTime() < ONLINE_WINDOW_MS),
      },
      me: admin.id,
      unreadFromUser: await prisma.directMessage.count({ where: { threadId: thread.id, senderId: thread.User.id, Thread: { ownerReadAt: null } } }),
      messages: messages.reverse(),
    });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { body } = await readJson(req, messageBodySchema);
    const limit = await checkRateLimit(`dm:${admin.id}`, 30, Number.MAX_SAFE_INTEGER, 0);
    if (!limit.allowed) return fail(429, 'You are sending messages too quickly — wait a few seconds.');
    const thread = await prisma.directThread.findUnique({ where: { id } });
    if (!thread) return fail(404, 'Thread not found.');
    const message = await prisma.directMessage.create({ data: { threadId: thread.id, senderId: admin.id, body } });
    await prisma.directThread.update({ where: { id: thread.id }, data: { updatedAt: new Date(), ownerReadAt: new Date() } });
    return ok({ message: { ...message, mine: true } }, { status: 201 });
  } catch (err) { return handleError(err); }
}
