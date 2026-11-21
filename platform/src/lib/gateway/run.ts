import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { estimateTokens, minuteKey, nowUtcDayStart } from '@/lib/tokens';
import { checkRateLimit } from '@/lib/rate-limit';
import { decryptSecret } from '@/lib/crypto';
import { adapterForProvider } from '@/lib/gateway/registry';
import { GatewayError, type ChatMessage } from '@/lib/gateway/types';

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

  const promptTokens = opts.messages.reduce((n, m) => n + estimateTokens(m.content), 0);

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

  await prisma.$transaction(async (tx) => {
    await tx.usageRecord.create({
      data: {
        userId: opts.userId,
        modelId: opts.modelId,
        messageId: opts.messageId,
        promptTokens: outcome.promptTokens,
        completionTokens: outcome.completionTokens,
        totalTokens: outcome.promptTokens + outcome.completionTokens,
        cost,
        status: outcome.status,
        latencyMs: opts.latencyMs,
      },
    }).catch(async () => {
      await tx.usageRecord.create({
        data: {
          userId: opts.userId,
          modelId: opts.modelId,
          messageId: null,
          promptTokens: outcome.promptTokens,
          completionTokens: outcome.completionTokens,
          totalTokens: outcome.promptTokens + outcome.completionTokens,
          cost,
          status: outcome.status,
          latencyMs: opts.latencyMs,
        },
      });
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

export async function executeChat(opts: {
  userId: string;
  isAdmin: boolean;
  modelSlug: string;
  messages: ChatMessage[];
  conversationId?: string | null;
  persist?: boolean;
  maxTokens?: number;
  temperature?: number;
  signal: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const persist = opts.persist ?? true;
  const check = await preflight({ userId: opts.userId, isAdmin: opts.isAdmin, modelSlug: opts.modelSlug, messages: opts.messages });

  const model = await prisma.model.findUnique({ where: { slug: opts.modelSlug }, include: { Provider: true } });
  if (!model) throw new GatewayError(404, 'Model not found.');

  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  let conversationId = opts.conversationId ?? null;
  if (persist) {
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({ where: { id: conversationId, userId: opts.userId } });
      if (!existing) conversationId = null;
    }
    if (!conversationId) {
      const firstUser = opts.messages.find((m) => m.role === 'user')?.content ?? 'New chat';
      const conv = await prisma.conversation.create({
        data: { userId: opts.userId, modelId: model.id, title: firstUser.slice(0, 80) },
      });
      conversationId = conv.id;
    }
  }

  let assistantMessageId: string | null = null;
  if (persist) {
    const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      const msg = await prisma.message.create({
        data: { conversationId: conversationId!, role: 'user', content: lastUser.content, tokensIn: check.promptTokens },
      });
      void msg;
      const assistant = await prisma.message.create({
        data: { conversationId: conversationId!, role: 'assistant', content: '' },
      });
      assistantMessageId = assistant.id;
    }
  }

  const credential = model.Provider.encryptedKey ? decryptSecret(model.Provider.encryptedKey) : null;
  const adapter = adapterForProvider(model.Provider.name);
  const startedAt = Date.now();
  const usageRecordId = `ur_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let settled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let outputChars = 0;
      let usage: { promptTokens: number; completionTokens: number } | null = null;
      let status: 'completed' | 'aborted' | 'error' = 'completed';
      let collected = '';
      controller.enqueue(sse({ type: 'meta', conversationId, model: model.slug, usageRecordId }));
      try {
        for await (const event of adapter.streamChat(
          { model: model.slug, messages: opts.messages, maxTokens: opts.maxTokens, temperature: opts.temperature },
          credential,
          opts.signal,
        )) {
          if (opts.signal.aborted) { status = 'aborted'; break; }
          if (event.type === 'delta') {
            outputChars += event.text.length;
            collected += event.text;
            controller.enqueue(sse(event));
          } else if (event.type === 'usage') {
            usage = { promptTokens: event.promptTokens, completionTokens: event.completionTokens };
          } else if (event.type === 'error') {
            status = 'error';
            controller.enqueue(sse(event));
          }
        }
      } catch (err) {
        if (opts.signal.aborted) { status = 'aborted'; }
        else {
          status = 'error';
          const message = err instanceof Error ? err.message : 'Provider request failed.';
          controller.enqueue(sse({ type: 'error', message }));
        }
      }

      const finalUsage = usage ?? {
        promptTokens: check.promptTokens,
        completionTokens: Math.max(1, Math.ceil(outputChars / 4)),
      };
      if (status === 'aborted') finalUsage.completionTokens = Math.max(1, Math.ceil(outputChars / 4));

      try {
        if (persist && assistantMessageId) {
          await prisma.message.update({ where: { id: assistantMessageId }, data: { content: collected, tokensOut: finalUsage.completionTokens } });
          await prisma.conversation.update({ where: { id: conversationId! }, data: { updatedAt: new Date() } });
        }
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
      } catch (err) {
        console.error('[gateway] settle failed', err);
      }

      const bal = await prisma.tokenBalance.findUnique({ where: { userId: opts.userId } }).catch(() => null);
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
    },
    cancel() {
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
}
