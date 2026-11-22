import { handleError, ok, requireUser } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function POST() {
  try {
    const actor = await requireUser();
    await prisma.user.update({ where: { id: actor.id }, data: { presenceLastSeen: new Date() } });
    return ok({ online: true });
  } catch (err) { return handleError(err); }
}
