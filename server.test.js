import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID, createHmac } from 'node:crypto';
import test from 'node:test';
import { DataType, newDb } from 'pg-mem';
import { createAccountStore } from './authStore.js';
import { migrateDatabase } from './database.js';
import { createConversationStore } from './conversationStore.js';
import { createApp } from './server.js';
import { KeyPool } from './keyPool.js';

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
    implementation: value => Array.isArray(value)
      ? 'array'
      : value === null
        ? 'null'
        : typeof value === 'object'
          ? 'object'
          : typeof value
  });
  // pg-mem does not ship gen_random_uuid(); register it so schema v4 migration works
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

function authenticatedTestStore() {
  return {
    getUserForSession(token) {
      return token === 'test-session'
        ? { id: 'test-user', email: 'test@example.com' }
        : null;
    }
  };
}

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

test('models are discovered from the available FreeLLMAPI catalog', async t => {
  const app = createApp({
    apiBase: 'http://127.0.0.1:31415/v1',
    apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:31415/v1/models?available=true');
      assert.equal(options.headers.Authorization, 'Bearer test-secret');
      return new Response(JSON.stringify({
        object: 'list',
        data: [{ id: 'auto', name: 'Auto' }]
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/models`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    object: 'list',
    data: [{ id: 'auto', name: 'Auto' }]
  });
});

test('security headers, origin checks, and API rate limits are enforced', async t => {
  let upstreamCalls = 0;
  const app = createApp({
    apiKey: 'test-secret',
    rateLimits: { models: 1, chat: 1 },
    fetchImpl: async () => {
      upstreamCalls += 1;
      return new Response(JSON.stringify({
        data: [{ id: 'auto', name: 'Auto' }]
      }), { headers: { 'Content-Type': 'application/json' } });
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const blockedOrigin = await fetch(`${baseUrl}/api/models`, {
    headers: { Origin: 'https://attacker.example' }
  });
  assert.equal(blockedOrigin.status, 403);
  assert.equal(blockedOrigin.headers.get('access-control-allow-origin'), null);
  assert.equal(upstreamCalls, 0);

  const allowedOrigin = await fetch(`${baseUrl}/api/models`, {
    headers: { Origin: 'http://localhost:5173' }
  });
  assert.equal(allowedOrigin.status, 200);
  assert.equal(allowedOrigin.headers.get('x-frame-options'), 'DENY');
  assert.equal(allowedOrigin.headers.get('x-content-type-options'), 'nosniff');
  assert.match(allowedOrigin.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(allowedOrigin.headers.get('x-powered-by'), null);

  const limitedModels = await fetch(`${baseUrl}/api/models`);
  assert.equal(limitedModels.status, 429);

  const chatBody = JSON.stringify({
    model: 'auto',
    messages: [{ role: 'user', content: 'hello' }]
  });
  const unauthorizedChat = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: chatBody
  });
  assert.equal(unauthorizedChat.status, 401);
  const limitedChat = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: chatBody
  });
  assert.equal(limitedChat.status, 429);
});

test('invalid chat payloads are rejected before reaching the gateway', async t => {
  let gatewayCalled = false;
  const app = createApp({
    accountStore: authenticatedTestStore(),
    apiKey: 'test-secret',
    fetchImpl: async () => {
      gatewayCalled = true;
      throw new Error('should not be called');
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'iamhujju_session=test-session'
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'tool', content: 'invalid role' }],
      stream: true
    })
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /valid messages/);
  assert.equal(gatewayCalled, false);
});

test('chat completion streams pass through unchanged', async t => {
  const streamBody = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n';
  const app = createApp({
    accountStore: authenticatedTestStore(),
    apiKey: 'test-secret',
    allowSharedGatewayKey: true,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:31415/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-secret');
      assert.deepEqual(JSON.parse(options.body), {
        model: 'auto',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true
      });
      return new Response(streamBody, {
        headers: { 'Content-Type': 'text/event-stream' }
      });
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'iamhujju_session=test-session'
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true
    })
  });

  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(await response.text(), streamBody);
});

test('disconnecting a chat request aborts the upstream gateway request', async t => {
  let markStarted;
  const started = new Promise(resolve => {
    markStarted = resolve;
  });
  let upstreamAborted = false;
  let markUpstreamAborted;
  const upstreamAbort = new Promise(resolve => {
    markUpstreamAborted = resolve;
  });
  const app = createApp({
    accountStore: authenticatedTestStore(),
    apiKey: 'test-secret',
    allowSharedGatewayKey: true,
    fetchImpl: async (url, { signal }) => {
      markStarted();
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          upstreamAborted = true;
          markUpstreamAborted();
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const controller = new AbortController();
  const request = fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'iamhujju_session=test-session'
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true
    })
  });

  await started;
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  await Promise.race([
    upstreamAbort,
    new Promise(resolve => setTimeout(resolve, 1000))
  ]);
  assert.equal(upstreamAborted, true);
});

test('upstream error messages are useful without exposing credentials', async t => {
  const secret = 'test-secret';
  const app = createApp({
    accountStore: authenticatedTestStore(),
    apiKey: secret,
    allowSharedGatewayKey: true,
    fetchImpl: async () => new Response(JSON.stringify({
      error: { message: `Rejected ${secret}; Authorization: Bearer ${secret}` }
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'iamhujju_session=test-session'
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.match(body.error.message, /\[redacted\]/);
  assert.equal(body.error.message.includes(secret), false);
});

test('signup and login persist hashed accounts and revocable sessions', async t => {
  const { accountStore, pool } = await createTestStores(t);
  const app = createApp({
    accountStore,
    apiKey: 'test-secret',
    fetchImpl: async () => {
      throw new Error('not used');
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));
  const email = 'User@example.com';
  const password = 'correct horse battery';

  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const signupBody = await signup.json();
  const signupCookie = signup.headers.get('set-cookie');
  const cookie = signupCookie.split(';')[0];

  assert.equal(signup.status, 201);
  assert.equal(signupBody.user.email, 'user@example.com');
  assert.equal(signupCookie.includes('HttpOnly'), true);
  assert.equal(signupCookie.includes('SameSite=Strict'), true);
  const storedPassword = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [signupBody.user.id]
  );
  assert.notEqual(storedPassword.rows[0].password_hash, password);

  const persistedStore = createAccountStore({
    db: pool,
    encryptionSecret: 'test-encryption-secret-that-is-long-enough'
  });
  assert.deepEqual(
    await persistedStore.getUserForSession(cookie.slice('iamhujju_session='.length)),
    signupBody.user
  );

  const duplicate = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(duplicate.status, 409);

  const wrongPassword = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong password' })
  });
  assert.equal(wrongPassword.status, 401);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(login.status, 200);

  const me = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: cookie }
  });
  assert.deepEqual((await me.json()).user, signupBody.user);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie }
  });
  assert.equal(logout.status, 204);

  const afterLogout = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: cookie }
  });
  assert.equal((await afterLogout.json()).user, null);
});

test('chat requests require a valid session', async t => {
  const app = createApp({
    apiKey: 'test-secret',
    fetchImpl: async () => {
      throw new Error('unauthorized requests must not reach the gateway');
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true
    })
  });

  assert.equal(response.status, 401);
  assert.match((await response.json()).error.message, /Sign in/);
});

test('conversation endpoints require a session and isolate every query by account', async t => {
  const { accountStore, conversationStore } = await createTestStores(t);
  const owner = await accountStore.register('owner@example.com', 'correct horse battery');
  const other = await accountStore.register('other@example.com', 'another correct password');
  const ownerSession = await accountStore.createSession(owner.id);
  const otherSession = await accountStore.createSession(other.id);
  const app = createApp({ accountStore, conversationStore });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const unauthorized = await fetch(`${baseUrl}/api/conversations`);
  assert.equal(unauthorized.status, 401);

  const imported = await fetch(`${baseUrl}/api/conversations/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `iamhujju_session=${ownerSession.token}`
    },
    body: JSON.stringify({
      conversations: [{
        id: 'legacy-chat',
        title: 'Imported chat',
        messages: [{ role: 'user', content: 'Preserve me' }]
      }],
      activeConversationId: 'legacy-chat'
    })
  });
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).importedCount, 1);

  const ownerState = await fetch(`${baseUrl}/api/conversations`, {
    headers: { Cookie: `iamhujju_session=${ownerSession.token}` }
  });
  const ownerBody = await ownerState.json();
  assert.equal(ownerBody.conversations.length, 1);
  assert.equal(ownerBody.activeConversationId, 'legacy-chat');

  const otherState = await fetch(`${baseUrl}/api/conversations`, {
    headers: { Cookie: `iamhujju_session=${otherSession.token}` }
  });
  assert.deepEqual(await otherState.json(), {
    conversations: [],
    activeConversationId: null
  });

  const invalidOwnerClaim = await fetch(`${baseUrl}/api/conversations/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `iamhujju_session=${otherSession.token}`
    },
    body: JSON.stringify({
      ownerId: owner.id,
      conversations: [],
      activeConversationId: null
    })
  });
  assert.equal(invalidOwnerClaim.status, 400);

  const deleted = await fetch(`${baseUrl}/api/conversations/legacy-chat`, {
    method: 'DELETE',
    headers: { Cookie: `iamhujju_session=${ownerSession.token}` }
  });
  assert.equal(deleted.status, 204);
  const finalOwnerState = await fetch(`${baseUrl}/api/conversations`, {
    headers: { Cookie: `iamhujju_session=${ownerSession.token}` }
  });
  assert.deepEqual(await finalOwnerState.json(), {
    conversations: [],
    activeConversationId: null
  });
});

test('account API credentials are encrypted and isolated by provider', async t => {
  const { accountStore: store, pool } = await createTestStores(t);
  const firstUser = await store.register('first@example.com', 'correct horse battery');
  const secondUser = await store.register('second@example.com', 'another correct horse');
  const providerKey = 'openrouter-test-secret-123456';

  await store.setProviderApiKey(firstUser.id, 'openrouter', providerKey);
  assert.equal(await store.getProviderApiKey(firstUser.id, 'openrouter'), providerKey);
  assert.equal(await store.getProviderApiKey(secondUser.id, 'openrouter'), null);
  assert.equal((await store.getProviderApiKeyStatus(firstUser.id, 'openrouter')).configured, true);
  const encrypted = await pool.query(
    `SELECT ciphertext, iv, auth_tag FROM provider_credentials
     WHERE user_id = $1 AND provider = 'openrouter'`,
    [firstUser.id]
  );
  assert.equal(JSON.stringify(encrypted.rows).includes(providerKey), false);

  await store.revokeProviderApiKey(firstUser.id, 'openrouter');
  assert.equal(await store.getProviderApiKey(firstUser.id, 'openrouter'), null);
});

test('FreeLLMAPI account key is tested, kept secret, used, and revocable', async t => {
  const { accountStore, pool } = await createTestStores(t);
  const user = await accountStore.register('key-owner@example.com', 'correct horse battery');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;
  const personalKey = 'personal-freellm-key-123456';
  const fallbackKey = 'server-fallback-key';
  const streamBody = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n';

  const app = createApp({
    accountStore,
    apiKey: fallbackKey,
    allowSharedGatewayKey: false,
    fetchImpl: async (url, options) => {
      if (url === 'http://127.0.0.1:31415/v1/models?available=true') {
        assert.ok([
          `Bearer ${personalKey}`,
          `Bearer ${fallbackKey}`
        ].includes(options.headers.Authorization));
        return new Response(JSON.stringify({
          data: [{ id: 'auto', name: 'Auto' }]
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'http://127.0.0.1:31415/v1/chat/completions') {
        assert.equal(options.headers.Authorization, `Bearer ${personalKey}`);
        return new Response(streamBody, {
          headers: { 'Content-Type': 'text/event-stream' }
        });
      }

      throw new Error(`Unexpected upstream request: ${url}`);
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const statusWithoutPersonalKey = await fetch(`${baseUrl}/api/account/api-key`, {
    headers: { Cookie: cookie }
  });
  assert.equal((await statusWithoutPersonalKey.json()).usingServerKey, false);

  const deniedBeforeAddingKey = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });
  assert.equal(deniedBeforeAddingKey.status, 403);

  const saved = await fetch(`${baseUrl}/api/account/api-key`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ apiKey: personalKey })
  });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.configured, true);
  assert.equal(savedBody.modelCount, 1);
  assert.equal(JSON.stringify(savedBody).includes(personalKey), false);
  const encrypted = await pool.query(
    `SELECT ciphertext, iv, auth_tag FROM provider_credentials
     WHERE user_id = $1 AND provider = 'freellmapi'`,
    [user.id]
  );
  assert.equal(JSON.stringify(encrypted.rows).includes(personalKey), false);

  const tested = await fetch(`${baseUrl}/api/account/api-key/test`, {
    method: 'POST',
    headers: { Cookie: cookie }
  });
  assert.equal(tested.status, 200);
  assert.equal((await tested.json()).modelCount, 1);

  const completion = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true
    })
  });
  assert.equal(completion.status, 200);
  assert.equal(await completion.text(), streamBody);

  const revoked = await fetch(`${baseUrl}/api/account/api-key`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.equal(revoked.status, 204);
  assert.equal(await accountStore.getApiKey(user.id), null);

  const deniedAfterRevokingKey = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });
  assert.equal(deniedAfterRevokingKey.status, 403);

  const fallbackModels = await fetch(`${baseUrl}/api/models`, {
    headers: { Cookie: cookie }
  });
  assert.equal(fallbackModels.status, 200);
  assert.equal((await fallbackModels.json()).data[0].id, 'auto');
});

test('shared FreeLLMAPI chat key is available only with explicit opt-in', async t => {
  const accountStore = {
    ...authenticatedTestStore(),
    getApiKeyStatus() {
      return { configured: false };
    }
  };
  const sharedKey = 'explicit-shared-key';
  const app = createApp({
    accountStore,
    apiKey: sharedKey,
    allowSharedGatewayKey: true,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:31415/v1/chat/completions');
      assert.equal(options.headers.Authorization, `Bearer ${sharedKey}`);
      return new Response('data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' }
      });
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const keyStatus = await fetch(`${baseUrl}/api/account/api-key`, {
    headers: { Cookie: 'iamhujju_session=test-session' }
  });
  assert.equal((await keyStatus.json()).usingServerKey, true);

  const response = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'iamhujju_session=test-session'
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true
    })
  });
  assert.equal(response.status, 200);
});

test('OpenRouter integration requires terms acceptance and routes discovered models to chat', async t => {
  const { accountStore, pool } = await createTestStores(t);
  const user = await accountStore.register('router@example.com', 'correct horse battery');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;
  const providerKey = 'openrouter-test-secret-123456';
  const streamBody = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n';

  const app = createApp({
    accountStore,
    conversationStore: createConversationStore({ db: pool }),
    apiKey: 'server-default-secret',
    fetchImpl: async (url, options) => {
      if (url === 'https://openrouter.ai/api/v1/models/user') {
        assert.equal(options.headers.Authorization, `Bearer ${providerKey}`);
        return new Response(JSON.stringify({
          data: [{
            id: 'openai/gpt-4o-mini',
            name: 'GPT-4o mini',
            context_length: 128000
          }]
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'http://127.0.0.1:31415/v1/models?available=true') {
        assert.equal(options.headers.Authorization, 'Bearer server-default-secret');
        return new Response(JSON.stringify({
          object: 'list',
          data: [{ id: 'auto', name: 'Auto' }]
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (url === 'https://openrouter.ai/api/v1/chat/completions') {
        assert.equal(options.headers.Authorization, `Bearer ${providerKey}`);
        assert.deepEqual(JSON.parse(options.body), {
          model: 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: 'hello' }],
          stream: true
        });
        return new Response(streamBody, {
          headers: { 'Content-Type': 'text/event-stream' }
        });
      }

      throw new Error(`Unexpected upstream request: ${url}`);
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const rejected = await fetch(`${baseUrl}/api/account/integrations/openrouter`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ apiKey: providerKey, termsAccepted: false })
  });
  assert.equal(rejected.status, 400);
  assert.equal(await accountStore.getProviderApiKey(user.id, 'openrouter'), null);

  const connected = await fetch(`${baseUrl}/api/account/integrations/openrouter`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ apiKey: providerKey, termsAccepted: true })
  });
  assert.equal(connected.status, 200);
  const connectedBody = await connected.json();
  assert.equal(connectedBody.configured, true);
  assert.equal(connectedBody.modelCount, 1);
  assert.equal(JSON.stringify(connectedBody).includes(providerKey), false);
  const encrypted = await pool.query(
    `SELECT ciphertext, iv, auth_tag FROM provider_credentials
     WHERE user_id = $1 AND provider = 'openrouter'`,
    [user.id]
  );
  assert.equal(JSON.stringify(encrypted.rows).includes(providerKey), false);

  const tested = await fetch(`${baseUrl}/api/account/integrations/openrouter/test`, {
    method: 'POST',
    headers: { Cookie: cookie }
  });
  assert.equal(tested.status, 200);
  assert.equal((await tested.json()).modelCount, 1);

  const models = await fetch(`${baseUrl}/api/models`, {
    headers: { Cookie: cookie }
  });
  assert.deepEqual((await models.json()).data.map(model => model.id), [
    'auto',
    'openrouter:openai/gpt-4o-mini'
  ]);

  const completion = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      model: 'openrouter:openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true
    })
  });
  assert.equal(completion.status, 200);
  assert.equal(await completion.text(), streamBody);

  const disconnected = await fetch(`${baseUrl}/api/account/integrations/openrouter`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.equal(disconnected.status, 204);
  assert.equal(await accountStore.getProviderApiKey(user.id, 'openrouter'), null);
});

test('contact endpoint accepts valid inquiries and validates inputs', async (t) => {
  const app = createApp({
    apiKey: 'test-secret',
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const invalid = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '', email: 'invalid-email', message: '' })
  });
  assert.equal(invalid.status, 400);

  const valid = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Huzaifa Kazi',
      company: 'iamhujju',
      subject: 'Technical & Integration Support',
      telegram: '+919975649957',
      email: 'huzaifakazi1991@gmail.com',
      message: 'Hello, need information on custom model routing.'
    })
  });
  assert.equal(valid.status, 200);
  const data = await valid.json();
  assert.equal(data.success, true);
});

test('payment endpoints support Razorpay config, order creation, UPI verification, and tier updates', async (t) => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('buyer@example.com', 'secure-password-1234');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;

  const app = createApp({
    accountStore,
    apiKey: 'test-secret',
    officialUpiId: '9975649957@mbk',
    razorpayAccountName: 'iamhujju',
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // 1. Config check
  const configRes = await fetch(`${baseUrl}/api/payment/config`);
  assert.equal(configRes.status, 200);
  const config = await configRes.json();
  assert.equal(config.upiId, '9975649957@mbk');
  assert.equal(config.currency, 'INR');

  // 2. Order creation check
  const orderRes = await fetch(`${baseUrl}/api/payment/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ planId: 'pro', billingCycle: 'monthly', email: 'buyer@example.com' })
  });
  assert.equal(orderRes.status, 200);
  const orderData = await orderRes.json();
  assert.equal(orderData.success, true);
  assert.equal(orderData.amountInr, 8199);
  assert.equal(orderData.planId, 'pro');

  // 3. Payment verification with UPI reference
  const verifyRes = await fetch(`${baseUrl}/api/payment/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      planId: 'pro',
      billingCycle: 'monthly',
      upi_ref: 'UTR492819284192',
      email: 'buyer@example.com'
    })
  });
  assert.equal(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.equal(verifyData.success, true);
  assert.equal(verifyData.tier, 'pro');

  // 4. Status check
  const statusRes = await fetch(`${baseUrl}/api/subscription/status`, {
    headers: { Cookie: cookie }
  });
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.equal(statusData.tier, 'pro');
  assert.equal(statusData.isPro, true);
});

test('Razorpay order creation records pending order in database ledger with exact integer paise', async (t) => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('razorpay-buyer@example.com', 'secure-password-1234');
  const session = await accountStore.createSession(user.id);
  const cookie = 'iamhujju_session=' + session.token;

  const mockRazorpay = {
    orders: {
      create: async (params) => ({
        id: 'order_rzp_mock_12345',
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes
      })
    }
  };

  const app = createApp({
    accountStore,
    razorpayKeyId: 'rzp_test_key123',
    razorpayKeySecret: 'rzp_test_secret_abc',
    razorpayWebhookSecret: 'rzp_wh_secret_xyz',
    razorpayInstance: mockRazorpay,
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const res = await fetch(baseUrl + '/api/payments/razorpay/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ planId: 'pro', billingCycle: 'monthly', email: 'razorpay-buyer@example.com' })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.orderId, 'order_rzp_mock_12345');
  assert.equal(data.amount, 819900);
  assert.equal(data.currency, 'INR');
  assert.equal(data.keyId, 'rzp_test_key123');

  const paymentRecord = await accountStore.getPaymentByOrderId('order_rzp_mock_12345');
  assert.ok(paymentRecord, 'Payment record must be persisted in database');
  assert.equal(paymentRecord.status, 'created');
  assert.equal(paymentRecord.amount_paise, 819900);
  assert.equal(paymentRecord.plan_id, 'pro');
  assert.equal(paymentRecord.email, 'razorpay-buyer@example.com');
});

test('Razorpay Standard Checkout endpoints POST /api/create-order and POST /api/verify-payment', async (t) => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('standard-checkout@example.com', 'secure-password-1234');
  const session = await accountStore.createSession(user.id);
  const cookie = 'iamhujju_session=' + session.token;

  const mockRazorpay = {
    orders: {
      create: async (params) => ({
        id: 'order_std_test_99999',
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes
      })
    }
  };

  const keyId = 'rzp_test_U2Gc0If5PQlYDa';
  const keySecret = 'rNceyP9BPqckZebTqtI5t5jJ';

  const app = createApp({
    accountStore,
    razorpayKeyId: keyId,
    razorpayKeySecret: keySecret,
    razorpayInstance: mockRazorpay,
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // 1. Validate minimum amount enforcement (< 100 paise must return 400)
  const tooLowRes = await fetch(baseUrl + '/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ amount: 50, currency: 'INR' })
  });
  assert.equal(tooLowRes.status, 400);
  const tooLowData = await tooLowRes.json();
  assert.ok(tooLowData.error?.message?.includes('100'));

  // 2. Successful order creation at POST /api/create-order
  const createRes = await fetch(baseUrl + '/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      amount: 50000, // 500 INR in paise
      currency: 'INR',
      receipt: 'rcpt_std_test_001'
    })
  });
  assert.equal(createRes.status, 200);
  const createData = await createRes.json();
  assert.equal(createData.order_id, 'order_std_test_99999');
  assert.equal(createData.amount, 50000);
  assert.equal(createData.currency, 'INR');

  // 3. Verify payment: Missing fields must return 400
  const missingRes = await fetch(baseUrl + '/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ order_id: 'order_std_test_99999' })
  });
  assert.equal(missingRes.status, 400);

  // 4. Verify payment: Signature mismatch must return 400 and NOT mark as paid
  const mismatchRes = await fetch(baseUrl + '/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      order_id: 'order_std_test_99999',
      payment_id: 'pay_std_test_11111',
      signature: 'invalid_mismatch_signature_1234567890abcdef'
    })
  });
  assert.equal(mismatchRes.status, 400);

  // 5. Verify payment: Cryptographically valid signature returns success
  const validSignature = createHmac('sha256', keySecret)
    .update('order_std_test_99999|pay_std_test_11111')
    .digest('hex');

  const validRes = await fetch(baseUrl + '/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      order_id: 'order_std_test_99999',
      payment_id: 'pay_std_test_11111',
      signature: validSignature
    })
  });
  assert.equal(validRes.status, 200);
  const validData = await validRes.json();
  assert.equal(validData.success, true);
  assert.equal(validData.order_id, 'order_std_test_99999');
  assert.equal(validData.payment_id, 'pay_std_test_11111');
});

test('Razorpay order creation handles auth failures (401) and API errors (500)', async (t) => {
  const { accountStore } = await createTestStores(t);

  // 1. Auth failure mock (returns 401)
  const authFailRazorpay = {
    orders: {
      create: async () => {
        const err = new Error('Authentication failed');
        err.statusCode = 401;
        err.error = { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' };
        throw err;
      }
    }
  };

  const appAuthFail = createApp({
    accountStore,
    razorpayKeyId: 'invalid_key',
    razorpayKeySecret: 'invalid_secret',
    razorpayInstance: authFailRazorpay,
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server: server1, baseUrl: baseUrl1 } = await listen(appAuthFail);
  t.after(() => close(server1));

  const authFailRes = await fetch(baseUrl1 + '/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 10000, currency: 'INR' })
  });
  assert.equal(authFailRes.status, 401);
  const authFailData = await authFailRes.json();
  assert.ok(authFailData.error?.message?.includes('authentication'));

  // 2. Gateway API error mock (returns 500)
  const apiErrorRazorpay = {
    orders: {
      create: async () => {
        const err = new Error('Gateway timeout or internal error');
        err.statusCode = 500;
        err.error = { code: 'GATEWAY_ERROR', description: 'Razorpay server unavailable' };
        throw err;
      }
    }
  };

  const appApiError = createApp({
    accountStore,
    razorpayKeyId: 'key_123',
    razorpayKeySecret: 'secret_123',
    razorpayInstance: apiErrorRazorpay,
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server: server2, baseUrl: baseUrl2 } = await listen(appApiError);
  t.after(() => close(server2));

  const apiErrorRes = await fetch(baseUrl2 + '/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 10000, currency: 'INR' })
  });
  assert.equal(apiErrorRes.status, 500);
  const apiErrorData = await apiErrorRes.json();
  assert.ok(apiErrorData.error?.message?.includes('unavailable') || apiErrorData.error?.message?.includes('Failed'));
});

test('Razorpay payment verification validates HMAC SHA-256 signature, activates user tier, and enforces idempotency', async (t) => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('verified-buyer@example.com', 'secure-password-1234');
  const session = await accountStore.createSession(user.id);
  const cookie = 'iamhujju_session=' + session.token;

  const orderId = 'order_rzp_verif_777';
  const paymentId = 'pay_rzp_verif_888';
  const keySecret = 'rzp_test_secret_abc';

  await accountStore.recordPaymentOrder({
    orderId,
    userId: user.id,
    email: user.email,
    planId: 'pro',
    billingCycle: 'monthly',
    amountPaise: 819900,
    receipt: 'rcpt_test_123'
  });

  const app = createApp({
    accountStore,
    razorpayKeyId: 'rzp_test_key123',
    razorpayKeySecret: keySecret,
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const validSignature = createHmac('sha256', keySecret)
    .update(orderId + '|' + paymentId)
    .digest('hex');

  // 1. Initial verification call
  const verifyRes = await fetch(baseUrl + '/api/payments/razorpay/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      planId: 'pro',
      billingCycle: 'monthly',
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature,
      email: user.email
    })
  });
  assert.equal(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.equal(verifyData.success, true);
  assert.equal(verifyData.alreadyCaptured, false);
  assert.equal(verifyData.tier, 'pro');

  const paymentRecord = await accountStore.getPaymentByOrderId(orderId);
  assert.equal(paymentRecord.status, 'captured');
  assert.equal(paymentRecord.payment_id, paymentId);
  assert.equal(paymentRecord.signature, validSignature);

  const statusRes = await fetch(baseUrl + '/api/subscription/status', {
    headers: { Cookie: cookie }
  });
  const statusData = await statusRes.json();
  assert.equal(statusData.tier, 'pro');
  assert.equal(statusData.isPro, true);

  // 2. Idempotency check: duplicate call must return success without double mutation
  const duplicateRes = await fetch(baseUrl + '/api/payments/razorpay/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      planId: 'pro',
      billingCycle: 'monthly',
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature,
      email: user.email
    })
  });
  assert.equal(duplicateRes.status, 200);
  const duplicateData = await duplicateRes.json();
  assert.equal(duplicateData.success, true);
  assert.equal(duplicateData.alreadyCaptured, true);
});

test('GET /api/pricing returns unified catalog and GET /api/payments/history returns user ledger records', async (t) => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('pricing-user@example.com', 'secure-password-1234');
  const session = await accountStore.createSession(user.id);
  const cookie = 'iamhujju_session=' + session.token;

  const app = createApp({
    accountStore,
    razorpayKeyId: 'rzp_test_key123',
    razorpayKeySecret: 'rzp_test_secret_abc',
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // 1. GET /api/pricing
  const pricingRes = await fetch(baseUrl + '/api/pricing');
  assert.equal(pricingRes.status, 200);
  const pricingData = await pricingRes.json();
  assert.equal(pricingData.currency, 'INR');
  assert.equal(pricingData.currencySymbol, '₹');
  assert.ok(pricingData.plans.pro_monthly);
  assert.equal(pricingData.plans.pro_monthly.amountInr, 8199);
  assert.equal(pricingData.plans.pro_monthly.amountPaise, 819900);
  assert.equal(pricingData.plans.developer_monthly.amountInr, 1699);

  // 2. GET /api/payments/history unauthenticated -> 401
  const unauthHistoryRes = await fetch(baseUrl + '/api/payments/history');
  assert.equal(unauthHistoryRes.status, 401);

  // 3. Record a payment order and capture it
  const orderId = 'order_hist_test_101';
  await accountStore.recordPaymentOrder({
    orderId,
    userId: user.id,
    email: user.email,
    planId: 'pro',
    billingCycle: 'monthly',
    amountPaise: 819900,
    currency: 'INR',
    receipt: 'rcpt_hist_101',
    status: 'created'
  });
  await accountStore.markPaymentCaptured({
    orderId,
    paymentId: 'pay_hist_test_202',
    signature: 'mock_sig',
    userId: user.id,
    planId: 'pro'
  });

  // 4. GET /api/payments/history authenticated -> returns payment record
  const historyRes = await fetch(baseUrl + '/api/payments/history', {
    headers: { Cookie: cookie }
  });
  assert.equal(historyRes.status, 200);
  const historyData = await historyRes.json();
  assert.ok(Array.isArray(historyData.payments));
  assert.equal(historyData.payments.length, 1);
  assert.equal(historyData.payments[0].orderId, orderId);
  assert.equal(historyData.payments[0].paymentId, 'pay_hist_test_202');
  assert.equal(historyData.payments[0].amountInr, 8199);
  assert.equal(historyData.payments[0].amountPaise, 819900);
  assert.equal(historyData.payments[0].status, 'captured');
});

test('Razorpay payment verification rejects forged/tampered signature and records failed_verification', async (t) => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('tamper-buyer@example.com', 'secure-password-1234');
  const session = await accountStore.createSession(user.id);
  const cookie = 'iamhujju_session=' + session.token;

  const orderId = 'order_rzp_tamper_111';
  const paymentId = 'pay_rzp_tamper_222';
  const keySecret = 'rzp_test_secret_abc';

  await accountStore.recordPaymentOrder({
    orderId,
    userId: user.id,
    email: user.email,
    planId: 'pro',
    billingCycle: 'monthly',
    amountPaise: 819900,
    receipt: 'rcpt_tamper_111'
  });

  const app = createApp({
    accountStore,
    razorpayKeyId: 'rzp_test_key123',
    razorpayKeySecret: keySecret,
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const forgedSignature = 'forged_signature_00000000000000000000000000000000000000000000000000000000';
  const res = await fetch(baseUrl + '/api/payments/razorpay/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      planId: 'pro',
      billingCycle: 'monthly',
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: forgedSignature,
      email: user.email
    })
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error?.message?.includes('signature'));

  const paymentRecord = await accountStore.getPaymentByOrderId(orderId);
  assert.equal(paymentRecord.status, 'failed_verification');
});

test('Razorpay webhook failsafe verifies x-razorpay-signature and captures payment idempotently', async (t) => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('webhook-buyer@example.com', 'secure-password-1234');

  const orderId = 'order_wh_live_555';
  const paymentId = 'pay_wh_live_666';
  const webhookSecret = 'wh_secret_secure_999';

  await accountStore.recordPaymentOrder({
    orderId,
    userId: user.id,
    email: user.email,
    planId: 'pro',
    billingCycle: 'monthly',
    amountPaise: 819900,
    receipt: 'rcpt_wh_555'
  });

  const app = createApp({
    accountStore,
    razorpayWebhookSecret: webhookSecret,
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const webhookBody = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: 819900,
          currency: 'INR',
          status: 'captured',
          notes: {
            uid: user.id,
            planId: 'pro'
          }
        }
      }
    }
  });

  const validSignature = createHmac('sha256', webhookSecret)
    .update(webhookBody)
    .digest('hex');

  // 1. Missing signature rejection
  const missingSigRes = await fetch(baseUrl + '/api/webhooks/razorpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: webhookBody
  });
  assert.equal(missingSigRes.status, 400);

  // 2. Bad signature rejection
  const badSigRes = await fetch(baseUrl + '/api/webhooks/razorpay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': 'bad_tampered_signature_1234567890abcdef'
    },
    body: webhookBody
  });
  assert.equal(badSigRes.status, 400);

  // 3. Valid signature acceptance and processing
  const validWhRes = await fetch(baseUrl + '/api/webhooks/razorpay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': validSignature
    },
    body: webhookBody
  });
  assert.equal(validWhRes.status, 200);
  const validWhData = await validWhRes.json();
  assert.equal(validWhData.status, 'ok');

  const paymentRecord = await accountStore.getPaymentByOrderId(orderId);
  assert.equal(paymentRecord.status, 'captured');
  assert.equal(paymentRecord.payment_id, paymentId);

  const updatedUser = await accountStore.findUserById(user.id);
  assert.equal(updatedUser.tier, 'pro');
});

test('Razorpay webhook handles payment.failed event and marks ledger status failed', async (t) => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('failed-buyer@example.com', 'secure-password-1234');

  const orderId = 'order_wh_fail_444';
  const paymentId = 'pay_wh_fail_555';
  const webhookSecret = 'wh_secret_secure_999';

  await accountStore.recordPaymentOrder({
    orderId,
    userId: user.id,
    email: user.email,
    planId: 'pro',
    billingCycle: 'monthly',
    amountPaise: 819900,
    receipt: 'rcpt_fail_444'
  });

  const app = createApp({
    accountStore,
    razorpayWebhookSecret: webhookSecret,
    fetchImpl: async () => { throw new Error('not used'); }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const webhookBody = JSON.stringify({
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          error_description: 'Payment failed at issuing bank'
        }
      }
    }
  });

  const validSignature = createHmac('sha256', webhookSecret)
    .update(webhookBody)
    .digest('hex');

  const res = await fetch(baseUrl + '/api/webhooks/razorpay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': validSignature
    },
    body: webhookBody
  });
  assert.equal(res.status, 200);

  const paymentRecord = await accountStore.getPaymentByOrderId(orderId);
  assert.equal(paymentRecord.status, 'failed');
  assert.equal(paymentRecord.failure_reason, 'Payment failed at issuing bank');
});


// ─────────────────────────────────────────────────────────────────────────────
// API Key Management + OpenAI-compatible Gateway tests
// ─────────────────────────────────────────────────────────────────────────────

const FAKE_STREAM = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n';
const FAKE_COMPLETION = JSON.stringify({
  id: 'chatcmpl-test',
  object: 'chat.completion',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }]
});
const FAKE_MODELS = JSON.stringify({
  object: 'list',
  data: [{ id: 'auto', name: 'Auto', object: 'model' }]
});

function makeFetchForGateway({ _streamResponse = false } = {}) {
  return async (url, options) => {
    if (url.includes('/models')) {
      return new Response(FAKE_MODELS, { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/chat/completions')) {
      const body = JSON.parse(options.body);
      if (body.stream) {
        return new Response(FAKE_STREAM, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response(FAKE_COMPLETION, { headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected upstream URL: ${url}`);
  };
}

