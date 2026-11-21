import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { fail, ok } from '@/lib/api';
import { fetchOrder, verifyWebhookSignature } from '@/lib/razorpay';
import { upgradeFromWebhook } from '@/lib/billing';

type RazorpayWebhook = {
  event: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; payment_id?: string } };
  };
};

export async function POST(req: Request) {
  const signature = req.headers.get('x-razorpay-signature');
  const raw = await req.text();
  if (!env.razorpayWebhookSecret || !signature) return fail(400, 'Webhook not configured.');
  if (!verifyWebhookSignature(raw, signature)) return fail(400, 'Webhook signature verification failed.');

  let event: RazorpayWebhook;
  try {
    event = JSON.parse(raw) as RazorpayWebhook;
  } catch {
    return fail(400, 'Invalid webhook payload.');
  }
  const eventId = req.headers.get('x-razorpay-event-id') ?? `${event.event}:${event.payload?.payment?.entity?.payment_id ?? ''}`;
  const already = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (already) return ok({ ok: true, replay: true });
  await prisma.webhookEvent.create({ data: { id: eventId, type: event.event } }).catch(() => undefined);

  if (event.event === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id || !payment.id) return ok({ ok: true, skipped: 'missing payment reference' });
    try {
      const order = await fetchOrder(payment.order_id);
      return await upgradeFromWebhook(order.notes ?? {}, payment.order_id, payment.id);
    } catch {
      return ok({ ok: true, skipped: 'order lookup failed' });
    }
  }
  return ok({ ok: true, ignored: event.event });
}
