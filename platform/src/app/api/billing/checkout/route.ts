import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { handleError, ok, fail, readJson, requireUser } from '@/lib/api';
import { checkoutSchema } from '@/lib/validation';
import { randomToken } from '@/lib/crypto';

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const { planSlug, interval } = await readJson(req, checkoutSchema);
    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan || !plan.isActive) return fail(404, 'Plan not available.');

    if (!env.stripeSecretKey) {
      const orderId = `mock_${randomToken(12)}`;
      return ok({ mock: true, orderId, planSlug, interval, amount: interval === 'yearly' ? plan.priceYearly : plan.priceMonthly });
    }

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(env.stripeSecretKey);
    const amount = (interval === 'yearly' ? plan.priceYearly : plan.priceMonthly) ?? plan.priceMonthly;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: { name: `${plan.name} plan (${interval})` },
        },
        quantity: 1,
      }],
      metadata: { userId: actor.id, planSlug, interval },
      customer_email: actor.email,
      success_url: `${env.appUrl}/billing?status=success`,
      cancel_url: `${env.appUrl}/billing?status=cancelled`,
    });
    return ok({ mock: false, url: session.url });
  } catch (err) { return handleError(err); }
}
