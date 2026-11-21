import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { fail, ok } from '@/lib/api';
import { creditTokens } from '@/lib/gateway/run';
import { sendMail } from '@/lib/mail';

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  if (!env.stripeWebhookSecret || !sig) return fail(400, 'Webhook not configured.');

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(env.stripeSecretKey);
  const payload = await req.text();
  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = stripe.webhooks.constructEvent(payload, sig, env.stripeWebhookSecret) as unknown as typeof event;
  } catch (err) {
    return fail(400, `Webhook signature verification failed: ${(err as Error).message}`);
  }

  const already = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
  if (already) return ok({ ok: true, replay: true });
  await prisma.webhookEvent.create({ data: { id: event.id, type: event.type } });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as { metadata?: Record<string, string>; id?: string };
    const userId = session.metadata?.userId;
    const planSlug = session.metadata?.planSlug;
    const interval = session.metadata?.interval ?? 'monthly';
    if (!userId || !planSlug) return ok({ ok: true, skipped: 'missing metadata' });
    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan) return ok({ ok: true, skipped: 'unknown plan' });

    const tokens = interval === 'yearly' ? plan.monthlyTokens * 12 : plan.monthlyTokens;
    const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          userId,
          amount: interval === 'yearly' ? (plan.priceYearly ?? plan.priceMonthly) : plan.priceMonthly,
          currency: 'usd',
          status: 'succeeded',
          stripePaymentId: `${session.id}`,
          tokensGranted: tokens,
        },
      }).catch(() => undefined);
      await tx.subscription.updateMany({ where: { userId, status: { in: ['active', 'trialing'] }, Plan: { isFree: false } }, data: { status: 'canceled' } });
      await tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: 'active',
          stripeSubscriptionId: `stripe_${session.id}`,
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
        },
      });
    });
    await creditTokens(userId, tokens, 'purchase', session.id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await sendMail({ to: user.email, subject: `Receipt — ${plan.name} plan`, text: `Thanks for upgrading to the ${plan.name} plan! ${tokens.toLocaleString()} tokens granted.` });
    }
  }

  return ok({ received: true });
}
