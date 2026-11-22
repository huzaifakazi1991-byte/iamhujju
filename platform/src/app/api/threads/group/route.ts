import { handleError, ok, requireUser, readJson, fail } from '@/lib/api';
import { prisma } from '@/lib/db';
import { messageBodySchema } from '@/lib/validation';
import { checkRateLimit } from '@/lib/rate-limit';
import { ONLINE_USER_SELECT as ONLINE_SELECT, PRESENCE_WINDOW_MS } from '@/lib/presence';

export async function GET() {
  try {
    const actor = await requireUser();
    const messages = await prisma.groupMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { User: { select: ONLINE_SELECT } },
    });
    const onlineUsers = await prisma.user.findMany({
      where: { presenceLastSeen: { gte: new Date(Date.now() - PRESENCE_WINDOW_MS) }, suspended: false },
      select: ONLINE_SELECT,
      orderBy: { presenceLastSeen: 'desc' },
    });
    return ok({
      messages: messages.reverse().map((m) => ({
        id: m.id, body: m.body, createdAt: m.createdAt, senderId: m.senderId,
        sender: { id: m.User.id, name: m.User.name, role: m.User.role, avatarUrl: m.User.avatarUrl },
      })),
      online: onlineUsers.map((u) => ({ id: u.id, name: u.name, role: u.role, avatarUrl: u.avatarUrl })),
      me: actor.id,
    });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const { body } = await readJson(req, messageBodySchema);
    const limit = await checkRateLimit(`group:${actor.id}`, 15, Number.MAX_SAFE_INTEGER, 0);
    if (!limit.allowed) return fail(429, 'You are sending messages too quickly — wait a few seconds.');
    const message = await prisma.groupMessage.create({
      data: { senderId: actor.id, body },
      include: { User: { select: ONLINE_SELECT } },
    });
    return ok({
      message: {
        id: message.id, body: message.body, createdAt: message.createdAt, senderId: message.senderId,
        sender: { id: message.User.id, name: message.User.name, role: message.User.role, avatarUrl: message.User.avatarUrl },
      },
    }, { status: 201 });
  } catch (err) { return handleError(err); }
}
