import { prisma } from '@/lib/db';
import { handleError, ok, requireUser, readJson } from '@/lib/api';
import { keyCreateSchema } from '@/lib/validation';
import { randomToken, sha256 } from '@/lib/crypto';

export async function GET() {
  try {
    const actor = await requireUser();
    const keys = await prisma.apiKey.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, lastUsed: true, revoked: true, createdAt: true },
    });
    return ok({ keys });
  } catch (err) { return handleError(err); }
}

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const { name } = await readJson(req, keyCreateSchema);
    const raw = `sk-hujju-${randomToken(24)}`;
    const key = await prisma.apiKey.create({
      data: { userId: actor.id, name, keyHash: sha256(raw), prefix: raw.slice(0, 12) },
    });
    return ok({ key: { id: key.id, name: key.name, prefix: key.prefix, createdAt: key.createdAt }, secret: raw });
  } catch (err) { return handleError(err); }
}
