import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { accessCookieName, verifyAccessToken, verifyJwt, type JwtClaims } from '@/lib/auth';

export type Actor = { id: string; email: string; role: 'USER' | 'ADMIN'; emailVerified: boolean };

export async function getActor(): Promise<Actor | null> {
  const store = await cookies();
  const token = store.get(accessCookieName())?.value;
  if (!token) return null;
  const claims = await verifyJwt(token);
  if (!claims || claims.type !== 'access') return null;
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, role: true, suspended: true, emailVerified: true },
  });
  if (!user || user.suspended) return null;
  return { id: user.id, email: user.email, role: user.role, emailVerified: Boolean(user.emailVerified) };
}

export async function getSessionClaims(): Promise<JwtClaims | null> {
  const store = await cookies();
  const token = store.get(accessCookieName())?.value;
  if (!token) return null;
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}
