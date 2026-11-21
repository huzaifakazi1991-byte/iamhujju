import { describe, expect, it } from 'vitest';
import { chatSchema, conversationTruncateSchema, keyCreateSchema, providerCreateSchema, signupSchema } from '@/lib/validation';

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

  it('accepts multimodal messages with image parts', () => {
    const png = 'data:image/png;base64,' + 'A'.repeat(64);
    const r = chatSchema.safeParse({
      model: 'gemini-3.5-flash-lite',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'What is in this image?' }, { type: 'image_url', image_url: { url: png } }] }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects bad multimodal payloads', () => {
    const base = { model: 'mock-small' };
    expect(chatSchema.safeParse({ ...base, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }] }).success).toBe(false);
    expect(chatSchema.safeParse({ ...base, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'http://evil.example/x.png' } }] }] }).success).toBe(false);
    expect(chatSchema.safeParse({ ...base, messages: [{ role: 'user', content: [] }] }).success).toBe(false);
  });

  it('validates conversation truncation payloads', () => {
    expect(conversationTruncateSchema.safeParse({ keepCount: 2 }).success).toBe(true);
    expect(conversationTruncateSchema.safeParse({ keepCount: 0 }).success).toBe(true);
    expect(conversationTruncateSchema.safeParse({ keepCount: -1 }).success).toBe(false);
    expect(conversationTruncateSchema.safeParse({ keepCount: 1.5 }).success).toBe(false);
    expect(conversationTruncateSchema.safeParse({}).success).toBe(false);
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
