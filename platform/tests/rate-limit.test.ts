import { afterEach, describe, expect, it } from 'vitest';

const window: { stop?: () => void } = {};

afterEach(() => window.stop?.());

describe('rate limit (in-memory)', () => {
  it('allows under the limit and blocks over it', async () => {
    const mod = await import('@/lib/rate-limit');
    const keySuffix = String(Date.now()) + Math.random();
    const key = `test:${keySuffix}`;
    let blocked = 0;
    for (let i = 0; i < 10; i++) {
      const r = await mod.checkRateLimit(key, 2, 1_000_000);
      if (!r.allowed) blocked++;
    }
    expect(blocked).toBe(8);
  });

  it('blocks on token budget exhaustion', async () => {
    const mod = await import('@/lib/rate-limit');
    const key = `tok:${Date.now()}-${Math.random()}`;
    const first = await mod.checkRateLimit(key, 100, 1_000);
    const second = await mod.checkRateLimit(key, 100, 1_000);
    const big = await mod.checkRateLimit(key, 100, 1_000, 5_000);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(big.allowed).toBe(false);
  });
});
