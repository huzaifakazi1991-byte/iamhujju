import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { randomToken, sha256 } from '@/lib/crypto';

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

export type JwtClaims = {
  sub: string;
  email: string;
  role: 'USER' | 'ADMIN';
  type: 'access' | 'refresh';
};

function secret(): Uint8Array {
  return new TextEncoder().encode(env.jwtSecret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function signJwt(claims: JwtClaims, ttlSec: number): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .setSubject(claims.sub)
    .sign(secret());
}

export async function verifyJwt(token: string): Promise<JwtClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || (payload.type !== 'access' && payload.type !== 'refresh')) return null;
    return payload as unknown as JwtClaims;
  } catch {
    return null;
  }
}

export function accessCookieName() { return 'iam_access'; }
export function refreshCookieName() { return 'iam_refresh'; }

export async function issueSession(user: { id: string; email: string; role: 'USER' | 'ADMIN' }) {
  const refreshPlain = randomToken(48);
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshPlain),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
    },
  });
  const accessToken = await signJwt({ sub: user.id, email: user.email, role: user.role, type: 'access' }, ACCESS_TTL_SEC);
  return {
    accessToken,
    refreshPlain,
    accessMaxAge: ACCESS_TTL_SEC,
    refreshMaxAge: REFRESH_TTL_SEC,
  };
}

export async function rotateSession(refreshPlain: string) {
  const tokenHash = sha256(refreshPlain);
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { User: true } });
  if (!session || session.expiresAt < new Date()) return null;
  await prisma.session.delete({ where: { id: session.id } });
  return issueSession({ id: session.User.id, email: session.User.email, role: session.User.role });
}

export async function revokeSession(refreshPlain: string) {
  await prisma.session.deleteMany({ where: { tokenHash: sha256(refreshPlain) } });
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function verifyAccessToken(token: string): Promise<JwtClaims | null> {
  const claims = await verifyJwt(token);
  return claims && claims.type === 'access' ? claims : null;
}

export async function verifyRefreshToken(token: string): Promise<JwtClaims | null> {
  const claims = await verifyJwt(token);
  return claims && claims.type === 'refresh' ? claims : null;
}

export async function signRefreshJwt(user: { id: string; email: string; role: 'USER' | 'ADMIN' }, refreshPlain: string): Promise<string> {
  void refreshPlain;
  return signJwt({ sub: user.id, email: user.email, role: user.role, type: 'refresh' }, REFRESH_TTL_SEC);
}
