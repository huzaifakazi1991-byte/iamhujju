import { prisma } from '@/lib/db';
import { handleError, ok, fail, requireAdmin } from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { adapterForProvider } from '@/lib/gateway/registry';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) return fail(404, 'Provider not found.');
    const credential = provider.encryptedKey ? decryptSecret(provider.encryptedKey) : null;
    if (!credential && provider.name !== 'mock') return fail(400, 'No API key configured for this provider.');

    const model = await prisma.model.findFirst({ where: { providerId: id, adminEnabled: true } });
    const slug = model?.slug ?? 'connection-test';

    const adapter = adapterForProvider(provider.name);
    const started = Date.now();
    let chars = 0;
    try {
      for await (const ev of adapter.streamChat(
        { model: slug, messages: [{ role: 'user', content: 'Reply with the single word: pong' }], maxTokens: 16 },
        credential,
      )) {
        if (ev.type === 'delta') chars += ev.text.length;
        if (ev.type === 'error') return ok({ ok: false, error: ev.message });
      }
    } catch (err) {
      return ok({ ok: false, error: err instanceof Error ? err.message : 'Request failed' });
    }
    return ok({ ok: true, latencyMs: Date.now() - started, chars });
  } catch (err) { return handleError(err); }
}
