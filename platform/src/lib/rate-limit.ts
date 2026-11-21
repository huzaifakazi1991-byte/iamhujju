import { env } from '@/lib/env';
import { minuteKey } from '@/lib/tokens';

type Bucket = { count: number; tokens: number; reset: number };

const mem = new Map<string, Bucket>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of mem) if (v.reset < now) mem.delete(k);
}

type RedisLike = {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  exists(key: string): Promise<number>;
};

let redis: RedisLike | null = null;
let redisTried = false;

async function getRedis(): Promise<RedisLike | null> {
  if (redisTried) return redis;
  redisTried = true;
  if (!env.redisUrl) return null;
  try {
    const mod = await import('ioredis');
    const client = new mod.default(env.redisUrl);
    redis = {
      incr: (k) => client.incr(k),
      pexpire: (k, ms) => client.pexpire(k, ms),
      exists: (k) => client.exists(k),
    };
  } catch (err) {
    console.warn('[rate-limit] Redis unavailable, using in-memory limiter:', err);
  }
  return redis;
}

export type LimitResult = { allowed: boolean; retryAfterSec: number };

async function consumeMem(key: string, limitRequests: number, limitTokens: number, tokenCost: number): Promise<LimitResult> {
  sweep();
  const now = Date.now();
  const b = mem.get(key) ?? { count: 0, tokens: 0, reset: now + 70000 };
  b.count += 1;
  b.tokens += tokenCost;
  mem.set(key, b);
  if (b.count > limitRequests || b.tokens > limitTokens) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

async function consumeRedis(r: RedisLike, key: string, limitRequests: number, limitTokens: number, tokenCost: number): Promise<LimitResult> {
  const count = await r.incr(`${key}:req`);
  if (count === 1) await r.pexpire(`${key}:req`, 70000);
  const tokens = await r.incr(`${key}:tok`);
  if (tokens === tokenCost || tokens === 1) await r.pexpire(`${key}:tok`, 70000);
  if (count > limitRequests || tokens - 1 + tokenCost > limitTokens) {
    return { allowed: false, retryAfterSec: 70 };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export async function checkRateLimit(
  bucketKey: string,
  limitRequests: number,
  limitTokens: number,
  tokenCost = 0,
): Promise<LimitResult> {
  const key = `${bucketKey}:${minuteKey()}`;
  const r = await getRedis();
  return r
    ? consumeRedis(r, key, limitRequests, limitTokens, tokenCost)
    : consumeMem(key, limitRequests, limitTokens, tokenCost);
}

export async function checkIpLimit(ip: string, limit = 20): Promise<LimitResult> {
  return checkRateLimit(`ip:${ip}`, limit, Number.MAX_SAFE_INTEGER, 0);
}
