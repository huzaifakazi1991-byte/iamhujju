import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  extractVerifyCode,
  formatRelayText,
  isWhatsAppConfigured,
  maskPhone,
  normalizePhone,
  parseInbound,
  sendWhatsAppText,
  verifyWebhookSignature,
} from '@/lib/whatsapp';

// Pure-function tests for the WhatsApp relay helpers. sendWhatsAppText is
// exercised in e2e with an unconfigured env (never calls Meta).

describe('normalizePhone', () => {
  it('treats bare 10-digit numbers as India (+91)', () => {
    expect(normalizePhone('98765 43210')).toEqual({ e164: '919876543210', conversationId: '+91 9876543210' });
    expect(normalizePhone('+91 98765 43210')).toEqual({ e164: '919876543210', conversationId: '+91 9876543210' });
  });

  it('keeps existing country codes and strips leading zeros', () => {
    expect(normalizePhone('+447911123456').e164).toBe('447911123456');
    expect(normalizePhone('0044 7911 123456').e164).toBe('447911123456');
    expect(normalizePhone('09876543210').e164).toBe('919876543210'); // 11 digits, leading 0 → +91
  });
});

describe('extractVerifyCode', () => {
  it('accepts the "HJ <code>" form with separators and case-insensitivity', () => {
    expect(extractVerifyCode('HJ 123456')).toBe('123456');
    expect(extractVerifyCode('hj:123456')).toBe('123456');
    expect(extractVerifyCode('  HJ-123456 ')).toBe('123456');
    expect(extractVerifyCode('HJ 1234567')).toBe(null);
    expect(extractVerifyCode('hello 123456')).toBe(null);
  });
});

describe('maskPhone', () => {
  it('hides the middle digits', () => {
    expect(maskPhone('919876543210')).toBe('+91 ••••• 210');
    expect(maskPhone('+447911123456')).toBe('+44 ••••• 456');
  });
});

describe('formatRelayText', () => {
  it('names the sender and points back to the inbox', () => {
    const text = formatRelayText('Huzaifa', 'Welcome aboard!');
    expect(text).toContain('Huzaifa');
    expect(text).toContain('Welcome aboard!');
    expect(text).toContain('iamhujju.com');
  });
});

describe('parseInbound', () => {
  it('walks entry[].changes[].value.messages[]', () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [
        { from: '919876543210', text: { body: 'HJ 654321' }, id: 'wamid.X', timestamp: '1700000000' },
        { from: '919999999999' }, // no text → skipped
      ] } }] }],
    };
    const msgs = parseInbound(payload);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ from: '919876543210', text: 'HJ 654321', wamId: 'wamid.X', timestamp: 1700000000 });
    expect(parseInbound({})).toEqual([]);
    expect(parseInbound(null)).toEqual([]);
  });
});

describe('verifyWebhookSignature', () => {
  const unconfigured = { ...{ token: '', phoneNumberId: '', verifyToken: '', displayNumber: '', templateName: '', templateLang: 'en' }, appSecret: '' };

  it('passes through when no app secret is configured', () => {
    expect(verifyWebhookSignature('{}', null, unconfigured)).toBe(true);
  });

  it('validates the HMAC when an app secret is present', () => {
    const cfg = { ...unconfigured, appSecret: 'test-app-secret' };
    const body = JSON.stringify({ entry: [] });
    const sig = 'sha256=' + createHmac('sha256', 'test-app-secret').update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig, cfg)).toBe(true);
    expect(verifyWebhookSignature(body, 'sha256=deadbeef', cfg)).toBe(false);
    expect(verifyWebhookSignature(body, null, cfg)).toBe(false);
    expect(verifyWebhookSignature('{"tampered":1}', sig, cfg)).toBe(false);
  });
});

describe('status plumbing', () => {
  it('reports not_configured without env and sends nothing', async () => {
    expect(isWhatsAppConfigured()).toBe(false);
    expect(isWhatsAppConfigured({ token: 't', phoneNumberId: 'p', verifyToken: '', appSecret: '', displayNumber: '', templateName: '', templateLang: 'en' })).toBe(true);
    const res = await sendWhatsAppText('919876543210', 'hello');
    expect(res.status).toBe('not_configured');
  });
});
