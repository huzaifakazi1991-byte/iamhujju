import { prisma } from '@/lib/db';
import { preflight, settle } from '@/lib/gateway/run';
import { adapterForProvider } from '@/lib/gateway/registry';
import { decryptSecret } from '@/lib/crypto';
import { GatewayError, type ImageKind } from '@/lib/gateway/types';

const FLAT_COST: Record<ImageKind, number> = { image: 1000, video: 8000 };
const IMAGE_TIMEOUT_MS = 120_000;

export const IMAGE_FLAT_COST = FLAT_COST;

function imageContent(url: string, note: string | null): string {
  return `[[image:${url}]]${note ? `\n\n${note}` : ''}`;
}

export async function executeImageRun(opts: {
  userId: string;
  isAdmin: boolean;
  modelSlug: string;
  prompt: string;
  kind: ImageKind;
  conversationId?: string | null;
  signal: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const messages = [{ role: 'user' as const, content: opts.prompt }];

  const check = await preflight({ userId: opts.userId, isAdmin: opts.isAdmin, modelSlug: opts.modelSlug, messages });
  const model = await prisma.model.findUnique({
    where: { slug: opts.modelSlug },
    include: { Provider: { select: { name: true, encryptedKey: true, baseUrl: true, enabled: true } } },
  });
  if (!model) throw new GatewayError(404, 'Model not found.');
  if (model.capability !== 'image' && model.capability !== 'video') {
    throw new GatewayError(400, `"${opts.modelSlug}" is a chat model. Switch to Chat mode to use it.`);
  }
  const kind: ImageKind = model.capability === 'video' ? 'video' : 'image';

  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  let conversationId = opts.conversationId ?? null;
  if (conversationId) {
    const existing = await prisma.conversation.findFirst({ where: { id: conversationId, userId: opts.userId } });
    if (!existing) conversationId = null;
  }
  if (!conversationId) {
    const conv = await prisma.conversation.create({ data: { userId: opts.userId, modelId: model.id, title: opts.prompt.slice(0, 80) } });
    conversationId = conv.id;
  }

  const userMsg = await prisma.message.create({ data: { conversationId, role: 'user', content: opts.prompt, tokensIn: check.promptTokens } });
  void userMsg;
  const assistantMsg = await prisma.message.create({ data: { conversationId, role: 'assistant', content: '' } });

  const credential = model.Provider.encryptedKey ? decryptSecret(model.Provider.encryptedKey) : null;
  const adapter = adapterForProvider(model.Provider.name);
  const usageRecordId = `ur_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const internal = new AbortController();
      const onOuterAbort = () => internal.abort();
      if (opts.signal.aborted) internal.abort();
      else opts.signal.addEventListener('abort', onOuterAbort, { once: true });
      const timer = setTimeout(() => internal.abort(), IMAGE_TIMEOUT_MS);

      if (!closed) controller.enqueue(sse({ type: 'meta', conversationId, model: model.slug, usageRecordId, capability: kind }));

      let status: 'completed' | 'aborted' | 'error' = 'completed';
      let url: string | null = null;
      let note: string | null = null;
      let errorMessage: string | null = null;

      try {
        if (!adapter.generateImage) {
          status = 'error';
          errorMessage = `"${model.Provider.name}" has no image engine connected. Add an image-capable provider key in Admin \u2192 Providers, or use the built-in Mock Image model.`;
          controller.enqueue(sse({ type: 'error', message: errorMessage }));
        } else {
          const result = await adapter.generateImage(
            { model: model.slug, prompt: opts.prompt, kind, baseUrl: model.Provider.baseUrl },
            credential,
            internal.signal,
          );
          url = result.url;
          note = result.note ?? null;
        }
      } catch (err) {
        if (opts.signal.aborted) status = 'aborted';
        else {
          status = 'error';
          errorMessage = err instanceof Error ? err.message : 'The render failed.';
          if (!closed) controller.enqueue(sse({ type: 'error', message: errorMessage }));
        }
      } finally {
        clearTimeout(timer);
        opts.signal.removeEventListener('abort', onOuterAbort);
      }

      const completionTokens = status === 'completed' ? FLAT_COST[kind] : 0;
      const latencyMs = Date.now() - startedAt;

      if (status === 'completed' && url) {
        try {
          await prisma.message.update({ where: { id: assistantMsg.id }, data: { content: imageContent(url, note), tokensOut: completionTokens } });
          await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        } catch (err) {
          console.error('[image] persistence skipped', err);
        }
      }

      try {
        await settle({
          userId: opts.userId,
          check,
          outcome: { status, promptTokens: check.promptTokens, completionTokens, outputChars: url?.length ?? 0 },
          usageRecordId,
          modelId: model.id,
          messageId: assistantMsg.id,
          latencyMs,
        });
      } catch (err) {
        console.error('[image] settle failed', err);
      }

      const bal = await prisma.tokenBalance.findUnique({ where: { userId: opts.userId } }).catch(() => null);
      try {
        if (!closed) {
          if (status === 'completed' && url) {
            controller.enqueue(sse({ type: 'image', url, note, prompt: opts.prompt, kind }));
          }
          controller.enqueue(sse({
            type: 'done',
            status,
            error: errorMessage,
            usage: { promptTokens: check.promptTokens, completionTokens },
            balance: bal ? Number(bal.available) : null,
            conversationId,
          }));
          controller.close();
        }
      } catch { /* client went away */ }
    },
    cancel() { /* settle already runs in start() */ },
  });
}
