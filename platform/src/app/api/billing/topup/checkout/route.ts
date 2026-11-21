import { z } from 'zod';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { fail, handleError, ok, readJson, requireUser } from '@/lib/api';
import { findTopupPack } from '@/lib/topup';
import { createOrder, razorpayConfigured } from '@/lib/razorpay';
import { randomToken } from '@/lib/crypto';

const schema = z.object({ packId: z.enum(['starter', 'booster', 'turbo']) });

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const { packId } = await readJson(req, schema);
    const pack = findTopupPack(packId);
    if (!pack) return fail(404, 'Top-up pack not found.');

    if (razorpayConfigured()) {
      const order = await createOrder({
        amountPaise: pack.inrPaise,
        receipt: `iamhujju_topup_${pack.id}_${randomToken(6)}`,
        notes: { userId: actor.id, topup: pack.id, tokens: String(pack.tokens) },
      });
      return ok({ mock: false, razorpay: true, keyId: env.razorpayKeyId, orderId: order.id, amountPaise: pack.inrPaise, currency: 'INR', packId });
    }

    return ok({ mock: true, orderId: `mock_${randomToken(12)}`, packId, tokens: pack.tokens });
  } catch (err) {
    return handleError(err);
  }
}
