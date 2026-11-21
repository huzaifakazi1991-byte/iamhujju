import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { handleError, ok, fail, readJson, requireUser } from '@/lib/api';
import { checkoutSchema } from '@/lib/validation';
import { randomToken } from '@/lib/crypto';
import { createOrder, razorpayConfigured, usdCentsToInrPaise } from '@/lib/razorpay';

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const { planSlug, interval } = await readJson(req, checkoutSchema);
    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan || !plan.isActive) return fail(404, 'Plan not available.');

    if (razorpayConfigured()) {
      const amountPaise = interval === 'yearly'
        ? (plan.priceYearlyInrPaise ?? usdCentsToInrPaise(plan.priceYearly ?? plan.priceMonthly))
        : (plan.priceMonthlyInrPaise ?? usdCentsToInrPaise(plan.priceMonthly));
      const order = await createOrder({
        amountPaise,
        receipt: `iamhujju_${planSlug}_${interval}_${randomToken(6)}`,
        notes: { userId: actor.id, planSlug, interval },
      });
      return ok({ mock: false, razorpay: true, keyId: env.razorpayKeyId, orderId: order.id, amountPaise, currency: 'INR', planSlug, interval });
    }

    if (!env.stripeSecretKey) {
      if (actor.role !== 'ADMIN') {
        return fail(503, 'Payments are not configured yet on this site — upgrades will unlock as soon as the owner adds Razorpay or Stripe keys. No charge can be taken and no plan can be activated until then.');
      }
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
