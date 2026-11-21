import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch (err) {
    console.error('[health]', err);
    return fail(503, 'Database unavailable');
  }
}
