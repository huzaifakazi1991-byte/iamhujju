import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { DataType, newDb } from 'pg-mem';
import { createAccountStore } from './authStore.js';
import { migrateDatabase } from './database.js';
import { createConversationStore } from './conversationStore.js';
import { createApp } from './server.js';

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
