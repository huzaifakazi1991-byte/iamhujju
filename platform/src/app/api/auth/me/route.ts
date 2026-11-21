import { prisma } from '@/lib/db';
import { handleError, ok, fail } from '@/lib/api';
import { getActor } from '@/lib/session';
import { mailConfigured } from '@/lib/mail';

export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return fail(401, 'You must be signed in.');
    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { id: true, email: true, name: true, role: true, suspended: true, emailVerified: true },
    });
    if (!user) return fail(401, 'Account not found.');
    return ok({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: Boolean(user.emailVerified) },
      needsVerification: !user.emailVerified && mailConfigured() && user.role !== 'ADMIN',
    });
  } catch (err) { return handleError(err); }
}
