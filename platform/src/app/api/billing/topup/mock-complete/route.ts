import { z } from 'zod';
import { prisma } from '@/lib/db';
import { fail, handleError, ok, readJson, requireUser } from '@/lib/api';
import { findTopupPack } from '@/lib/topup';
import { razorpayConfigured } from '@/lib/razorpay';
import { creditTokens } from '@/lib/gateway/run';
import { sendMail } from '@/lib/mail';

const schema = z.object({ orderId: z.string().min(3).max(80), packId: z.enum(['starter', 'booster', 'turbo']) });

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    if (razorpayConfigured()) return fail(400, 'Mock checkout is disabled while real payments are configured.');
    const { orderId, packId } = await readJson(req, schema);
    const pack = findTopupPack(packId);
    if (!pack) return fail(404, 'Top-up pack not found.');

    const existing = await prisma.payment.findFirst({ where: { razorpayOrderId: orderId } });
    if (existing) return ok({ ok: true, alreadyProcessed: true });

    const payment = await prisma.payment.create({
      data: {
        userId: actor.id,
        amount: pack.inrPaise,
        currency: 'inr',
        status: 'succeeded',
        stripePaymentId: `mock_topup_${orderId}`,
        razorpayOrderId: orderId,
        tokensGranted: pack.tokens,
      },
    });
    await prisma.adminAction.create({
      data: { adminId: actor.id, action: 'mock_topup', targetType: 'payment', targetId: payment.id, details: { packId, tokens: pack.tokens } },
    });
    await creditTokens(actor.id, pack.tokens, 'purchase', payment.id);
    await sendMail({
      to: actor.email,
      subject: `Receipt — ${pack.name} token pack`,
      text: `Thanks for your purchase! ${pack.tokens.toLocaleString()} tokens were added to your balance. Payment ref: ${payment.id}`,
    });
    return ok({ ok: true, granted: pack.tokens });
  } catch (err) {
    return handleError(err);
  }
}