test('POST /api/keys creates a named key with sk-hujju- prefix and stored hash', async t => {
  const { accountStore, pool } = await createTestStores(t);
  const user = await accountStore.register('keytest@example.com', 'correct horse battery');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway()
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // POST /api/keys requires name
  const badReq = await fetch(`${baseUrl}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({})
  });
  assert.equal(badReq.status, 400);

  const res = await fetch(`${baseUrl}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'My Cursor IDE Key' })
  });
  assert.equal(res.status, 201);
  const body = await res.json();

  // rawKey must have correct prefix
  assert.match(body.rawKey, /^sk-hujju-[0-9a-f]{48}$/);
  // metadata returned
  assert.equal(body.key.name, 'My Cursor IDE Key');
  assert.equal(body.key.status, 'active');
  // prefix is masked
  assert.match(body.key.prefix, /^sk-hujju-••••.{4}$/);

  // Verify hash was stored and rawKey does NOT appear in DB
  const dbRows = await pool.query('SELECT key_hash FROM api_keys WHERE user_id = $1', [user.id]);
  assert.equal(dbRows.rows.length, 1);
  assert.ok(!JSON.stringify(dbRows.rows).includes(body.rawKey), 'raw key must not appear in DB');
});

test('GET /api/keys lists active keys with masked prefix and correct counts', async t => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('listkeys@example.com', 'correct horse battery');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway()
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // No keys yet
  const emptyRes = await fetch(`${baseUrl}/api/keys`, { headers: { Cookie: cookie } });
  assert.equal(emptyRes.status, 200);
  const { keys: emptyKeys } = await emptyRes.json();
  assert.equal(emptyKeys.length, 0);

  // Create two keys
  await fetch(`${baseUrl}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Key Alpha' })
  });
  await fetch(`${baseUrl}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Key Beta' })
  });

  const listRes = await fetch(`${baseUrl}/api/keys`, { headers: { Cookie: cookie } });
  assert.equal(listRes.status, 200);
  const { keys } = await listRes.json();
  assert.equal(keys.length, 2);

  for (const key of keys) {
    // Prefix is masked: starts with sk-hujju-••••
    assert.match(key.prefix, /^sk-hujju-••••/);
    assert.equal(key.status, 'active');
    assert.equal(key.requestCount, 0);
    assert.ok('id' in key && 'name' in key && 'createdAt' in key);
  }
});

