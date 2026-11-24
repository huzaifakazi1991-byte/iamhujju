import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { estimateTokens, minuteKey, nowUtcDayStart } from '@/lib/tokens';
import { checkRateLimit } from '@/lib/rate-limit';
import { decryptSecret } from '@/lib/crypto';
import { adapterForProvider } from '@/lib/gateway/registry';
import { PLATFORM_SYSTEM_PROMPT } from '@/lib/gateway/system';
import { GatewayError, messageText, type ChatMessage } from '@/lib/gateway/types';

type PlanRow = {
  id: string;
  slug: string;
  dailyTokens: number;
  monthlyTokens: number;
  tokensPerMinute: number;
  requestsPerMin: number;
  allowedModels: string[];
  isFree: boolean;
  name: string;
};

const TIER_RANK: Record<string, number> = { free: 0, pro: 1, business: 2 };

export async function grantDailyIfEligible(userId: string, dailyTokens: number): Promise<number> {
  if (dailyTokens <= 0) return 0;
  const day = nowUtcDayStart().toISOString().slice(0, 10);
  const referenceId = `daily:${userId}:${day}`;
  return prisma.$transaction(async (tx) => {
    const already = await tx.tokenLedger.findFirst({ where: { userId, reason: 'daily_grant', referenceId } });
    if (already) {
      const bal = await tx.tokenBalance.findUnique({ where: { userId } });
      return bal ? Number(bal.available) : 0;
    }
    await tx.tokenBalance.upsert({
      where: { userId },
      create: { userId, available: BigInt(dailyTokens) },
      update: { available: { increment: BigInt(dailyTokens) } },
    });
    const bal = await tx.tokenBalance.findUniqueOrThrow({ where: { userId } });
    await tx.tokenLedger.create({
      data: { userId, delta: BigInt(dailyTokens), reason: 'daily_grant', referenceId, balanceAfter: bal.available },
    });
    return Number(bal.available);
  });
}

export async function resolvePlan(userId: string): Promise<PlanRow | null> {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ['active', 'trialing'] } },
    include: { Plan: true },
    orderBy: { createdAt: 'desc' },
  });
  if (sub) return sub.Plan;
  const free = await prisma.plan.findUnique({ where: { slug: 'free' } });
  return free;
}

async function tokensUsedSince(userId: string, since: Date): Promise<number> {
  const agg = await prisma.usageRecord.aggregate({ _sum: { totalTokens: true }, where: { userId, createdAt: { gte: since } } });
  return Number(agg._sum.totalTokens ?? 0);
}

export type GatewayCheck = {
  reserve: bigint;
  promptTokens: number;
  modelSlug: string;
  plan: PlanRow;
};

