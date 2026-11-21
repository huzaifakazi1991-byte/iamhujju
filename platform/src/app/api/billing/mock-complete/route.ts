import { prisma } from '@/lib/db';
import { handleError, ok, fail, readJson, requireUser } from '@/lib/api';
import { z } from 'zod';
import { creditTokens } from '@/lib/gateway/run';
import { sendMail } from '@/lib/mail';

const schema = z.object({ orderId: z.string().min(3).max(80), planSlug: z.enum(['pro', 'business']), interval: z.enum(['monthly', 'yearly']) });

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const body = await readJson(req, schema);

    const existing = await prisma.payment.findFirst({ where: { razorpayOrderId: body.orderId } });
    if (existing) return ok({ ok: true, alreadyProcessed: true });

    const plan = await prisma.plan.findUnique({ where: { slug: body.planSlug } });
    if (!plan) return fail(404, 'Plan not available.');

    const tokens = body.interval === 'yearly' ? (plan.monthlyTokens * 12) : plan.monthlyTokens;
    const periodDays = 30;

    const payment = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          userId: actor.id,
          amount: body.interval === 'yearly' ? (plan.priceYearly ?? plan.priceMonthly) : plan.priceMonthly,
          currency: 'usd',
          status: 'succeeded',
          stripePaymentId: `mock_${body.orderId}`,
          razorpayOrderId: body.orderId,
          tokensGranted: tokens,
        },
      });
      const now = new Date();
      const periodEnd = new Date(now.getTime() + periodDays * 24 * 3600 * 1000);
      await tx.subscription.updateMany({
        where: { userId: actor.id, status: { in: ['active', 'trialing'] }, Plan: { isFree: false } },
        data: { status: 'canceled' },
      });
      await tx.subscription.create({
        data: {
          userId: actor.id,
          planId: plan.id,
          status: 'active',
          stripeSubscriptionId: `mock_sub_${body.orderId}`,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
      await tx.adminAction.create({ data: { adminId: actor.id, action: 'mock_checkout', targetType: 'payment', targetId: payment.id, details: { planSlug: body.planSlug, interval: body.interval } } });
      return payment;
    });

    await creditTokens(actor.id, tokens, 'purchase', payment.id);
    await sendMail({
      to: actor.email,
      subject: `Receipt — ${plan.name} plan`,
      text: `Thanks for upgrading to the ${plan.name} plan! ${tokens.toLocaleString()} tokens granted. Payment ref: ${payment.id}`,
    });
    return ok({ ok: true, granted: tokens });
  } catch (err) { return handleError(err); }
}