test('GET /v1/models with valid sk-hujju- bearer token returns 200 and model list', async t => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('v1models@example.com', 'correct horse battery');
  const { rawKey } = await accountStore.createApiKey(user.id, 'Test Key');

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway()
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const res = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${rawKey}` }
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.object, 'list');
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length > 0);

  // Also check CORS header
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('POST /v1/chat/completions with valid sk-hujju- bearer token returns 200 and completion', async t => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('v1chat@example.com', 'correct horse battery');
  const { rawKey } = await accountStore.createApiKey(user.id, 'Chat Key');

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway()
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${rawKey}`
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'Hello' }]
    })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.choices || data.id || data.object, 'completion response must contain completion fields');
});

test('POST /v1/chat/completions with stream:true returns 200 with text/event-stream', async t => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('v1stream@example.com', 'correct horse battery');
  const { rawKey } = await accountStore.createApiKey(user.id, 'Stream Key');

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway({ streamResponse: true })
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${rawKey}`
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true
    })
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
  const text = await res.text();
  assert.match(text, /data:.*DONE/);
});

test('POST /api/keys/:keyId/regenerate generates a new key and returns rawKey', async t => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('regen@example.com', 'correct horse battery');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway()
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // Create initial key
  const createRes = await fetch(`${baseUrl}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Regen Key' })
  });
  const { key: { id: keyId }, rawKey: originalKey } = await createRes.json();

  // Regenerate
  const regenRes = await fetch(`${baseUrl}/api/keys/${keyId}/regenerate`, {
    method: 'POST',
    headers: { Cookie: cookie }
  });
  assert.equal(regenRes.status, 200);
  const regenBody = await regenRes.json();
  const newRawKey = regenBody.rawKey;

  assert.match(newRawKey, /^sk-hujju-[0-9a-f]{48}$/);
  assert.notEqual(newRawKey, originalKey, 'regenerated key must differ from original');
  assert.equal(regenBody.key.status, 'active');
  assert.equal(regenBody.key.name, 'Regen Key');
});

