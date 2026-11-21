import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { accessCookieName, verifyJwt } from '@/lib/auth';

export type Actor = { id: string; email: string; role: 'USER' | 'ADMIN' };

export async function getActor(): Promise<Actor | null> {
  const store = await cookies();
  const token = store.get(accessCookieName())?.value;
  if (!token) return null;
  const claims = await verifyJwt(token);
  if (!claims || claims.type !== 'access') return null;
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, role: true, suspended: true },
  });
  if (!user || user.suspended) return null;
  return { id: user.id, email: user.email, role: user.role };
}
