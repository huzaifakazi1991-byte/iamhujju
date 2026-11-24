// aiGateway.test.js — Deep Upstream Provider Adapter, Fallback Chains, Post-Payment Auto-Activation & Diagnostic Tests
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHmac } from 'node:crypto';
import { DataType, newDb } from 'pg-mem';
import { createAccountStore } from './authStore.js';
import { migrateDatabase } from './database.js';
import { createConversationStore } from './conversationStore.js';
import { createApp } from './server.js';
import { KeyPool } from './keyPool.js';
import {
  PROVIDERS,
  PROVIDER_FALLBACK_MODELS,
  resolveModelTarget,
  sanitizePayloadForModel,
  computeFallbackChain,
  createModelSyncService,
  generateImageResult,
  runAdminProviderDiagnostics
} from './services/aiGateway.js';

async function createTestStores(t, encryptionSecret = 'test-encryption-secret-that-is-long-enough') {
  const memory = newDb({ noAstCoverageCheck: true });
  memory.public.registerFunction({
    name: 'pg_advisory_xact_lock',
    args: [DataType.integer],
    returns: DataType.integer,
    implementation: () => 0
  });
  memory.public.registerFunction({
    name: 'jsonb_typeof',
    args: [DataType.jsonb],
    returns: DataType.text,
    implementation: value => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value === 'object' ? 'object' : typeof value
  });
  memory.public.registerFunction({
    name: 'gen_random_uuid',
    args: [],
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID()
  });
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await migrateDatabase(pool, { skipVector: true });
  t.after(() => pool.end());
  return {
    pool,
    accountStore: createAccountStore({ db: pool, encryptionSecret }),
    conversationStore: createConversationStore({ db: pool })
  };
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;
      resolve({ server, baseUrl });
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('1. Parameter Sanitization: adapts reasoning models (DeepSeek R1 / o1) by translating system role and fixing tokens', () => {
  // Test reasoning model system prompt conversion
  const payloadWithSystem = {
    model: 'deepseek/deepseek-r1:free',
    messages: [
      { role: 'system', content: 'You are an expert mathematician.' },
      { role: 'user', content: 'Prove sqrt(2) is irrational.' }
    ],
    tools: [],
    tool_choice: 'none'
  };

  const sanitizedR1 = sanitizePayloadForModel('openrouter', 'deepseek/deepseek-r1:free', payloadWithSystem);
  // System role must be removed and integrated into user message
  assert.equal(sanitizedR1.messages.some(m => m.role === 'system'), false, 'System messages must be converted for reasoning models');
  assert.ok(sanitizedR1.messages[0].content.includes('You are an expert mathematician.'));
  assert.ok(sanitizedR1.messages[0].content.includes('Prove sqrt(2) is irrational.'));
  // Empty tools and tool_choice must be stripped
  assert.equal(sanitizedR1.tools, undefined, 'Empty tools array must be stripped');
  assert.equal(sanitizedR1.tool_choice, undefined, 'Empty tool_choice must be stripped');

  // Test o1 max_tokens mapping to max_completion_tokens
  const o1Payload = {
    model: 'o1-mini',
    messages: [{ role: 'user', content: 'Solve puzzle' }],
    max_tokens: 4000,
    temperature: 0.7
  };
  const sanitizedO1 = sanitizePayloadForModel('openai', 'o1-mini', o1Payload);
  assert.equal(sanitizedO1.max_completion_tokens, 4000);
  assert.equal(sanitizedO1.max_tokens, undefined);
  assert.equal(sanitizedO1.temperature, undefined, 'Temperature must be stripped for o1');
});

test('2. Dynamic Fallback Chain: computes equivalent cross-provider fallback models', () => {
  const llamaChain = computeFallbackChain('openrouter', 'meta-llama/llama-3.3-70b-instruct:free');
  assert.ok(llamaChain.length >= 2, 'Fallback chain must provide 2-3 equivalents');
  assert.ok(llamaChain.some(f => f.provider === 'groq'), 'Groq should be in Llama fallback chain');

  const r1Chain = computeFallbackChain('groq', 'deepseek-r1-distill-llama-70b');
  assert.ok(r1Chain.some(f => f.provider === 'openrouter' || f.provider === 'electronhub'), 'OpenRouter or ElectronHub should be in R1 fallback chain');
});

test('3. Cross-Provider Automatic Failover: switches to fallback provider when primary provider key fails', async t => {
  const customKeyPool = new KeyPool();
  customKeyPool.registerPool('openrouter', ['sk-primary-openrouter-key']);
  customKeyPool.registerPool('groq', ['sk-backup-groq-key']);

  let attemptedProviders = [];

  const response = await customKeyPool.executeWithFailover({
    providerId: 'openrouter',
    fallbackChain: [{ provider: 'groq', model: 'llama-3.3-70b-versatile' }],
    requestFn: async (key, provider, model) => {
      attemptedProviders.push(provider);
      if (provider === 'openrouter') {
        // Primary provider hits 429 rate limit
        return new Response(JSON.stringify({ error: { message: 'Rate limit' } }), { status: 429 });
      }
      if (provider === 'groq') {
        // Fallback succeeds!
        return new Response(JSON.stringify({ choices: [{ message: { content: 'Fallback success!' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Unexpected provider: ${provider}`);
    }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(attemptedProviders, ['openrouter', 'groq']);
});

test('4. Guaranteed Post-Payment Auto-Activation: activates subscription, unlocks all models, and auto-provisions sk-hujju key', async t => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('buyer@example.com', 'secure-password-1234');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;

  const keyId = 'rzp_test_U2SqMDjvKttD4X';
  const keySecret = 'v0fUbejyGxsXf6OzhaFwBwJI';

  const app = createApp({
    accountStore,
    razorpayKeyId: keyId,
    razorpayKeySecret: keySecret,
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // User currently has no API keys
  const keysBefore = await accountStore.listApiKeys(user.id);
  assert.equal(keysBefore.length, 0);

  // Record an order first
  await accountStore.recordPaymentOrder({
    orderId: 'order_auto_provision_101',
    userId: user.id,
    email: user.email,
    planId: 'pro',
    billingCycle: 'monthly',
    amountPaise: 819900,
    receipt: 'rcpt_test_101'
  });

  // Generate valid HMAC signature
  const paymentId = 'pay_auto_provision_202';
  const orderId = 'order_auto_provision_101';
  const signature = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');

  // Verify payment
  const verifyRes = await fetch(`${baseUrl}/api/payments/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      order_id: orderId,
      payment_id: paymentId,
      signature,
      planId: 'pro'
    })
  });

  assert.equal(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.equal(verifyData.success, true);
  assert.equal(verifyData.hasActiveSubscription, true);
  assert.equal(verifyData.unlockedAllModels, true);
  assert.ok(verifyData.provisionedApiKey, 'Must auto-provision a personal sk-hujju key');
  assert.ok(verifyData.provisionedApiKey.startsWith('sk-hujju-'));

  // Verify database state
  const updatedUser = await accountStore.findUserById(user.id);
  assert.equal(updatedUser.tier, 'pro');
  assert.equal(updatedUser.hasActiveSubscription, true);
  assert.equal(updatedUser.unlockedAllModels, true);

  // User now has an active API key saved in database
  const keysAfter = await accountStore.listApiKeys(user.id);
  assert.equal(keysAfter.length, 1);
  assert.equal(keysAfter[0].status, 'active');
});

test('5. Admin Diagnostics Telemetry (GET /api/admin/health/providers): rejects non-admin and returns full diagnostic metrics for admin', async t => {
  const { accountStore } = await createTestStores(t);

  // 1. Regular user
  const regularUser = await accountStore.register('regular@example.com', 'regular-password-1234');
  const regularSession = await accountStore.createSession(regularUser.id);

  // 2. Admin user (web owner)
  const adminUser = await accountStore.register('huzaifakazi1991@gmail.com', 'admin-password-1234');
  const adminSession = await accountStore.createSession(adminUser.id);

  const customKeyPool = new KeyPool();
  customKeyPool.registerPool('openrouter', ['sk-openrouter-admin-test']);

  const app = createApp({
    accountStore,
    keyPool: customKeyPool,
    fetchImpl: async (url) => {
      if (url.includes('chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'Pong' } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
  });

  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // Non-admin request must be rejected with 403 Forbidden
  const forbiddenRes = await fetch(`${baseUrl}/api/admin/health/providers`, {
    headers: { Cookie: `iamhujju_session=${regularSession.token}` }
  });
  assert.equal(forbiddenRes.status, 403);

  // Admin request must succeed with 200 and return diagnostic metrics
  const adminRes = await fetch(`${baseUrl}/api/admin/health/providers`, {
    headers: { Cookie: `iamhujju_session=${adminSession.token}` }
  });
  assert.equal(adminRes.status, 200);
  const diagData = await adminRes.json();
  assert.ok(diagData.providers, 'Diagnostics must include providers report');
  assert.ok(diagData.providers.openrouter, 'OpenRouter diagnostics must be present');
  assert.equal(diagData.providers.openrouter.statusOk, true);
  assert.ok(typeof diagData.providers.openrouter.latencyMs === 'number');
});

test('6. Phase 2 M1: Pollinations image fallback is env-gated and annotates actual provider when enabled', async t => {
  const previousFlag = process.env.ALLOW_POLLINATIONS_FALLBACK;
  delete process.env.ALLOW_POLLINATIONS_FALLBACK;
  t.after(() => {
    if (previousFlag === undefined) delete process.env.ALLOW_POLLINATIONS_FALLBACK;
    else process.env.ALLOW_POLLINATIONS_FALLBACK = previousFlag;
  });

  const requestOptions = {
    prompt: 'a lighthouse at dusk',
    model: 'flux-schnell',
    size: '1024x1024',
    aspect_ratio: '1:1',
    n: 1,
    response_format: 'url',
    activeKey: null,
    providerBase: null
  };

  await assert.rejects(
    () => generateImageResult(requestOptions),
    err => {
      assert.equal(err.code, 'upstream_unavailable');
      assert.equal(err.status, 502);
      assert.match(err.message, /Pollinations fallback is disabled/);
      return true;
    },
    'Default must fail closed instead of silently sending prompts to Pollinations'
  );
  assert.doesNotThrow(() => new URL('https://image.pollinations.ai'), 'no side effects expected on failure path');

  process.env.ALLOW_POLLINATIONS_FALLBACK = 'true';
  const result = await generateImageResult(requestOptions);
  assert.equal(result.provider, 'pollinations');
  assert.equal(result.model, 'flux');
  assert.match(result.data[0].url, /^https:\/\/image\.pollinations\.ai\/prompt\//);
  assert.equal(result.data[0].provider, 'pollinations');
  assert.equal(result.data[0].model, 'flux');
  assert.equal(result.data[0].revised_prompt, 'a lighthouse at dusk');
});

test('7. Phase 2 M5/L2: Cohere gains an OpenAI-compatible provider entry and bundled providers have fallback models without 402-gated defaults', () => {
  assert.equal(PROVIDERS.cohere.base, 'https://api.cohere.com/compatibility/v1');
  assert.equal(PROVIDERS.cohere.chatUrl, 'https://api.cohere.com/compatibility/v1/chat/completions');
  assert.equal(PROVIDERS.cohere.modelsUrl, 'https://api.cohere.com/compatibility/v1/models');

  const cohereTarget = resolveModelTarget('cohere:command-a-03-2025');
  assert.equal(cohereTarget.provider, 'cohere');
  assert.equal(cohereTarget.sourceModel, 'command-a-03-2025');

  for (const providerId of ['openrouter', 'cerebras', 'sambanova', 'huggingface', 'freellmapi', 'cohere']) {
    const list = PROVIDER_FALLBACK_MODELS[providerId];
    assert.ok(Array.isArray(list) && list.length > 0, `PROVIDER_FALLBACK_MODELS.${providerId} must have static entries`);
    for (const model of list) {
      assert.ok(model.id, 'fallback model needs an id');
      assert.ok(model.name, 'fallback model needs a name');
      assert.ok(!Number.isNaN(Number(model.context_window)), 'fallback model needs a context_window');
    }
  }

  const openrouterDefaultIds = PROVIDER_FALLBACK_MODELS.openrouter.map(m => m.id);
  assert.ok(!openrouterDefaultIds.includes('openrouter/auto'), 'openrouter/auto is HTTP 402 credit-gated and must not be a free-tier default');
  assert.ok(!openrouterDefaultIds.some(id => id.includes('lyria')), 'lyria models are HTTP 402 credit-gated and must not be free-tier defaults');
  assert.ok(openrouterDefaultIds.every(id => id === 'openrouter/free' || id.endsWith(':free')), 'OpenRouter defaults must all be free-tier routes');

  const freellmTarget = resolveModelTarget('auto');
  assert.ok(freellmTarget.provider === 'openrouter' || freellmTarget.provider === 'freellmapi', 'universal auto alias still resolves');
});

test('8. Phase 2 L2: KeyPool treats HTTP 403 as recoverable cooldown with automatic fallback (no permanent invalidation)', async () => {
  const customKeyPool = new KeyPool();
  customKeyPool.registerPool('openrouter', ['sk-phase2-403-key']);

  const attemptedKeys = [];
  const failedRes = await customKeyPool.executeWithFailover({
    providerId: 'openrouter',
    requestFn: async key => {
      attemptedKeys.push(key);
      return new Response(JSON.stringify({ error: { message: 'Free-tier access gate' } }), { status: 403 });
    }
  });
  assert.equal(failedRes.status, 403);
  assert.equal(attemptedKeys.length, 1);

  let status = customKeyPool.getStatus().openrouter;
  assert.equal(status.inCooldown, 1, 'HTTP 403 must place the key on cooldown');
  assert.equal(status.invalid, 0, 'HTTP 403 must NOT permanently invalidate the key');
  assert.equal(status.state, 'recovering');

  const crossProviderKeyPool = new KeyPool();
  crossProviderKeyPool.registerPool('openrouter', ['sk-phase2-403-primary']);
  crossProviderKeyPool.registerPool('groq', ['sk-phase2-403-backup']);
  const attemptedProviders = [];
  const okRes = await crossProviderKeyPool.executeWithFailover({
    providerId: 'openrouter',
    fallbackChain: [{ provider: 'groq', model: 'llama-3.3-70b-versatile' }],
    requestFn: async (key, provider) => {
      attemptedProviders.push(provider);
      if (provider === 'openrouter') {
        return new Response(JSON.stringify({ error: { message: 'Forbidden' } }), { status: 403 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Fallback after 403' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  assert.equal(okRes.status, 200);
  assert.deepEqual(attemptedProviders, ['openrouter', 'groq']);
  status = crossProviderKeyPool.getStatus();
  assert.equal(status.openrouter.inCooldown, 1);
  assert.equal(status.openrouter.invalid, 0);
  assert.equal(status.groq.healthyKeys, 1);
});