test('old revoked key is rejected 401 and new regenerated key returns 200', async t => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('revoke-regen@example.com', 'correct horse battery');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway()
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // Create key
  const createRes = await fetch(`${baseUrl}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Revokeable Key' })
  });
  const { key: { id: keyId }, rawKey: oldKey } = await createRes.json();

  // Regenerate (revokes old key)
  const regenRes = await fetch(`${baseUrl}/api/keys/${keyId}/regenerate`, {
    method: 'POST',
    headers: { Cookie: cookie }
  });
  const { rawKey: newKey } = await regenRes.json();

  // Old key → 401 with invalid_api_key code
  const oldKeyRes = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${oldKey}`
    },
    body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] })
  });
  assert.equal(oldKeyRes.status, 401);
  const oldKeyBody = await oldKeyRes.json();
  assert.equal(oldKeyBody.error.code, 'invalid_api_key');
  assert.equal(oldKeyBody.error.type, 'invalid_request_error');

  // New key → 200
  const newKeyRes = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${newKey}`
    },
    body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] })
  });
  assert.equal(newKeyRes.status, 200);
});

test('DELETE /api/keys/:keyId permanently revokes key (401 on subsequent use)', async t => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('delete-key@example.com', 'correct horse battery');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway()
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // Create key
  const createRes = await fetch(`${baseUrl}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'To Delete' })
  });
  const { key: { id: keyId }, rawKey } = await createRes.json();

  // Confirm it works
  const beforeDelete = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${rawKey}` }
  });
  assert.equal(beforeDelete.status, 200);

  // Delete
  const deleteRes = await fetch(`${baseUrl}/api/keys/${keyId}`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.equal(deleteRes.status, 204);

  // Key no longer in list
  const listRes = await fetch(`${baseUrl}/api/keys`, { headers: { Cookie: cookie } });
  const { keys } = await listRes.json();
  assert.ok(!keys.some(k => k.id === keyId), 'deleted key must not appear in list');

  // Key is rejected
  const afterDelete = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${rawKey}` }
  });
  assert.equal(afterDelete.status, 401);
});

