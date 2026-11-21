import crypto from 'node:crypto';
import { env } from '@/lib/env';

const API = 'https://api.razorpay.com/v1';

export function razorpayConfigured(): boolean {
  return Boolean(env.razorpayKeyId && env.razorpayKeySecret);
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64')}`;
}

export function usdCentsToInrPaise(usdCents: number): number {
  const rate = Number.isFinite(env.razorpayUsdToInr) && env.razorpayUsdToInr > 0 ? env.razorpayUsdToInr : 88;
  return Math.round((usdCents / 100) * rate * 100);
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  notes: Record<string, string>;
};

export async function createOrder(opts: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  const res = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: opts.amountPaise,
      currency: 'INR',
      receipt: opts.receipt.slice(0, 40),
      notes: opts.notes,
    }),
  });
  if (!res.ok) throw new Error(`Razorpay order creation failed (${res.status})`);
  return (await res.json()) as RazorpayOrder;
}

export async function fetchOrder(orderId: string): Promise<RazorpayOrder> {
  const res = await fetch(`${API}/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) throw new Error(`Razorpay order lookup failed (${res.status})`);
  return (await res.json()) as RazorpayOrder;
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${orderId}|${paymentId}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const expected = crypto.createHmac('sha256', env.razorpayWebhookSecret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
