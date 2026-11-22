import { prisma } from '@/lib/db';
import { handleError, ok, fail, requireAdmin } from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { adapterForProvider } from '@/lib/gateway/registry';
import { classifyProviderError, type ProviderErrorKind } from '@/lib/gateway/health';

const PROBE_MODEL_LIMIT = 3;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) return fail(404, 'Provider not found.');
    const credential = provider.encryptedKey ? decryptSecret(provider.encryptedKey) : null;
    if (!credential && provider.name !== 'mock') return fail(400, 'No API key configured for this provider.');

    const candidates = await prisma.model.findMany({
      where: { providerId: id, adminEnabled: true },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      take: PROBE_MODEL_LIMIT,
      select: { slug: true },
    });
    const probes = candidates.length > 0 ? candidates.map((c) => c.slug) : ['connection-test'];

    let lastDetail = '';
    const unusable: string[] = [];
    const adapter = adapterForProvider(provider.name);

    for (const slug of probes) {
      const started = Date.now();
      let chars = 0;
      let error: string | null = null;
      try {
        for await (const ev of adapter.streamChat(
          { model: slug, messages: [{ role: 'user', content: 'Reply with the single word: pong' }], maxTokens: 256, baseUrl: provider.baseUrl },
          credential,
        )) {
          if (ev.type === 'delta') chars += ev.text.length;
          if (ev.type === 'error') error = ev.message;
        }
      } catch (err) {
        error = err instanceof Error ? err.message : 'Request failed';
      }

      if (!error && chars === 0) {
        error = 'Reached the provider but the model returned no text. Use "Sync models" to confirm the model ids this key can use.';
      }

      if (!error && chars > 0) {
        const detail = `pong ${chars} chars via ${slug} in ${Date.now() - started} ms`;
        await persist(provider.id, true, detail);
        return ok({ ok: true, latencyMs: Date.now() - started, chars, model: slug });
      }

      const kind: ProviderErrorKind = classifyProviderError(error ?? '');
      if (kind === 'auth' || kind === 'provider') {
        lastDetail = error ?? 'Request failed';
        await persist(provider.id, false, lastDetail);
        return ok({ ok: false, error: lastDetail });
      }
      unusable.push(slug);
      lastDetail = error ?? '';
    }

    if (unusable.length > 0) {
      const detail = `Key authenticated, but ${unusable.length} enabled model(s) are unavailable to this account (${unusable.join(', ')}). Run "Sync models" to refresh model ids.`;
      await persist(provider.id, true, detail);
      return ok({ ok: true, keyValid: true, modelsUnusable: unusable, note: detail });
    }

    await persist(provider.id, false, lastDetail || 'Connection test failed.');
    return ok({ ok: false, error: lastDetail || 'Connection test failed.' });
  } catch (err) { return handleError(err); }
}

async function persist(providerId: string, okFlag: boolean, detail: string) {
  await prisma.provider.update({
    where: { id: providerId },
    data: { lastTestAt: new Date(), lastTestOk: okFlag, lastTestDetail: detail.slice(0, 300) },
  }).catch(() => undefined);
}