test('edge cases: invalid key format, missing key, revoked key, wrong model', async t => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('edges@example.com', 'correct horse battery');
  const { rawKey } = await accountStore.createApiKey(user.id, 'Edge Key');

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: async (url) => {
      if (url.includes('/models')) return new Response(FAKE_MODELS, { headers: { 'Content-Type': 'application/json' } });
      // Wrong model → 404 from upstream
      return new Response(JSON.stringify({ error: { message: 'Model not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const chatPayload = (model = 'auto') => JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'hi' }]
  });

  // Missing Authorization header → 401
  const noAuth = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: chatPayload()
  });
  assert.equal(noAuth.status, 401);
  const noAuthBody = await noAuth.json();
  assert.equal(noAuthBody.error.code, 'invalid_api_key');

  // Invalid key format (not sk-hujju- prefix) → 401
  const badFormat = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: 'Bearer sk-openai-notours1234567890' }
  });
  assert.equal(badFormat.status, 401);

  // Completely wrong key → 401
  const wrongKey = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: 'Bearer sk-hujju-aabbccddeeff00112233445566778899aabbccddeeff0011' }
  });
  assert.equal(wrongKey.status, 401);

  // Valid key but wrong model (upstream 404) → passes through upstream error status
  const wrongModel = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${rawKey}`
    },
    body: chatPayload('nonexistent/model-xyz')
  });
  // Should propagate upstream error (not 200)
  assert.notEqual(wrongModel.status, 200);

  // OPTIONS preflight → 204 with CORS headers
  const preflight = await fetch(`${baseUrl}/v1/models`, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
});

test('request_count is incremented on each verified gateway use', async t => {
  const { accountStore, pool } = await createTestStores(t);
  const user = await accountStore.register('tracking@example.com', 'correct horse battery');
  const { rawKey, key: { id: keyId } } = await accountStore.createApiKey(user.id, 'Tracking Key');

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway()
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // Two gateway requests
  for (let i = 0; i < 2; i++) {
    await fetch(`${baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${rawKey}` } });
  }

  const row = await pool.query('SELECT request_count FROM api_keys WHERE id = $1', [keyId]);
  assert.equal(row.rows[0].request_count, 2);
});

test('/api/keys endpoints require authentication (no session, no bearer)', async t => {
  const { accountStore } = await createTestStores(t);

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway()
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const listRes = await fetch(`${baseUrl}/api/keys`);
  assert.equal(listRes.status, 401);

  const createRes = await fetch(`${baseUrl}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Unauthorized Key' })
  });
  assert.equal(createRes.status, 401);
});

