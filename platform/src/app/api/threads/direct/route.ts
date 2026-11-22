import { handleError, ok, requireUser, readJson, fail } from '@/lib/api';
import { prisma } from '@/lib/db';
import { messageBodySchema } from '@/lib/validation';
import { checkRateLimit } from '@/lib/rate-limit';
import { PRESENCE_WINDOW_MS } from '@/lib/presence';

const selectMessages = async (threadId: string) =>
  prisma.directMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

export async function GET() {
  try {
    const actor = await requireUser();
    const thread = await prisma.directThread.upsert({
      where: { userId: actor.id },
      create: { userId: actor.id, userReadAt: new Date() },
      update: { userReadAt: new Date() },
    });
    const messages = await selectMessages(thread.id);
    const owner = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, name: true, presenceLastSeen: true } });
    return ok({
      threadId: thread.id,
      messages: messages.reverse(),
      me: actor.id,
      owner: owner ? { name: owner.name ?? 'Huzaifa', online: Boolean(owner.presenceLastSeen && Date.now() - owner.presenceLastSeen.getTime() < PRESENCE_WINDOW_MS) } : null,
      myUnread: 0,
    });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const { body } = await readJson(req, messageBodySchema);
    const limit = await checkRateLimit(`dm:${actor.id}`, 15, Number.MAX_SAFE_INTEGER, 0);
    if (!limit.allowed) return fail(429, 'You are sending messages too quickly — wait a few seconds.');
    const thread = await prisma.directThread.upsert({ where: { userId: actor.id }, create: { userId: actor.id }, update: {} });
    const message = await prisma.directMessage.create({
      data: { threadId: thread.id, senderId: actor.id, body },
    });
    await prisma.directThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    return ok({ message: { ...message, mine: true } }, { status: 201 });
  } catch (err) { return handleError(err); }
}
