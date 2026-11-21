import { prisma } from '@/lib/db';
import { handleError, ok, requireAdmin } from '@/lib/api';

export async function GET() {
  try {
    await requireAdmin();
    const plans = await prisma.plan.findMany({ orderBy: { priceMonthly: 'asc' } });
    return ok({ plans });
  } catch (err) { return handleError(err); }
}
