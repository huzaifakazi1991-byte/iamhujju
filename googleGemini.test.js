import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maskApiKey,
  verifyPaidGeminiAccess,
  DEFAULT_GEMINI_MODELS
} from './services/googleGeminiAdapter.js';
import { createAccountStore, FALLBACK_ENCRYPTION_SECRET } from './authStore.js';

test('1. Google AI Studio Key Masking: masks key securely without exposing payload', () => {
  assert.equal(maskApiKey('AIzaSyB1234567890abcdef_xyz9xQ'), 'AIzaSy••••••9xQ');
  assert.equal(maskApiKey('short'), '••••••••••');
  assert.equal(maskApiKey(null), null);
  assert.equal(maskApiKey(''), null);
});

test('2. Strict Paid-Tier Access Control: verifyPaidGeminiAccess enforces zero free leakage', () => {
  // Admin & Owner
  assert.equal(verifyPaidGeminiAccess({ email: 'huzaifakazi1991@gmail.com', tier: 'free' }), true);
  assert.equal(verifyPaidGeminiAccess({ email: 'other@example.com', role: 'admin' }), true);
  assert.equal(verifyPaidGeminiAccess({ email: 'owner@example.com', tier: 'owner_unlimited' }), true);

  // Free Tier users - STRICTLY FORBIDDEN
  assert.equal(verifyPaidGeminiAccess(null), false);
  assert.equal(verifyPaidGeminiAccess({ email: 'freeuser@example.com', tier: 'free' }), false);
  assert.equal(verifyPaidGeminiAccess({ email: 'freeuser@example.com', tier: 'free', subscription_active: false }), false);

  // Inactive / Expired Paid subscriptions - STRICTLY FORBIDDEN
  assert.equal(verifyPaidGeminiAccess({ email: 'expired@example.com', tier: 'pro', subscription_active: false }), false);
  assert.equal(verifyPaidGeminiAccess({
    email: 'expired@example.com',
    tier: 'pro',
    subscription_active: true,
    expires_at: new Date(Date.now() - 3600000).toISOString()
  }), false);

  // Valid Active Paid Subscriptions - ALLOWED
  assert.equal(verifyPaidGeminiAccess({
    email: 'subscriber@example.com',
    tier: 'pro',
    subscription_active: true,
    expires_at: new Date(Date.now() + 86400000 * 30).toISOString()
  }), true);
  assert.equal(verifyPaidGeminiAccess({
    email: 'subscriber2@example.com',
    tier: 'developer',
    hasActiveSubscription: true
  }), true);
});

test('3. Encrypted System Integrations: AES-256-GCM storage for Google AI Studio key', async () => {
  // Mock db for unit testing encryption flow
  const mockDb = {
    async query() {
      throw new Error('Table mock fallback');
    }
  };

  const store = createAccountStore({
    db: mockDb,
    encryptionSecret: FALLBACK_ENCRYPTION_SECRET
  });

  const rawKey = 'AIzaSyTestApiKeySecret123456789xQ';
  const saved = await store.setSystemIntegration('google-ai-studio', rawKey, {
    maskedKey: maskApiKey(rawKey),
    activeModelsCount: DEFAULT_GEMINI_MODELS.length
  });

  assert.equal(saved.configured, true);
  assert.equal(saved.maskedKey, 'AIzaSy••••••9xQ');
  assert.equal(saved.activeModelsCount, DEFAULT_GEMINI_MODELS.length);

  // Verify retrieved decrypted key matches original
  const retrieved = await store.getSystemIntegration('google-ai-studio');
  assert.equal(retrieved.key, rawKey);

  // Verify status returns only masked metadata
  const status = await store.getSystemIntegrationStatus('google-ai-studio');
  assert.equal(status.configured, true);
  assert.equal(status.maskedKey, 'AIzaSy••••••9xQ');
  assert.equal(status.key, undefined); // Raw key never returned in status

  // Verify deletion
  await store.deleteSystemIntegration('google-ai-studio');
  const postDelete = await store.getSystemIntegrationStatus('google-ai-studio');
  assert.equal(postDelete.configured, false);
});

test('4. Gemini Models Catalog: all models are strictly tagged as Paid/Pro with multi-modality', () => {
  assert.ok(DEFAULT_GEMINI_MODELS.length >= 5);
  for (const m of DEFAULT_GEMINI_MODELS) {
    assert.equal(m.provider, 'gemini');
    assert.equal(m.isFree, false, `Model ${m.id} must NOT be free`);
    assert.equal(m.tier, 'pro', `Model ${m.id} must be tagged tier 'pro'`);
    assert.equal(m.isPaidOnly, true);
    assert.ok(m.brand === 'Google');
    assert.ok(['chat', 'image', 'video', 'agent'].includes(m.modality));
  }
});
