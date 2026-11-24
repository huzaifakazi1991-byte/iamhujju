import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handleError, ok, requireUser, readJson, fail } from '@/lib/api';
import { resolvePlan } from '@/lib/gateway/run';
import { CODE_TTL_MS, generateCode, hashCode, isWhatsAppConfigured, maskPhone, normalizePhone, waMeLink, whatsappConfig } from '@/lib/whatsapp';

const schema = z.object({
  name: z.string().trim().max(120).optional().nullable(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  bio: z.string().trim().max(600).optional().nullable(),
  avatarUrl: z.string().startsWith('data:image/', 'Avatar must be an image.').max(900_000, 'Picture is too large (max ~900 KB after resize).').optional().nullable(),
  whatsappPhone: z.string().trim().min(8).max(20).optional(),
  whatsappNotify: z.boolean().optional(),
  whatsappDisconnect: z.boolean().optional(),
});

const whatsSelect = {
  whatsappPhone: true,
  whatsappVerifiedAt: true,
  whatsappNotify: true,
  whatsappPendingPhone: true,
  whatsappCodeHash: true,
  whatsappCodeExpires: true,
} as const;

export async function GET() {
  try {
    const actor = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        id: true, email: true, name: true, role: true, emailVerified: true, createdAt: true,
        birthday: true, country: true, bio: true, avatarUrl: true,
        ...whatsSelect,
        balance: { select: { available: true, lifetimeUsed: true } },
      },
    });
    if (!user) return fail(401, 'Account not found.');
    const plan = await resolvePlan(actor.id);
    const payments = await prisma.payment.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, amount: true, currency: true, status: true, tokensGranted: true, createdAt: true },
    });
    const cfg = whatsappConfig();
    const verified = Boolean(user.whatsappVerifiedAt && user.whatsappPhone);
    const pendingExpires = user.whatsappCodeExpires;
    return ok({
      profile: {
        id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: Boolean(user.emailVerified),
        memberSince: user.createdAt, birthday: user.birthday, country: user.country, bio: user.bio, avatarUrl: user.avatarUrl,
      },
      plan: plan ? { slug: plan.slug, name: plan.name, dailyTokens: plan.dailyTokens, monthlyTokens: plan.monthlyTokens, isFree: plan.isFree } : null,
      tokens: { available: Number(user.balance?.available ?? 0), lifetimeUsed: Number(user.balance?.lifetimeUsed ?? 0) },
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      whatsapp: {
        configured: isWhatsAppConfigured(cfg),
        businessNumber: cfg.displayNumber,
        verified,
        phone: user.whatsappPhone ? maskPhone(user.whatsappPhone) : null,
        verifiedAt: user.whatsappVerifiedAt,
        notify: user.whatsappNotify,
        pending: pendingExpires && user.whatsappPendingPhone
          ? { phone: maskPhone(user.whatsappPendingPhone), expiresAt: pendingExpires }
          : null,
      },
    });
  } catch (err) { return handleError(err); }
}

export async function PATCH(req: Request) {
  try {
    const actor = await requireUser();
    const body = await readJson(req, schema);
    const data: Record<string, unknown> = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.country !== undefined ? { country: body.country } : {}),
      ...(body.bio !== undefined ? { bio: body.bio } : {}),
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      ...(body.birthday !== undefined ? { birthday: body.birthday ? new Date(`${body.birthday}T00:00:00.000Z`) : null } : {}),
    };

    // ── WhatsApp verification kickoff ──
    // Setting a phone generates a one-time 6-digit code. The user proves
    // possession by sending "HJ <code>" from that WhatsApp to our business
    // number; the webhook verifies the HMAC and marks it verified.
    let pending: { code: string; link: string; expiresAt: string; businessNumber: string } | null = null;
    if (body.whatsappPhone !== undefined) {
      const cfg = whatsappConfig();
      if (!cfg.displayNumber && !isWhatsAppConfigured(cfg)) {
        return fail(503, 'WhatsApp is not set up yet — the admin needs to connect the business number first.');
      }
      const { e164, conversationId } = normalizePhone(body.whatsappPhone);
      if (!/^[1-9]\d{7,14}$/.test(e164)) return fail(422, 'Enter a valid WhatsApp number, e.g. +91 98765 43210.');
      const code = generateCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_MS);
      data.whatsappPendingPhone = e164;
      data.whatsappCodeHash = hashCode(body.whatsappPhone, code);
      data.whatsappCodeExpires = expiresAt;
      pending = {
        code,
        link: waMeLink(normalizePhone(cfg.displayNumber).e164, code),
        expiresAt: expiresAt.toISOString(),
        businessNumber: normalizePhone(cfg.displayNumber).conversationId,
      };
    }
    if (body.whatsappNotify !== undefined) {
      // Opt-out only applies to an already-verified connection.
      data.whatsappNotify = body.whatsappNotify;
    }
    if (body.whatsappDisconnect) {
      Object.assign(data, {
        whatsappPhone: null,
        whatsappVerifiedAt: null,
        whatsappNotify: true,
        whatsappPendingPhone: null,
        whatsappCodeHash: null,
        whatsappCodeExpires: null,
      });
      pending = null;
    }

    const user = await prisma.user.update({
      where: { id: actor.id },
      data,
      select: { id: true, email: true, name: true, birthday: true, country: true, bio: true, avatarUrl: true },
    });
    return ok({ user, whatsappPending: pending });
  } catch (err) { return handleError(err); }
}
