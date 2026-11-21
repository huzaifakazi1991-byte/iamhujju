import { prisma } from '@/lib/db';
import { handleError, ok } from '@/lib/api';

export async function GET() {
  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
      select: { slug: true, name: true, priceMonthly: true, priceYearly: true, priceMonthlyInrPaise: true, priceYearlyInrPaise: true, dailyTokens: true, monthlyTokens: true, tokensPerMinute: true, requestsPerMin: true, isFree: true, isActive: true },
    });
    return ok({ plans });
  } catch (err) { return handleError(err); }
}
