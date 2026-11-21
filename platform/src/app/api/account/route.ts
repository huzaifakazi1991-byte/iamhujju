import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleError, ok, requireUser, readJson } from '@/lib/api';

const schema = z.object({ name: z.string().trim().max(120).optional() });

export async function PATCH(req: Request) {
  try {
    const actor = await requireUser();
    const body = await readJson(req, schema);
    const user = await prisma.user.update({ where: { id: actor.id }, data: body, select: { id: true, email: true, name: true } });
    return ok({ user });
  } catch (err) { return handleError(err); }
}