test('DELETE /api/keys/:keyId with non-existent keyId returns 404', async t => {
  const { accountStore } = await createTestStores(t);
  const user = await accountStore.register('notfound@example.com', 'correct horse battery');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;

  const app = createApp({
    accountStore,
    apiKey: 'server-key',
    allowSharedGatewayKey: true,
    fetchImpl: makeFetchForGateway()
  });
  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const fakeId = randomUUID();
  const res = await fetch(`${baseUrl}/api/keys/${fakeId}`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.equal(res.status, 404);
});

test('External providers (ElectronHub, Groq, FreeModel) can be connected, discovered, chatted with, and revoked', async t => {
  const { accountStore, pool } = await createTestStores(t);
  const user = await accountStore.register('multiprovider@example.com', 'correct horse battery');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;

  const electronHubKey = 'ek-live-test-key-12345678';
  const groqKey = 'gsk_live_test_key_87654321';
  const freeModelKey = 'fm_live_test_key_abcdef12';

  const streamChunk = 'data: {"choices":[{"delta":{"content":"ok"}}]}\\n\\ndata: [DONE]\\n\\n';

  const app = createApp({
    accountStore,
    conversationStore: createConversationStore({ db: pool }),
    apiKey: 'server-default-secret',
    fetchImpl: async (url, options) => {
      // 1. ElectronHub models
      if (url === 'https://api.electronhub.ai/v1/models') {
        assert.equal(options.headers.Authorization, `Bearer ${electronHubKey}`);
        return new Response(JSON.stringify({
          data: [{ id: 'gpt-4o', name: 'GPT-4o', context_window: 128000 }]
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // 2. Groq models
      if (url === 'https://api.groq.com/openai/v1/models') {
        assert.equal(options.headers.Authorization, `Bearer ${groqKey}`);
        return new Response(JSON.stringify({
          data: [{ id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', context_window: 128000 }]
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // 3. FreeModel models
      if (url === 'https://freemodel.in/v1/models') {
        assert.equal(options.headers.Authorization, `Bearer ${freeModelKey}`);
        return new Response(JSON.stringify({
          data: [{ id: 'claude-opus-4.8', name: 'Claude Opus 4.8', context_window: 200000 }]
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // FreeLLMAPI default
      if (url === 'http://127.0.0.1:31415/v1/models?available=true') {
        return new Response(JSON.stringify({
          object: 'list',
          data: [{ id: 'auto', name: 'Auto' }]
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // Chat completions
      if (url === 'https://api.electronhub.ai/v1/chat/completions') {
        assert.equal(options.headers.Authorization, `Bearer ${electronHubKey}`);
        const parsed = JSON.parse(options.body);
        assert.equal(parsed.model, 'gpt-4o');
        return new Response(streamChunk, { headers: { 'Content-Type': 'text/event-stream' } });
      }

      if (url === 'https://api.groq.com/openai/v1/chat/completions') {
        assert.equal(options.headers.Authorization, `Bearer ${groqKey}`);
        const parsed = JSON.parse(options.body);
        assert.equal(parsed.model, 'llama-3.3-70b-versatile');
        return new Response(streamChunk, { headers: { 'Content-Type': 'text/event-stream' } });
      }

      if (url === 'https://freemodel.in/v1/chat/completions') {
        assert.equal(options.headers.Authorization, `Bearer ${freeModelKey}`);
        const parsed = JSON.parse(options.body);
        assert.equal(parsed.model, 'claude-opus-4.8');
        return new Response(streamChunk, { headers: { 'Content-Type': 'text/event-stream' } });
      }

      throw new Error(`Unexpected upstream request: ${url}`);
    }
  });

  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // Connect ElectronHub
  const ehRes = await fetch(`${baseUrl}/api/account/integrations/electronhub`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ apiKey: electronHubKey })
  });
  assert.equal(ehRes.status, 200);
  const ehData = await ehRes.json();
  assert.equal(ehData.configured, true);
  assert.equal(ehData.modelCount, 1);

  // Connect Groq
  const groqRes = await fetch(`${baseUrl}/api/account/integrations/groq`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ apiKey: groqKey })
  });
  assert.equal(groqRes.status, 200);
  const groqData = await groqRes.json();
  assert.equal(groqData.configured, true);

  // Connect FreeModel
  const fmRes = await fetch(`${baseUrl}/api/account/integrations/freemodel`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ apiKey: freeModelKey })
  });
  assert.equal(fmRes.status, 200);
  const fmData = await fmRes.json();
  assert.equal(fmData.configured, true);

  // Check /api/models discovery includes models from all 3 connected providers
  const modelsRes = await fetch(`${baseUrl}/api/models`, {
    headers: { Cookie: cookie }
  });
  assert.equal(modelsRes.status, 200);
  const modelList = await modelsRes.json();
  const modelIds = modelList.data.map(m => m.id);
  assert.ok(modelIds.includes('electronhub:gpt-4o'), 'Missing electronhub:gpt-4o');
  assert.ok(modelIds.includes('groq:llama-3.3-70b-versatile'), 'Missing groq:llama-3.3-70b-versatile');
  assert.ok(modelIds.includes('freemodel:claude-opus-4.8'), 'Missing freemodel:claude-opus-4.8');

  // Test chat completion with ElectronHub
  const ehChat = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      model: 'electronhub:gpt-4o',
      messages: [{ role: 'user', content: 'test electronhub' }],
      stream: true
    })
  });
  assert.equal(ehChat.status, 200);

  // Test chat completion with Groq
  const groqChat = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      model: 'groq:llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'test groq' }],
      stream: true
    })
  });
  assert.equal(groqChat.status, 200);

  // Test chat completion with FreeModel
  const fmChat = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      model: 'freemodel:claude-opus-4.8',
      messages: [{ role: 'user', content: 'test freemodel' }],
      stream: true
    })
  });
  assert.equal(fmChat.status, 200);

  // Revoke/Disconnect ElectronHub
  const delRes = await fetch(`${baseUrl}/api/account/integrations/electronhub`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.equal(delRes.status, 204);
  assert.equal(await accountStore.getProviderApiKey(user.id, 'electronhub'), null);
});


