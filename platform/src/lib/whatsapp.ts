import crypto from 'crypto';
import { env } from '@/lib/env';

// ── WhatsApp Cloud API (Meta) relay ─────────────────────────────────────────
// Admin DMs are mirrored to a user's WhatsApp once the user has verified
// their number. Verification is possession-proof: the user sends "HJ <code>"
// FROM their WhatsApp TO the business number; the webhook verifies it.
// Free-tier friendly: plain-text sends work inside the 24h customer-service
// window; outside it we fall back to an approved template if configured.

const GRAPH_VERSION = 'v21.0';

export type WhatsAppConfig = {
  token: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  displayNumber: string;
  templateName: string;
  templateLang: string;
};

export function whatsappConfig(): WhatsAppConfig {
  return {
    token: env.whatsappToken,
    phoneNumberId: env.whatsappPhoneNumberId,
    verifyToken: env.whatsappVerifyToken,
    appSecret: env.whatsappAppSecret,
    displayNumber: env.whatsappDisplayNumber,
    templateName: env.whatsappTemplateName,
    templateLang: env.whatsappTemplateLang,
  };
}

export function isWhatsAppConfigured(cfg = whatsappConfig()): boolean {
  return Boolean(cfg.token && cfg.phoneNumberId);
}

export const verifyMessagePrefix = 'HJ';

/** Digits-only E.164. Bare 10-digit (or 0-prefixed Indian) numbers become +91. */
export function normalizePhone(input: string): { e164: string; conversationId: string } {
  const digits = input.replace(/\D/g, '').replace(/^0+/, '');
  const e164 = digits.length === 10 ? `91${digits}` : digits;
  const last10 = e164.slice(-10);
  const cc = e164.length > 10 ? e164.slice(0, e164.length - 10) : '';
  const conversationId = cc ? `+${cc} ${last10}` : `+${e164}`;
  return { e164, conversationId };
}

export function maskPhone(e164: string): string {
  const { conversationId } = normalizePhone(e164);
  const tail = conversationId.replace(/\D/g, '').slice(-3);
  if (tail.length < 3) return '••••';
  const cc = conversationId.trim().split(' ')[0] ?? '+';
  return `${cc} ••••• ${tail}`;
}

export function hashCode(phone: string, code: string): string {
  return crypto.createHmac('sha256', env.jwtSecret).update(`${normalizePhone(phone).e164}:${code}`).digest('hex');
}

export function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function extractVerifyCode(text: string): string | null {
  const m = text.trim().match(new RegExp(`^${verifyMessagePrefix}\\s*[:-]?\\s*(\\d{6})$`, 'i'));
  return m ? m[1] : null;
}

export const CODE_TTL_MS = 10 * 60_000;

/** Digits-only expected for wa.me deep links (country code + number, no +). */
export function waMeLink(e164: string, code: string): string {
  const text = encodeURIComponent(`${verifyMessagePrefix} ${code}`);
  return `https://wa.me/${e164}?text=${text}`;
}

// ── Outbound send ───────────────────────────────────────────────────────────

export type WhatsAppSendResult = {
  status: 'sent' | 'not_configured' | 'skipped_opted_out' | 'skipped_not_connected' | 'failed';
  reason?: string;
};

async function graphPost(cfg: WhatsAppConfig, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, body };
}

function isReEngagementError(body: unknown): boolean {
  const err = (body as { error?: { code?: number; error_subcode?: number; message?: string } })?.error;
  return err?.code === 131047 || err?.code === 470 || Boolean(err?.message && /re-engage|24h|window/i.test(err.message));
}

export function formatRelayText(userName: string | null, body: string): string {
  const from = userName?.trim() || 'the IamHujju team';
  return `💬 ${from} (IamHujju):\n${body}\n\n— Reply on iamhujju.com → Messages`;
}

export async function sendWhatsAppText(toE164: string, text: string, cfg = whatsappConfig()): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured(cfg)) return { status: 'not_configured', reason: 'WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set' };
  const { e164 } = normalizePhone(toE164);
  try {
    const first = await graphPost(cfg, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: e164,
      type: 'text',
      text: { preview_url: false, body: text },
    });
    if (first.ok) return { status: 'sent' };

    // Outside the 24h window Meta rejects free-text sends; use the approved
    // template if one is configured, otherwise surface a clear reason.
    if (isReEngagementError(first.body)) {
      if (!cfg.templateName) {
        return { status: 'failed', reason: 'Outside the 24h WhatsApp window — set WHATSAPP_TEMPLATE_NAME to enable template sends.' };
      }
      const second = await graphPost(cfg, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: e164,
        type: 'template',
        template: {
          name: cfg.templateName,
          language: { code: cfg.templateLang },
          components: [{ type: 'body', parameters: [{ type: 'text', text }] }],
        },
      });
      if (second.ok) return { status: 'sent' };
      const err = (second.body as { error?: { message?: string } })?.error?.message;
      return { status: 'failed', reason: err ?? `WhatsApp template send failed (HTTP ${second.status})` };
    }
    const err = (first.body as { error?: { message?: string } })?.error?.message;
    return { status: 'failed', reason: err ?? `WhatsApp send failed (HTTP ${first.status})` };
  } catch (err) {
    return { status: 'failed', reason: err instanceof Error ? err.message : 'WhatsApp send threw' };
  }
}

// ── Webhook payloads ────────────────────────────────────────────────────────

export type InboundMessage = { from: string; text: string; wamId?: string; timestamp?: number };

/** Extract the first usable text message from a Cloud API webhook payload. */
export function parseInbound(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entry = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entry)) return out;
  for (const entryItem of entry) {
    const changes = (entryItem as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[] } })?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        const msg = m as { from?: unknown; text?: { body?: unknown }; id?: unknown; timestamp?: unknown };
        const from = typeof msg.from === 'string' ? msg.from : '';
        const text = typeof msg.text?.body === 'string' ? msg.text.body : '';
        if (from && text) {
          out.push({
            from,
            text,
            wamId: typeof msg.id === 'string' ? msg.id : undefined,
            timestamp: typeof msg.timestamp === 'string' ? Number(msg.timestamp) : undefined,
          });
        }
      }
    }
  }
  return out;
}

/** Timing-safe x-hub-signature-256 check when WHATSAPP_APP_SECRET is set. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, cfg = whatsappConfig()): boolean {
  if (!cfg.appSecret) return true; // not enforced when unset
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', cfg.appSecret).update(rawBody).digest('hex');
  const got = signatureHeader.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(got, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