export async function preflight(opts: {
  userId: string;
  isAdmin: boolean;
  modelSlug: string;
  messages: ChatMessage[];
}): Promise<GatewayCheck> {
  const plan = await resolvePlan(opts.userId);
  if (!plan) throw new GatewayError(503, 'No plan is configured. Ask the administrator to seed plans.');
  if (!opts.isAdmin) {
    if (plan.allowedModels.length > 0 && !plan.allowedModels.includes(opts.modelSlug)) {
      throw new GatewayError(403, `Model "${opts.modelSlug}" is not available on the ${plan.name} plan. Upgrade for full access.`);
    }
  }

  const model = await prisma.model.findUnique({ where: { slug: opts.modelSlug }, include: { Provider: true } });
  if (!model || !model.adminEnabled) throw new GatewayError(404, 'Model not found or not enabled by the administrator.');
  if (!model.Provider.enabled) throw new GatewayError(503, `Provider "${model.Provider.name}" is not active.`);
  if (!opts.isAdmin && (TIER_RANK[model.tierRequired] ?? 0) > (TIER_RANK[plan.slug] ?? 0)) {
    throw new GatewayError(403, `"${model.displayName}" requires a higher plan. Please upgrade.`);
  }

  const promptTokens = opts.messages.reduce((n, m) => n + estimateTokens(messageText(m.content)), 0);

  const limit = await checkRateLimit(`user:${opts.userId}`, plan.requestsPerMin, plan.tokensPerMinute, promptTokens);
  if (!limit.allowed) {
    throw new GatewayError(429, `Rate limit reached on the ${plan.name} plan (${plan.requestsPerMin} requests/min). Retry in ${limit.retryAfterSec}s.`);
  }

  const usedToday = await tokensUsedSince(opts.userId, nowUtcDayStart());
  if (!opts.isAdmin && plan.dailyTokens > 0 && usedToday + promptTokens > plan.dailyTokens) {
    throw new GatewayError(429, `Daily token limit reached on the ${plan.name} plan (${plan.dailyTokens.toLocaleString()} tokens/day). Upgrade or retry tomorrow.`);
  }
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const usedMonth = await tokensUsedSince(opts.userId, monthStart);
  if (!opts.isAdmin && plan.monthlyTokens > 0 && usedMonth + promptTokens > plan.monthlyTokens) {
    throw new GatewayError(429, `Monthly token limit reached on the ${plan.name} plan. Please upgrade.`);
  }

  const balance = await prisma.tokenBalance.findUnique({ where: { userId: opts.userId } });
  let available = balance ? Number(balance.available) : 0;
  if (available <= 0 && !opts.isAdmin && plan.dailyTokens > 0) {
    available = await grantDailyIfEligible(opts.userId, plan.dailyTokens);
  }
  if (available <= 0) {
    throw new GatewayError(402, 'Your token balance is exhausted. Upgrade your plan or ask the administrator for more tokens.');
  }

  const wanted = promptTokens + 128;
  const want = Math.max(1, Math.min(wanted, available));
  const reserved = await prisma.tokenBalance.updateMany({
    where: { userId: opts.userId, available: { gte: want } },
    data: { available: { decrement: want }, reserved: { increment: want } },
  });
  if (reserved.count === 0) {
    throw new GatewayError(402, 'Your token balance changed while reserving. Please retry.');
  }

  return { reserve: BigInt(want), promptTokens, modelSlug: opts.modelSlug, plan };
}

export type StreamOutcome = {
  status: 'completed' | 'aborted' | 'error';
  promptTokens: number;
  completionTokens: number;
  outputChars: number;
};

export async function settle(opts: {
  userId: string;
  check: GatewayCheck;
  outcome: StreamOutcome;
  usageRecordId: string;
  modelId: string;
  messageId: string | null;
  latencyMs: number;
}) {
  const { check, outcome } = opts;
  const actual = BigInt(outcome.promptTokens + outcome.completionTokens);
  const reserve = check.reserve;

  const model = await prisma.model.findUnique({ where: { id: opts.modelId }, select: { costPer1kInput: true, costPer1kOutput: true } });
  const cost = model
    ? new Prisma.Decimal(
        (outcome.promptTokens * Number(model.costPer1kInput) + outcome.completionTokens * Number(model.costPer1kOutput)) / 1000,
      ).toFixed(12)
    : '0';

  const settlement = (messageId: string | null) =>
    prisma.$transaction(async (tx) => {
      await tx.usageRecord.create({
        data: {
          userId: opts.userId,
          modelId: opts.modelId,
          messageId,
          promptTokens: outcome.promptTokens,
          completionTokens: outcome.completionTokens,
          totalTokens: outcome.promptTokens + outcome.completionTokens,
          cost,
          status: outcome.status,
          latencyMs: opts.latencyMs,
        },
      });

      await tx.tokenBalance.updateMany({ where: { userId: opts.userId }, data: { reserved: { decrement: reserve } } });
      if (actual > reserve) {
        await tx.tokenBalance.updateMany({ where: { userId: opts.userId }, data: { available: { decrement: actual - reserve } } });
      } else if (actual < reserve) {
        await tx.tokenBalance.updateMany({ where: { userId: opts.userId }, data: { available: { increment: reserve - actual } } });
      }
      await tx.tokenBalance.updateMany({ where: { userId: opts.userId }, data: { lifetimeUsed: { increment: actual } } });
      const after = await tx.tokenBalance.findUnique({ where: { userId: opts.userId } });
      await tx.tokenLedger.create({
        data: {
          userId: opts.userId,
          delta: -actual,
          reason: 'message_usage',
          referenceId: opts.usageRecordId,
          balanceAfter: after?.available ?? BigInt(0),
        },
      });
      await tx.rateLimit
        .upsert({
          where: { userId_minuteKey: { userId: opts.userId, minuteKey: minuteKey() } },
          create: { userId: opts.userId, minuteKey: minuteKey(), requests: 1, tokens: Number(actual) },
          update: { requests: { increment: 1 }, tokens: { increment: Number(actual) } },
        })
        .catch(() => undefined);
    });

  try {
    await settlement(opts.messageId);
  } catch {
    await settlement(null);
  }

  if (actual > reserve) {
    const bal = await prisma.tokenBalance.findUnique({ where: { userId: opts.userId } });
    if (bal && bal.available < 0) {
      await prisma.tokenLedger.create({
        data: {
          userId: opts.userId,
          delta: BigInt(0),
          reason: 'overdraft',
          referenceId: opts.usageRecordId,
          balanceAfter: bal.available,
        },
      }).catch(() => undefined);
    }
  }
}

