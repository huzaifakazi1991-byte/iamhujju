import { fail, handleError, readJson, requireUser } from '@/lib/api';
import { z } from 'zod';
import { fetchOrder, razorpayConfigured, verifyPaymentSignature } from '@/lib/razorpay';
import { upgradeFromOrderNotes } from '@/lib/billing';

const schema = z.object({
  razorpay_order_id: z.string().min(3).max(80),
  razorpay_payment_id: z.string().min(3).max(80),
  razorpay_signature: z.string().min(3).max(256),
});

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    if (!razorpayConfigured()) return fail(503, 'Razorpay payments are not configured yet.');
    const body = await readJson(req, schema);
    if (!verifyPaymentSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
      return fail(400, 'Payment signature verification failed. No charge was applied.');
    }
    const order = await fetchOrder(body.razorpay_order_id);
    return await upgradeFromOrderNotes(order.notes ?? {}, body.razorpay_order_id, body.razorpay_payment_id, actor.id);
  } catch (err) {
    return handleError(err);
  }
}
