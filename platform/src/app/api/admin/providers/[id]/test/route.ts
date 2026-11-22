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

    await prisma.provider.update({
      where: { id },
      data: {
        lastTestAt: new Date(),
        lastTestOk: !error,
        lastTestDetail: error ? error.slice(0, 300) : `pong ${chars} chars in ${Date.now() - started} ms`,
      },
    }).catch(() => undefined);

    if (error) return ok({ ok: false, error });
    return ok({ ok: true, latencyMs: Date.now() - started, chars });
  } catch (err) { return handleError(err); }
}
