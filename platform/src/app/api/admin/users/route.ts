import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin } from '@/lib/api';

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
    const users = await prisma.user.findMany({
      where: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, email: true, name: true, role: true, suspended: true, createdAt: true, emailVerified: true,
        balance: { select: { available: true, lifetimeUsed: true } },
        subscriptions: { where: { status: { in: ['active', 'trialing'] } }, select: { status: true, Plan: { select: { name: true, slug: true } } }, take: 1 },
      },
    });
    return ok({ users: users.map((u) => ({ ...u, available: Number(u.balance?.available ?? 0), lifetimeUsed: Number(u.balance?.lifetimeUsed ?? 0), planName: u.subscriptions[0]?.Plan.name ?? 'Free' })) });
  } catch (err) { return handleError(err); }
}
