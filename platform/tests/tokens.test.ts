import { describe, expect, it } from 'vitest';
import { estimateTokens, minuteKey, nowUtcDayStart } from '@/lib/tokens';

describe('tokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('derives the UTC day start', () => {
    const d = nowUtcDayStart();
    expect(d.toISOString().endsWith('T00:00:00.000Z')).toBe(true);
  });

  it('builds minute keys with a fixed length', () => {
    expect(minuteKey()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
