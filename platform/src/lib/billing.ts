import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/api';
import { creditTokens } from '@/lib/gateway/run';
import { sendMail } from '@/lib/mail';

async function applyUpgrade(opts: {
  userId: string;
  planSlug: string;
  interval: 'monthly' | 'yearly';
  orderId: string;
  paymentId: string;
}) {
  const { userId, planSlug, interval, orderId, paymentId } = opts;
  const already = await prisma.payment.findUnique({ where: { razorpayPaymentId: paymentId } });
  if (already) return ok({ ok: true, alreadyProcessed: true });

  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan) return fail(404, 'Plan not available.');

  const tokens = interval === 'yearly' ? plan.monthlyTokens * 12 : plan.monthlyTokens;
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  const payment = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        userId,
        amount: interval === 'yearly' ? (plan.priceYearlyInrPaise ?? plan.priceYearly ?? plan.priceMonthly) : (plan.priceMonthlyInrPaise ?? plan.priceMonthly),
        currency: 'inr',
        status: 'succeeded',
        stripePaymentId: `razorpay_${paymentId}`,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        tokensGranted: tokens,
      },
    });
    await tx.subscription.updateMany({
      where: { userId, status: { in: ['active', 'trialing'] }, Plan: { isFree: false } },
      data: { status: 'canceled' },
    });
    await tx.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: 'active',
        stripeSubscriptionId: `razorpay_sub_${orderId}`,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });
    return payment;
  });

  await creditTokens(userId, tokens, 'purchase', payment.id);
  await sendMail({
    to: (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? '',
    subject: `Receipt — ${plan.name} plan`,
    text: `Thanks for upgrading to the ${plan.name} plan! ${tokens.toLocaleString()} tokens granted. Payment ref: ${paymentId}`,
  });
  return ok({ ok: true, granted: tokens, plan: plan.slug });
}

export function upgradeFromOrderNotes(notes: Record<string, string>, orderId: string, paymentId: string, actorId: string) {
  if (notes.userId !== actorId) return fail(403, 'This order belongs to a different account.');
  if (!notes.planSlug) return ok({ ok: true, skipped: 'missing plan metadata' });
  const interval = notes.interval === 'yearly' ? 'yearly' : 'monthly';
  return applyUpgrade({ userId: actorId, planSlug: notes.planSlug, interval, orderId, paymentId });
}

export function upgradeFromWebhook(notes: Record<string, string>, orderId: string, paymentId: string) {
  if (!notes.userId || !notes.planSlug) return ok({ ok: true, skipped: 'missing metadata' });
  const interval = notes.interval === 'yearly' ? 'yearly' : 'monthly';
  return applyUpgrade({ userId: notes.userId, planSlug: notes.planSlug, interval, orderId, paymentId });
}