test('High-Capacity Multi-Key Load Balancing & Failover: 429 rate limit triggers 60s cooldown and transparent retry on next key', async t => {
  const { accountStore, pool } = await createTestStores(t);
  const user = await accountStore.register('failover@example.com', 'correct horse battery');
  const session = await accountStore.createSession(user.id);
  const cookie = `iamhujju_session=${session.token}`;

  const poolKeys = ['sk-pool-key-alpha-12345678', 'sk-pool-key-bravo-87654321'];
  let attemptsCount = 0;
  const attemptedKeys = [];

  const customKeyPool = new KeyPool();
  customKeyPool.registerPool('openrouter', poolKeys);

  const streamBody = 'data: {"choices":[{"delta":{"content":"failover success"}}]}\\n\\ndata: [DONE]\\n\\n';

  const app = createApp({
    accountStore,
    conversationStore: createConversationStore({ db: pool }),
    keyPool: customKeyPool,
    fetchImpl: async (url, options) => {
      if (url === 'https://openrouter.ai/api/v1/chat/completions') {
        attemptsCount++;
        const authKey = options.headers.Authorization.replace('Bearer ', '');
        attemptedKeys.push(authKey);

        // Key 1 hits 429 Rate Limit
        if (authKey === poolKeys[0]) {
          return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded: 429 Too Many Requests' } }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Key 2 succeeds!
        if (authKey === poolKeys[1]) {
          return new Response(streamBody, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' }
          });
        }
      }

      throw new Error(`Unexpected request: ${url}`);
    }
  });

  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  // Chat completion request to a free openrouter model
  const res = await fetch(`${baseUrl}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      model: 'openrouter:openrouter/free',
      messages: [{ role: 'user', content: 'test rate-limit failover' }],
      stream: true
    })
  });

  // Must succeed with 200 without exposing 429 to the client!
  assert.equal(res.status, 200);
  assert.equal(await res.text(), streamBody);

  // Both keys were attempted in order
  assert.equal(attemptsCount, 2);
  assert.equal(attemptedKeys[0], poolKeys[0]);
  assert.equal(attemptedKeys[1], poolKeys[1]);

  // Key 1 is now in cooldown
  const status = customKeyPool.getStatus();
  assert.equal(status.openrouter.inCooldown, 1);
  assert.equal(status.openrouter.healthyKeys, 1);
});

test('Universal Gateway: owner master key, auto router, streaming SSE, and no HTML route leaks', async t => {
  const { accountStore } = await createTestStores(t);
  const customKeyPool = new KeyPool();
  customKeyPool.registerPool('openrouter', ['sk-openrouter-universal-test']);

  const streamBody = 'data: {"choices":[{"delta":{"content":"Live stream response"}}]}\n\ndata: [DONE]\n\n';

  const app = createApp({
    accountStore,
    keyPool: customKeyPool,
    serverOpenRouterKey: 'sk-openrouter-universal-test',
    fetchImpl: async (url, options) => {
      if (url.includes('/models')) {
        return new Response(JSON.stringify({
          data: [
            { id: 'openrouter/free', name: 'OpenRouter Free Auto' },
            { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 Free' }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/chat/completions')) {
        const body = JSON.parse(options.body);
        if (body.stream) {
          return new Response(streamBody, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' }
          });
        }
        return new Response(JSON.stringify({
          id: 'chatcmpl-universal-1',
          object: 'chat.completion',
          choices: [{ message: { role: 'assistant', content: 'Universal OK' } }],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  });

  const { server, baseUrl } = await listen(app);
  t.after(() => close(server));

  const masterKey = 'sk-hujju-29ad913a79d5ff69580b1dbb9993fe70c5588006e89b5dee';

  // 1. GET /v1/models with master key
  const modelsRes = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${masterKey}` }
  });
  assert.equal(modelsRes.status, 200);
  assert.equal(modelsRes.headers.get('access-control-allow-origin'), '*');
  const modelsData = await modelsRes.json();
  assert.equal(modelsData.object, 'list');
  assert.ok(Array.isArray(modelsData.data));
  assert.ok(modelsData.data.length >= 2);

  // 2. GET /v1/models/ with trailing slash
  const modelsSlashRes = await fetch(`${baseUrl}/v1/models/`, {
    headers: { Authorization: `Bearer ${masterKey}` }
  });
  assert.equal(modelsSlashRes.status, 200);

  // 3. POST /v1/chat/completions with model: 'auto' (Non-streaming)
  const chatRes = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${masterKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'Say OK' }]
    })
  });
  assert.equal(chatRes.status, 200);
  const chatData = await chatRes.json();
  assert.equal(chatData.choices[0].message.content, 'Universal OK');

  // 4. POST /v1/chat/completions with stream: true (Streaming SSE)
  const streamRes = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${masterKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'Stream test' }],
      stream: true
    })
  });
  assert.equal(streamRes.status, 200);
  assert.match(streamRes.headers.get('content-type'), /text\/event-stream/);
  const streamText = await streamRes.text();
  assert.equal(streamText, streamBody);

  // 5. Unhandled /v1/unknown-path returns JSON 404, NEVER HTML
  const notFoundRes = await fetch(`${baseUrl}/v1/unknown-path`, {
    headers: { Authorization: `Bearer ${masterKey}` }
  });
  assert.equal(notFoundRes.status, 404);
  const notFoundData = await notFoundRes.json();
  assert.equal(notFoundData.error.code, 'route_not_found');
  assert.match(notFoundData.error.message, /Route not found/);
});
