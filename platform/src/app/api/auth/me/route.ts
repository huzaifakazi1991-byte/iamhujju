import { prisma } from '@/lib/db';
import { handleError, ok, requireUser } from '@/lib/api';

export async function GET() {
  try {
    const actor = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { id: true, email: true, name: true, role: true, emailVerified: true },
    });
    return ok({ user });
  } catch (err) { return handleError(err); }
}
