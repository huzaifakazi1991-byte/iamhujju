import { describe, expect, it } from 'vitest';
import { chatSchema, keyCreateSchema, providerCreateSchema, signupSchema } from '@/lib/validation';

describe('validation', () => {
  it('accepts a valid signup', () => {
    const r = signupSchema.safeParse({ email: 'a@b.com', password: 'password123', name: 'A' });
    expect(r.success).toBe(true);
  });

  it('rejects weak passwords and bad emails', () => {
    expect(signupSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
    expect(signupSchema.safeParse({ email: 'nope', password: 'password123' }).success).toBe(false);
  });

  it('normalizes chat input', () => {
    const r = chatSchema.safeParse({ model: 'mock-small', messages: [{ role: 'user', content: 'hi' }] });
    expect(r.success).toBe(true);
  });

  it('validates provider creation', () => {
    expect(providerCreateSchema.safeParse({ name: 'openai', apiKey: 'sk-x' }).success).toBe(true);
    expect(providerCreateSchema.safeParse({ name: 'bad kind!', apiKey: 'sk-x' }).success).toBe(false);
  });

  it('validates api key names', () => {
    expect(keyCreateSchema.safeParse({ name: 'prod' }).success).toBe(true);
    expect(keyCreateSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