export function creditTokens(userId: string, amount: number, reason: string, referenceId?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.tokenBalance.upsert({
      where: { userId },
      create: { userId, available: BigInt(amount) },
      update: { available: { increment: BigInt(amount) } },
    });
    const bal = await tx.tokenBalance.findUniqueOrThrow({ where: { userId } });
    await tx.tokenLedger.create({
      data: { userId, delta: BigInt(amount), reason, referenceId, balanceAfter: bal.available },
    });
    return bal;
  });
}

export type RunResult = { conversationId: string | null };

type ChatRunOpts = {
  userId: string;
  isAdmin: boolean;
  modelSlug: string;
  messages: ChatMessage[];
  conversationId?: string | null;
  persist?: boolean;
  maxTokens?: number;
  temperature?: number;
  signal: AbortSignal;
};

type PreparedAttempt = {
  check: GatewayCheck;
  model: { id: string; slug: string; displayName: string; providerName: string };
  conversationId: string | null;
  assistantMessageId: string | null;
  stream: ReadableStream<Uint8Array>;
};

/**
 * One single-model gateway attempt: preflight → stream → settle.
 * Throws GatewayError for policy failures (plan/model/provider/rate/balance)
 * before any streaming begins. Provider errors / timeouts mid-stream arrive
 * as SSE `error` events inside the returned stream.
 */
