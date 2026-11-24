import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/api';
import {
  extractVerifyCode,
  hashCode,
  isWhatsAppConfigured,
  parseInbound,
  sendWhatsAppText,
  verifyWebhookSignature,
  whatsappConfig,
} from '@/lib/whatsapp';

// Meta webhook handshake (subscription verify)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge') ?? '';
  const cfg = whatsappConfig();
  if (mode === 'subscribe' && token && cfg.verifyToken && token === cfg.verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }
  return fail(403, 'WhatsApp webhook verification failed.');
}

// Inbound WhatsApp messages: number verification ("HJ 123456") + opt-out ("STOP") / opt-in ("START")
export async function POST(req: Request) {
  try {
    if (!isWhatsAppConfigured()) return ok({ ignored: 'not_configured' });
    const raw = await req.text();
    if (!verifyWebhookSignature(raw, req.headers.get('x-hub-signature-256'))) return fail(401, 'Bad signature.');
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return ok({ ignored: 'unparseable' }); }
    const messages = parseInbound(payload);

    for (const m of messages) {
      const from = m.from;
      const upper = m.text.trim().toUpperCase();

      if (upper === 'STOP') {
        await prisma.user.updateMany({ where: { whatsappPhone: from }, data: { whatsappNotify: false } });
        void sendWhatsAppText(from, '✅ You will no longer receive IamHujju notifications on WhatsApp. Send START to turn them back on.');
        continue;
      }
      if (upper === 'START') {
        await prisma.user.updateMany({ where: { whatsappPhone: from }, data: { whatsappNotify: true } });
        void sendWhatsAppText(from, '✅ Re-enabled IamHujju WhatsApp notifications. Send STOP anytime to pause them.');
        continue;
      }

      const code = extractVerifyCode(m.text);
      if (!code) continue;

      // Newest pending verification matching this code wins; single-use.
      const candidates = await prisma.user.findMany({
        where: { whatsappCodeHash: hashCode(from, code), whatsappCodeExpires: { gt: new Date() } },
        orderBy: { whatsappCodeExpires: 'desc' },
        take: 2,
      });
      const user = candidates[0];
      if (!user) {
        void sendWhatsAppText(from, 'That code did not match a pending verification (or it expired). Open iamhujju.com → Settings to get a fresh code.');
        continue;
      }
      await prisma.user.update({
        where: { id: user.id },
        data: {
          whatsappPhone: from,
          whatsappVerifiedAt: new Date(),
          whatsappNotify: true,
          whatsappPendingPhone: null,
          whatsappCodeHash: null,
          whatsappCodeExpires: null,
        },
      });
      void sendWhatsAppText(
        from,
        `✅ WhatsApp connected to your IamHujju account (${user.email}). You'll now receive messages from us here. Send STOP anytime to pause.`,
      );
    }
    return ok({ received: messages.length });
  } catch (err) {
    // Never 500 — Meta retries aggressively and we don't want alert storms.
    console.error('[whatsapp webhook]', err);
    return ok({ ignored: 'error' });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
