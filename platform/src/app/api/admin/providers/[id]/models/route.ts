import { prisma } from '@/lib/db';
import { handleError, ok, fail, requireAdmin } from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { capabilityOfSlug } from '@/lib/gateway/catalog';

const SKIP_UPSTREAM_ID = /(embedding|aqa|tts|audio)/i;
const MAX_CREATED = 200;

function defaultBase(name: string): string {
  const k = name.trim().toLowerCase();
  if (k === 'mistral') return 'https://api.mistral.ai/v1';
  if (k === 'groq') return 'https://api.groq.com/openai/v1';
  if (k === 'openai') return 'https://api.openai.com/v1';
  if (k === 'gemini' || k === 'google') return 'https://generativelanguage.googleapis.com/v1beta/openai';
  return '';
}

async function fetchUpstreamModels(provider: { name: string; baseUrl: string | null; encryptedKey: string | null }): Promise<string[]> {
  const base = (provider.baseUrl || defaultBase(provider.name)).replace(/\/$/, '');
  if (!base) throw new Error('This provider has no base URL to list models from.');
  const credential = provider.encryptedKey ? decryptSecret(provider.encryptedKey) : null;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (credential) headers.Authorization = `Bearer ${credential}`;

  const res = await fetch(`${base}/models`, { headers });
  if (res.ok) {
    const json = (await res.json()) as { data?: { id?: string }[] };
    const ids = (json.data ?? []).map((m) => String(m.id ?? '')).filter(Boolean);
    if (ids.length > 0) return ids;
    throw new Error(`${base}/models returned no model ids.`);
  }
  if (credential && /googleapis\.com/.test(base)) {
    const nativeBase = base.replace(/\/openai$/, '');
    const nres = await fetch(`${nativeBase}/models`, { headers: { 'x-goog-api-key': credential } });
    if (nres.ok) {
      const njson = (await nres.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
      const ids = (njson.models ?? [])
        .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => String(m.name ?? '').replace(/^models\//, ''))
        .filter(Boolean);
      if (ids.length > 0) return ids;
    }
  }
  throw new Error(`Could not list models from provider (${res.status}). Check the API key.`);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const provider = await prisma.provider.findUnique({ where: { id }, include: { models: { select: { slug: true, adminEnabled: true } } } });
    if (!provider) return fail(404, 'Provider not found.');
    let upstream: string[] = [];
    let error: string | null = null;
    try {
      upstream = await fetchUpstreamModels(provider);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not reach the provider.';
    }
    const upstreamSet = new Set(upstream);
    return ok({
      provider: provider.name,
      error,
      upstream,
      configured: provider.models.map((m) => ({ slug: m.slug, adminEnabled: m.adminEnabled, upstream: upstreamSet.has(m.slug) })),
    });
  } catch (err) { return handleError(err); }
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const provider = await prisma.provider.findUnique({ where: { id }, include: { models: { select: { id: true, slug: true, adminEnabled: true } } } });
    if (!provider) return fail(404, 'Provider not found.');

    const upstream = (await fetchUpstreamModels(provider)).filter((s) => !SKIP_UPSTREAM_ID.test(s)).slice(0, MAX_CREATED);
    if (upstream.length === 0) return fail(502, 'The provider listed no usable chat models for this key.');
    const upstreamSet = new Set(upstream);

    const existingSlugs = new Set(provider.models.map((m) => m.slug));
    const toCreate = upstream.filter((s) => !existingSlugs.has(s));
    await prisma.model.createMany({
      data: toCreate.map((slug, i) => ({
        providerId: provider.id,
        slug,
        displayName: slug,
        capability: capabilityOfSlug(slug),
        contextWindow: /gemini|google/.test(provider.name) ? 1_048_576 : 131_072,
        maxOutputTokens: 65_536,
        tierRequired: (capabilityOfSlug(slug) === 'image' || capabilityOfSlug(slug) === 'video') ? 'pro' : 'free',
        adminEnabled: true,
        displayOrder: 100 + i,
      })),
    });
    for (const m of provider.models) {
      if (upstreamSet.has(m.slug)) {
        const cap = capabilityOfSlug(m.slug);
        await prisma.model.updateMany({ where: { id: m.id, capability: 'chat' }, data: { capability: cap } }).catch(() => undefined);
      }
    }
    const toDisable = provider.models.filter((m) => m.adminEnabled && !upstreamSet.has(m.slug)).map((m) => m.id);
    if (toDisable.length > 0) {
      await prisma.model.updateMany({ where: { id: { in: toDisable } }, data: { adminEnabled: false } });
    }

    await prisma.adminAction.create({
      data: { adminId: admin.id, action: 'sync_provider_models', targetType: 'provider', targetId: provider.id, details: { created: toCreate.length, disabled: toDisable.length } },
    });

    return ok({
      provider: provider.name,
      created: toCreate.length,
      createdSlugs: toCreate,
      disabled: toDisable.length,
      disabledSlugs: provider.models.filter((m) => toDisable.includes(m.id)).map((m) => m.slug),
      upstreamCount: upstream.length,
    });
  } catch (err) { return handleError(err); }
}
