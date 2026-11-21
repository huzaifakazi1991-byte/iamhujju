import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { getActor, type Actor } from '@/lib/session';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function ok<T>(data: T, init?: ResponseInit) {
  const safe = JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
  return NextResponse.json(safe, init);
}

export function fail(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof HttpError) return fail(err.status, err.message);
  if (err instanceof ZodError) {
    return fail(422, err.issues[0]?.message ?? 'Invalid input', { issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return fail(409, 'A record with this value already exists');
    if (err.code === 'P2025') return fail(404, 'Record not found');
  }
  console.error('[api]', err);
  return fail(500, 'Something went wrong. Please try again.');
}

export async function requireUser(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new HttpError(401, 'You must be signed in.');
  return actor;
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await requireUser();
  if (actor.role !== 'ADMIN') throw new HttpError(403, 'Admin access required.');
  return actor;
}

export async function readJson<T>(req: Request, schema: { parse: (input: unknown) => T }): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new HttpError(400, 'Invalid JSON body.'); }
  return schema.parse(raw);
}