async function attemptChat(
  opts: ChatRunOpts,
  modelSlug: string,
  conversationIdIn: string | null,
  promptTokensIn: number | null,
): Promise<PreparedAttempt> {
  const persist = opts.persist ?? true;
  const check = await preflight({ userId: opts.userId, isAdmin: opts.isAdmin, modelSlug, messages: opts.messages });

  const model = await prisma.model.findUnique({ where: { slug: modelSlug }, include: { Provider: true } });
  if (!model) throw new GatewayError(404, 'Model not found.');

  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  let conversationId = conversationIdIn;
  if (persist) {
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({ where: { id: conversationId, userId: opts.userId } });
      if (!existing) conversationId = null;
    }
    if (!conversationId) {
      const firstUser = opts.messages.find((m) => m.role === 'user');
      const title = firstUser ? messageText(firstUser.content).slice(0, 80) : 'New chat';
      const conv = await prisma.conversation.create({
        data: { userId: opts.userId, modelId: model.id, title },
      });
      conversationId = conv.id;
    }
  }

  let assistantMessageId: string | null = null;
  if (persist) {
    const assistant = await prisma.message.create({
      data: { conversationId: conversationId!, role: 'assistant', content: '' },
    });
    assistantMessageId = assistant.id;
  }
  void promptTokensIn;

  const credential = model.Provider.encryptedKey ? decryptSecret(model.Provider.encryptedKey) : null;
  const adapter = adapterForProvider(model.Provider.name);
  const startedAt = Date.now();
  const usageRecordId = `ur_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let settled = false;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let outputChars = 0;
      let usage: { promptTokens: number; completionTokens: number } | null = null;
      let status: 'completed' | 'aborted' | 'error' = 'completed';
      let collected = '';
      let timedOut = false;

      const internal = new AbortController();
      const onOuterAbort = () => internal.abort();
      if (opts.signal.aborted) internal.abort();
      else opts.signal.addEventListener('abort', onOuterAbort, { once: true });
      const firstTokenTimer = setTimeout(() => { timedOut = true; internal.abort(); }, 45_000);
      const hardTimer = setTimeout(() => { timedOut = true; internal.abort(); }, 240_000);

      const wireMessages: ChatMessage[] = opts.messages.some((m) => m.role === 'system')
        ? opts.messages
        : [{ role: 'system', content: PLATFORM_SYSTEM_PROMPT }, ...opts.messages];

      if (!closed) controller.enqueue(sse({ type: 'meta', conversationId, model: model.slug, usageRecordId }));
      try {
        for await (const event of adapter.streamChat(
          { model: model.slug, messages: wireMessages, maxTokens: opts.maxTokens, temperature: opts.temperature, baseUrl: model.Provider.baseUrl },
          credential,
          internal.signal,
        )) {
          if (opts.signal.aborted || timedOut) { status = opts.signal.aborted ? 'aborted' : 'error'; break; }
          if (event.type === 'delta') {
            clearTimeout(firstTokenTimer);
            outputChars += event.text.length;
            collected += event.text;
            if (!closed) controller.enqueue(sse(event));
          } else if (event.type === 'usage') {
            usage = { promptTokens: event.promptTokens, completionTokens: event.completionTokens };
          } else if (event.type === 'error') {
            status = 'error';
            if (!closed) controller.enqueue(sse(event));
          }
        }
      } catch (err) {
        if (opts.signal.aborted) { status = 'aborted'; }
        else if (timedOut) {
          status = 'error';
          if (!closed) controller.enqueue(sse({ type: 'error', message: 'The provider took too long to respond. Please try again or pick another model.' }));
        }
        else {
          status = 'error';
          const e = err as Error & { cause?: unknown };
          const message = e instanceof Error ? `${e.message}${e.cause ? ` [${String(e.cause)}]` : ''}` : 'Provider request failed.';
          if (!closed) controller.enqueue(sse({ type: 'error', message }));
        }
      } finally {
        clearTimeout(firstTokenTimer);
        clearTimeout(hardTimer);
        opts.signal.removeEventListener('abort', onOuterAbort);
      }

      const finalUsage = usage ?? {
        promptTokens: check.promptTokens,
        completionTokens: Math.max(1, Math.ceil(outputChars / 4)),
      };
      if (status === 'aborted') finalUsage.completionTokens = Math.max(1, Math.ceil(outputChars / 4));
      try {
        if (!settled) {
          settled = true;
          await settle({
            userId: opts.userId,
            check,
            outcome: { status, ...finalUsage, outputChars },
            usageRecordId,
            modelId: model.id,
            messageId: persist ? assistantMessageId : null,
            latencyMs: Date.now() - startedAt,
          });
        }
        // Failed attempts with zero output leave an empty ghost assistant
        // message — remove it so chat history stays clean.
        if (persist && assistantMessageId && status === 'error' && collected === '') {
          await prisma.message.deleteMany({ where: { id: assistantMessageId, content: '' } }).catch(() => undefined);
        }
        if (persist && assistantMessageId) {
          await prisma.conversation.update({ where: { id: conversationId! }, data: { updatedAt: new Date() } }).catch(() => undefined);
        }
      } catch (err) {
        console.error('[gateway] settle failed', err);
      }

      const bal = await prisma.tokenBalance.findUnique({ where: { userId: opts.userId } }).catch(() => null);
      try {
        if (!closed) {
          controller.enqueue(
            sse({
              type: 'done',
              status,
              usage: finalUsage,
              balance: bal ? Number(bal.available) : null,
              conversationId,
            }),
          );
          controller.close();
        }
      } catch { /* stream already torn down by the client */ }
    },
    cancel() {
      closed = true;
      if (settled) return;
      settled = true;
      void settle({
          userId: opts.userId,
          check,
          outcome: { status: 'aborted', promptTokens: check.promptTokens, completionTokens: 0, outputChars: 0 },
          usageRecordId,
          modelId: model.id,
          messageId: persist ? assistantMessageId : null,
          latencyMs: Date.now() - startedAt,
        }).catch((err) => console.error('[gateway] cancel-settle failed', err));
    },
  });

  return { check, model: { id: model.id, slug: model.slug, displayName: model.displayName, providerName: model.Provider.name }, conversationId, assistantMessageId, stream };
}

const MAX_GATEWAY_ATTEMPTS = 3;

/**
 * executeChat: runs the requested model first; if the provider fails before
 * producing any output (error event, hang/TTFB timeout), it automatically
 * retries with the next best enabled chat model — same provider first, then
 * other providers — so one dead key or slow model no longer breaks the chat.
 */
export async function executeChat(opts: ChatRunOpts): Promise<ReadableStream<Uint8Array>> {
  const persist = opts.persist ?? true;

  // First preflight happens OUTSIDE the stream so auth/plan/balance errors
  // surface as real HTTP codes (402/403/429) and the client's upgrade modal.
  const first = await attemptChat(opts, opts.modelSlug, opts.conversationId ?? null, null);

  const userMessageId: string | null = await (async () => {
    if (!persist) return null;
    const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return null;
    const msg = await prisma.message.create({
      data: { conversationId: first.conversationId!, role: 'user', content: messageText(lastUser.content), tokensIn: first.check.promptTokens },
    });
    return msg.id;
  })();
  void userMessageId;

  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
  const decoder = new TextDecoder();

  let closed = false;
  let activeStream: ReadableStream<Uint8Array> | null = null;

  const stream: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
    async start(controller) {
      let conversationId = first.conversationId;
      let metaForwarded = false;
      let current = first;
      let attempts = 1;
      const triedSlugs = new Set<string>([opts.modelSlug]);

      let lastError: string | null = null;

      for (;;) {
        let deltaSeen = false;
        let doneSeen = false;
        let okStatus: string | null = null;
        activeStream = current.stream;
        const reader = current.stream.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const raw of decoder.decode(value, { stream: true }).split('\n\n')) {
              if (!raw.startsWith('data: ')) continue;
              let ev: Record<string, unknown>;
              try { ev = JSON.parse(raw.slice(6)); } catch { continue; }
              if (ev.type === 'meta') {
                if (!metaForwarded) {
                  metaForwarded = true;
                  if (typeof ev.conversationId === 'string') conversationId = ev.conversationId;
                  if (!closed) controller.enqueue(sse(ev));
                }
              } else if (ev.type === 'delta') {
                deltaSeen = true;
                if (!closed) controller.enqueue(sse(ev));
              } else if (ev.type === 'done') {
                doneSeen = true;
                okStatus = typeof ev.status === 'string' ? ev.status : null;
                // Hold back an error-done that produced no output — a failover
                // attempt may follow and will forward its own final done.
                if (okStatus === 'error' && !deltaSeen) { /* held for failover */ }
                else if (!closed) controller.enqueue(sse(ev));
              } else if (ev.type === 'error') {
                if (deltaSeen) { if (!closed) controller.enqueue(sse(ev)); } // partial output — tell the user
                else lastError = typeof ev.message === 'string' ? ev.message : 'Provider error';
              } else {
                if (!closed) controller.enqueue(sse(ev)); // usage / notice passthrough
              }
            }
          }
        } finally {
          try { reader.releaseLock(); } catch { /* lock already released */ }
        }

        // Success, partial output, or client gone — stop trying models.
        if (!lastError || deltaSeen || opts.signal.aborted && !doneSeen) {
          try { controller.close(); } catch { /* already closed */ }
          return;
        }
        if (!doneSeen) { try { controller.close(); } catch { /* closed */ } return; }
        if (okStatus !== 'error') { return; } // done already forwarded

        // Clean failure with zero output → try another model.
        if (persist && current.assistantMessageId) {
          await prisma.message.deleteMany({ where: { id: current.assistantMessageId, content: '' } }).catch(() => undefined);
        }
        if (attempts >= MAX_GATEWAY_ATTEMPTS) break;

        const nextSlug = await nextFallbackSlug(opts, current.check.plan, current.model.slug, current.model.providerName, triedSlugs);
        if (!nextSlug) break;
        attempts++;
        triedSlugs.add(nextSlug);
        if (!closed) {
          controller.enqueue(sse({
            type: 'notice',
            message: `⚠️ ${current.model.displayName} failed — automatically retrying with a different model…`,
            to: nextSlug,
          }));
        }
        try {
          current = await attemptChat(opts, nextSlug, conversationId, first.check.promptTokens);
        } catch (err) {
          if (!(err instanceof GatewayError)) console.error('[gateway] fallback attempt failed', err);
          if (!closed) {
            controller.enqueue(sse({ type: 'error', message: lastError }));
            controller.enqueue(sse({ type: 'done', status: 'error', usage: null, balance: null, conversationId }));
          }
          try { controller.close(); } catch { /* closed */ }
          return;
        }
        continue;
      }

      // No fallback available — surface the original provider error.
      if (!closed) {
        controller.enqueue(sse({ type: 'error', message: lastError ?? 'The provider failed to respond. Please try again shortly.' }));
        controller.enqueue(sse({ type: 'done', status: 'error', usage: null, balance: null, conversationId }));
        try { controller.close(); } catch { /* closed */ }
      }
    },
    cancel() {
      // User aborted: tear down whichever attempt is live (its own cancel
      // handler settles billing as 'aborted').
      closed = true;
      if (activeStream) { try { void activeStream.cancel(); } catch { /* ... */ } }
    },
  });

  // If the request aborts without the outer cancel firing, forward it too.
  opts.signal.addEventListener('abort', () => {
    closed = true;
    if (activeStream) { try { void activeStream.cancel(); } catch { /* ... */ } }
  }, { once: true });

  return stream;
}

/** Next enabled chat model to try: same provider first, then other providers. */
async function nextFallbackSlug(
  opts: ChatRunOpts,
  plan: PlanRow,
  failedSlug: string,
  failedProvider: string,
  triedSlugs: Set<string>,
): Promise<string | null> {
  const candidates = await prisma.model.findMany({
    where: { adminEnabled: true, capability: 'chat', Provider: { enabled: true } },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    include: { Provider: { select: { name: true } } },
    take: 50,
  });
  const eligible = (m: (typeof candidates)[number]) =>
    !triedSlugs.has(m.slug) && m.slug !== failedSlug
    && (opts.isAdmin || (TIER_RANK[m.tierRequired] ?? 0) <= (TIER_RANK[plan.slug] ?? 0))
    && (opts.isAdmin || plan.allowedModels.length === 0 || plan.allowedModels.includes(m.slug));
  const sameProvider = candidates.find((m) => m.Provider.name === failedProvider && eligible(m));
  const otherProvider = candidates.find((m) => m.Provider.name !== failedProvider && eligible(m));
  const pick = sameProvider ?? otherProvider;
  return pick?.slug ?? null;
}
