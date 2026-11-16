import express from 'express';
import dotenv from 'dotenv';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { createAccountStore, sessionMaxAgeSeconds } from './authStore.js';
import { closeDatabase, getDatabasePool, migrateDatabase } from './database.js';
import { createConversationStore } from './conversationStore.js';

dotenv.config();

const DEFAULT_API_BASE = 'http://127.0.0.1:31415/v1';
const DEFAULT_OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 180000;
const SESSION_COOKIE = 'iamhujju_session';
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIRECTORY = path.join(PROJECT_ROOT, 'dist');
const INDEX_FILE = path.join(DIST_DIRECTORY, 'index.html');

function getSessionToken(req) {
  const cookies = req.headers.cookie?.split(';') || [];
  const cookie = cookies.find(item => item.trim().startsWith(`${SESSION_COOKIE}=`));
  return cookie?.trim().slice(SESSION_COOKIE.length + 1) || null;
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionMaxAgeSeconds}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}

function normalizeApiBase(apiBase) {
  const url = new URL(apiBase);

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('FREELLMAPI_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.');
  }

  return url.toString().replace(/\/+$/, '');
}

function requestAbortSignal(req, res, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timeout.unref?.();

  const abortOnDisconnect = () => {
    if (!res.writableEnded) controller.abort();
  };

  req.once('aborted', abortOnDisconnect);
  res.once('close', abortOnDisconnect);

  return {
    controller,
    get timedOut() {
      return timedOut;
    },
    cleanup() {
      clearTimeout(timeout);
      req.removeListener('aborted', abortOnDisconnect);
      res.removeListener('close', abortOnDisconnect);
    }
  };
}

function safeUpstreamMessage(body, status, apiKey, provider = 'FreeLLMAPI') {
  let message;

  try {
    const data = JSON.parse(body);
    message = data?.error?.message
      || (typeof data?.error === 'string' ? data.error : '')
      || data?.message;
  } catch {
    message = '';
  }

  if (typeof message !== 'string' || !message.trim()) {
    return `${provider} rejected the request (HTTP ${status}).`;
  }

  const cleanMessage = Array.from(message, character => {
    const codePoint = character.codePointAt(0);
    return codePoint < 32 || codePoint === 127 ? ' ' : character;
  }).join('');

  const withoutBearerTokens = cleanMessage
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]');
  const redacted = apiKey
    ? withoutBearerTokens.replace(apiKey, '[redacted]')
    : withoutBearerTokens;

  return redacted
    .trim()
    .slice(0, 500);
}

const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
}).strict();

const apiKeySchema = z.object({
  apiKey: z.string().trim().min(16).max(4096)
}).strict();

const openRouterKeySchema = z.object({
  apiKey: z.string().trim().min(16).max(4096),
  termsAccepted: z.literal(true)
}).strict();

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().max(100000)
}).passthrough();

const savedConversationSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().max(500),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().max(100000)
  }).passthrough()).max(1000)
}).passthrough().superRefine((conversation, context) => {
  const contentLength = conversation.messages.reduce(
    (total, message) => total + message.content.length,
    0
  );
  if (contentLength > 800000) {
    context.addIssue({
      code: 'custom',
      message: 'A conversation is too large to save.',
      path: ['messages']
    });
  }
});

const saveConversationSchema = z.object({
  title: z.string().max(500),
  messages: savedConversationSchema.shape.messages,
  createdAt: z.string().datetime().nullable().optional(),
  activeConversationId: z.string().max(128).nullable().optional()
}).strict();

const importConversationsSchema = z.object({
  conversations: z.array(savedConversationSchema).max(100),
  activeConversationId: z.string().max(128).nullable()
}).strict().superRefine((body, context) => {
  const totalLength = body.conversations.reduce(
    (total, conversation) => total + conversation.messages.reduce(
      (messageTotal, message) => messageTotal + message.content.length,
      0
    ),
    0
  );
  if (totalLength > 900000) {
    context.addIssue({
      code: 'custom',
      message: 'The browser conversation import is too large.',
      path: ['conversations']
    });
  }
});

const activeConversationSchema = z.object({
  activeConversationId: z.string().max(128).nullable()
}).strict();

const chatRequestSchema = z.object({
  model: z.string().trim().min(1).max(256),
  messages: z.array(chatMessageSchema).min(1).max(100),
  stream: z.boolean().optional()
}).passthrough().superRefine((body, context) => {
  if (!body.messages.some(message => message.role === 'user')) {
    context.addIssue({
      code: 'custom',
      message: 'A user message is required.',
      path: ['messages']
    });
  }
});

function validatedBody(schema, req, res, message) {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: { message } });
    return null;
  }
  return result.data;
}

export function createApp({
  apiBase = process.env.FREELLMAPI_BASE_URL || DEFAULT_API_BASE,
  apiKey = process.env.FREELLMAPI_KEY || '',
  allowSharedGatewayKey = process.env.ALLOW_SHARED_FREELLMAPI_KEY === 'true',
  serverOpenRouterKey = process.env.OPENROUTER_API_KEY || '',
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  accountStore = createAccountStore(),
  conversationStore = createConversationStore(),
  rateLimits = {},
  allowedOrigins = process.env.APP_ORIGIN
    ? [process.env.APP_ORIGIN]
    : process.env.NODE_ENV === 'production'
      ? []
      : [
          'http://localhost:5173',
          'http://localhost:5174',
          'http://127.0.0.1:5173',
          'http://127.0.0.1:5174'
        ]
} = {}) {
  const upstreamBase = normalizeApiBase(apiBase);
  const openRouterUpstreamBase = DEFAULT_OPENROUTER_BASE;
  const app = express();
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  const originAllowlist = new Set(allowedOrigins.map(origin => new URL(origin).origin));
  const makeRateLimiter = (limit, windowMs, message) => rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message } }
  });
  const authRateLimiter = makeRateLimiter(
    rateLimits.auth || 10,
    15 * 60 * 1000,
    'Too many account requests. Try again later.'
  );
  const chatRateLimiter = makeRateLimiter(
    rateLimits.chat || 15,
    60 * 1000,
    'Too many chat requests. Wait a minute before trying again.'
  );
  const modelsRateLimiter = makeRateLimiter(
    rateLimits.models || 20,
    60 * 1000,
    'Too many model refresh requests. Wait a minute before trying again.'
  );
  const credentialRateLimiter = makeRateLimiter(
    rateLimits.credentials || 5,
    15 * 60 * 1000,
    'Too many provider key checks. Try again later.'
  );
  const conversationRateLimiter = makeRateLimiter(
    rateLimits.conversations || 60,
    60 * 1000,
    'Too many conversation updates. Try again shortly.'
  );

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']
      }
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
  app.use('/api', (req, res, next) => {
    const origin = req.get('Origin');
    if (!origin) return next();

    let normalizedOrigin;
    try {
      normalizedOrigin = new URL(origin).origin;
    } catch {
      return res.status(403).json({ error: { message: 'Request origin is not allowed.' } });
    }

    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    if (
      normalizedOrigin !== requestOrigin &&
      !originAllowlist.has(normalizedOrigin)
    ) {
      return res.status(403).json({ error: { message: 'Request origin is not allowed.' } });
    }

    next();
  });
  app.use(express.json({ limit: '1mb' }));

  async function getCurrentUser(req) {
    const token = getSessionToken(req);
    return token ? accountStore.getUserForSession(token) : null;
  }

  async function getApiKeyForRequest(req) {
    const user = await getCurrentUser(req);
    const accountApiKey = user && typeof accountStore.getApiKey === 'function'
      ? await accountStore.getApiKey(user.id)
      : null;
    return accountApiKey || apiKey;
  }

  async function getOpenRouterKeyForUser(userId) {
    return typeof accountStore.getProviderApiKey === 'function'
      ? await accountStore.getProviderApiKey(userId, 'openrouter')
      : null;
  }

  async function requireAccount(req, res) {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: { message: 'Sign in to manage API keys.' } });
      return null;
    }
    return user;
  }

  async function verifyGatewayApiKey(candidate, signal) {
    const response = await fetchImpl(
      `${upstreamBase}/models?available=true`,
      {
        headers: { Authorization: `Bearer ${candidate}` },
        signal
      }
    );
    const body = await response.text();

    if (!response.ok) {
      const error = new Error(safeUpstreamMessage(body, response.status, candidate));
      error.status = response.status;
      throw error;
    }

    let result;
    try {
      result = JSON.parse(body);
    } catch {
      const error = new Error('FreeLLMAPI returned an invalid model list.');
      error.status = 502;
      throw error;
    }

    if (!Array.isArray(result?.data)) {
      const error = new Error('FreeLLMAPI returned an invalid model list.');
      error.status = 502;
      throw error;
    }

    return result.data.filter(model => model && typeof model.id === 'string').length;
  }

  async function verifyOpenRouterApiKey(candidate, signal) {
    const response = await fetchImpl(
      `${openRouterUpstreamBase}/models/user`,
      {
        headers: {
          Authorization: `Bearer ${candidate}`,
          'X-OpenRouter-Title': 'iamhujju'
        },
        signal
      }
    );
    const body = await response.text();

    if (!response.ok) {
      const error = new Error(
        safeUpstreamMessage(body, response.status, candidate, 'OpenRouter')
      );
      error.status = response.status;
      throw error;
    }

    let result;
    try {
      result = JSON.parse(body);
    } catch {
      const error = new Error('OpenRouter returned an invalid model list.');
      error.status = 502;
      throw error;
    }

    if (!Array.isArray(result?.data)) {
      const error = new Error('OpenRouter returned an invalid model list.');
      error.status = 502;
      throw error;
    }

    return result.data.filter(model => model && typeof model.id === 'string').length;
  }

  function openRouterModel(model) {
    const id = typeof model.id === 'string' ? model.id : '';
    return {
      ...model,
      id: `openrouter:${id}`,
      sourceId: id,
      provider: 'openrouter',
      name: model.name || id,
      owned_by: 'openrouter',
      context_window: model.context_length,
      available: true
    };
  }

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      apiKeyConfigured: Boolean(apiKey)
    });
  });

  app.post('/api/auth/signup', authRateLimiter, async (req, res) => {
    const body = validatedBody(
      signupSchema,
      req,
      res,
      'Enter a valid email address and a password of 12-128 characters.'
    );
    if (!body) return;
    try {
      const user = await accountStore.register(body.email, body.password);
      const session = await accountStore.createSession(user.id);
      res.set('Cache-Control', 'no-store');
      setSessionCookie(res, session.token);
      res.status(201).json({ user });
    } catch (error) {
      if (error.code === 'INVALID_EMAIL' || error.code === 'INVALID_PASSWORD') {
        return res.status(400).json({ error: { message: error.message } });
      }
      if (error.code === 'EMAIL_EXISTS') {
        return res.status(409).json({ error: { message: error.message } });
      }
      throw error;
    }
  });

  app.post('/api/auth/login', authRateLimiter, async (req, res) => {
    const body = validatedBody(
      loginSchema,
      req,
      res,
      'Enter a valid email address and password.'
    );
    if (!body) return;
    const user = await accountStore.authenticate(body.email, body.password);

    if (!user) {
      return res.status(401).json({
        error: { message: 'Email or password is incorrect.' }
      });
    }

    const session = await accountStore.createSession(user.id);
    res.set('Cache-Control', 'no-store');
    setSessionCookie(res, session.token);
    res.json({ user });
  });

  app.get('/api/auth/me', async (req, res) => {
    const user = await getCurrentUser(req);
    res.set('Cache-Control', 'no-store').json({ user });
  });

  app.post('/api/auth/logout', async (req, res) => {
    await accountStore.revokeSession(getSessionToken(req));
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.get('/api/account/api-key', async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    if (typeof accountStore.getApiKeyStatus !== 'function') {
      return res.status(503).json({
        error: { message: 'Per-account API keys are not available in this account store.' }
      });
    }

    const status = await accountStore.getApiKeyStatus(user.id);
    res.set('Cache-Control', 'no-store').json({
      ...status,
      canConfigure: Boolean(accountStore.apiKeysEnabled),
      usingServerKey: !status.configured && Boolean(apiKey) && allowSharedGatewayKey
    });
  });

  app.put('/api/account/api-key', credentialRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    if (
      typeof accountStore.setApiKey !== 'function' ||
      typeof accountStore.apiKeysEnabled !== 'boolean'
    ) {
      return res.status(503).json({
        error: { message: 'Per-account API keys are not available in this account store.' }
      });
    }
    if (!accountStore.apiKeysEnabled) {
      return res.status(503).json({
        error: { message: 'API key encryption is not configured on the local server.' }
      });
    }

    const body = validatedBody(
      apiKeySchema,
      req,
      res,
      'Enter a valid FreeLLMAPI key (16-4096 characters).'
    );
    if (!body) return;
    const candidate = body.apiKey;

    const request = requestAbortSignal(req, res, Math.min(timeoutMs, 15000));
    let verified = false;
    try {
      const modelCount = await verifyGatewayApiKey(candidate, request.controller.signal);
      verified = true;
      const status = await accountStore.setApiKey(user.id, candidate);
      res.set('Cache-Control', 'no-store').json({ ...status, modelCount });
    } catch (error) {
      const status = error.status || (verified ? 500 : request.timedOut ? 504 : 502);
      const message = error.status
        ? error.message
        : verified
          ? 'The key was verified but could not be saved securely.'
          : request.timedOut
            ? 'FreeLLMAPI did not respond in time while checking the key.'
            : 'Could not connect to FreeLLMAPI while checking the key.';
      if (!res.headersSent && !res.destroyed) {
        res.status(status).json({ error: { message } });
      }
    } finally {
      request.cleanup();
    }
  });

  app.post('/api/account/api-key/test', credentialRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    if (
      typeof accountStore.getApiKey !== 'function' ||
      typeof accountStore.markApiKeyTested !== 'function'
    ) {
      return res.status(503).json({
        error: { message: 'Per-account API keys are not available in this account store.' }
      });
    }

    const candidate = await accountStore.getApiKey(user.id);
    if (!candidate) {
      return res.status(404).json({
        error: { message: 'No FreeLLMAPI key is configured for this account.' }
      });
    }

    const request = requestAbortSignal(req, res, Math.min(timeoutMs, 15000));
    try {
      const modelCount = await verifyGatewayApiKey(candidate, request.controller.signal);
      const status = await accountStore.markApiKeyTested(user.id);
      res.set('Cache-Control', 'no-store').json({ ...status, modelCount });
    } catch (error) {
      const status = error.status || (request.timedOut ? 504 : 502);
      const message = error.status
        ? error.message
        : request.timedOut
          ? 'FreeLLMAPI did not respond in time while checking the key.'
          : 'Could not connect to FreeLLMAPI while checking the key.';
      if (!res.headersSent && !res.destroyed) {
        res.status(status).json({ error: { message } });
      }
    } finally {
      request.cleanup();
    }
  });

  app.delete('/api/account/api-key', async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    if (typeof accountStore.revokeApiKey !== 'function') {
      return res.status(503).json({
        error: { message: 'Per-account API keys are not available in this account store.' }
      });
    }

    await accountStore.revokeApiKey(user.id);
    res.set('Cache-Control', 'no-store').status(204).end();
  });

  app.get('/api/account/integrations/openrouter', async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    if (typeof accountStore.getProviderApiKeyStatus !== 'function') {
      return res.status(503).json({
        error: { message: 'Provider integrations are not available in this account store.' }
      });
    }

    res.set('Cache-Control', 'no-store').json({
      ...await accountStore.getProviderApiKeyStatus(user.id, 'openrouter'),
      canConfigure: Boolean(accountStore.apiKeysEnabled)
    });
  });

  app.put('/api/account/integrations/openrouter', credentialRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    if (
      typeof accountStore.setProviderApiKey !== 'function' ||
      typeof accountStore.apiKeysEnabled !== 'boolean'
    ) {
      return res.status(503).json({
        error: { message: 'OpenRouter integration is not available in this account store.' }
      });
    }
    if (!accountStore.apiKeysEnabled) {
      return res.status(503).json({
        error: { message: 'API key encryption is not configured on the local server.' }
      });
    }
    const body = validatedBody(
      openRouterKeySchema,
      req,
      res,
      req.body?.termsAccepted === true
        ? 'Enter a valid OpenRouter API key (16-4096 characters).'
        : 'Review and accept OpenRouter terms before connecting.'
    );
    if (!body) return;
    const candidate = body.apiKey;

    const request = requestAbortSignal(req, res, Math.min(timeoutMs, 15000));
    let verified = false;
    try {
      const modelCount = await verifyOpenRouterApiKey(candidate, request.controller.signal);
      verified = true;
      const status = await accountStore.setProviderApiKey(
        user.id,
        'openrouter',
        candidate,
        new Date().toISOString(),
        new Date().toISOString()
      );
      res.set('Cache-Control', 'no-store').json({ ...status, modelCount });
    } catch (error) {
      const status = error.status || (verified ? 500 : request.timedOut ? 504 : 502);
      const message = error.status
        ? error.message
        : verified
          ? 'The key was verified but could not be saved securely.'
          : request.timedOut
            ? 'OpenRouter did not respond in time while checking the key.'
            : 'Could not connect to OpenRouter while checking the key.';
      if (!res.headersSent && !res.destroyed) {
        res.status(status).json({ error: { message } });
      }
    } finally {
      request.cleanup();
    }
  });

  app.post('/api/account/integrations/openrouter/test', credentialRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    if (
      typeof accountStore.getProviderApiKey !== 'function' ||
      typeof accountStore.markProviderApiKeyTested !== 'function'
    ) {
      return res.status(503).json({
        error: { message: 'OpenRouter integration is not available in this account store.' }
      });
    }

    const candidate = await getOpenRouterKeyForUser(user.id);
    if (!candidate) {
      return res.status(404).json({
        error: { message: 'Connect an OpenRouter API key before testing the integration.' }
      });
    }

    const request = requestAbortSignal(req, res, Math.min(timeoutMs, 15000));
    try {
      const modelCount = await verifyOpenRouterApiKey(candidate, request.controller.signal);
      const status = await accountStore.markProviderApiKeyTested(user.id, 'openrouter');
      res.set('Cache-Control', 'no-store').json({ ...status, modelCount });
    } catch (error) {
      const status = error.status || (request.timedOut ? 504 : 502);
      const message = error.status
        ? error.message
        : request.timedOut
          ? 'OpenRouter did not respond in time while checking the integration.'
          : 'Could not connect to OpenRouter while checking the integration.';
      if (!res.headersSent && !res.destroyed) {
        res.status(status).json({ error: { message } });
      }
    } finally {
      request.cleanup();
    }
  });

  app.delete('/api/account/integrations/openrouter', async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    if (typeof accountStore.revokeProviderApiKey !== 'function') {
      return res.status(503).json({
        error: { message: 'OpenRouter integration is not available in this account store.' }
      });
    }

    await accountStore.revokeProviderApiKey(user.id, 'openrouter');
    res.set('Cache-Control', 'no-store').status(204).end();
  });

  app.get('/api/conversations', conversationRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    const state = await conversationStore.list(user.id);
    res.set('Cache-Control', 'no-store').json(state);
  });

  app.post('/api/conversations/import', conversationRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    const body = validatedBody(
      importConversationsSchema,
      req,
      res,
      'Conversation import must contain at most 100 valid conversations.'
    );
    if (!body) return;
    const result = await conversationStore.import(
      user.id,
      body.conversations,
      body.activeConversationId
    );
    const state = await conversationStore.list(user.id);
    res.set('Cache-Control', 'no-store').json({
      ...state,
      importedCount: result.importedCount
    });
  });

  app.put('/api/conversations/workspace', conversationRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    const body = validatedBody(
      activeConversationSchema,
      req,
      res,
      'Choose a valid active conversation.'
    );
    if (!body) return;
    try {
      await conversationStore.setActive(user.id, body.activeConversationId);
    } catch (error) {
      if (error.code === 'CONVERSATION_NOT_FOUND') {
        return res.status(404).json({ error: { message: error.message } });
      }
      throw error;
    }
    res.set('Cache-Control', 'no-store').status(204).end();
  });

  app.delete('/api/conversations', conversationRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    await conversationStore.clear(user.id);
    res.set('Cache-Control', 'no-store').status(204).end();
  });

  app.put('/api/conversations/:conversationId', conversationRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    const body = validatedBody(
      saveConversationSchema,
      req,
      res,
      'Conversation must contain a title and valid messages.'
    );
    if (!body) return;
    if (
      body.activeConversationId !== undefined &&
      body.activeConversationId !== null &&
      body.activeConversationId !== req.params.conversationId
    ) {
      return res.status(400).json({
        error: { message: 'A conversation can only activate itself when it is saved.' }
      });
    }
    const conversation = {
      id: req.params.conversationId,
      title: body.title,
      messages: body.messages,
      createdAt: body.createdAt
    };
    await conversationStore.save(
      user.id,
      conversation,
      body.activeConversationId
    );
    res.set('Cache-Control', 'no-store').status(204).end();
  });

  app.delete('/api/conversations/:conversationId', conversationRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    await conversationStore.delete(user.id, req.params.conversationId);
    res.set('Cache-Control', 'no-store').status(204).end();
  });

  app.get('/api/models', modelsRateLimiter, async (req, res) => {
    const user = await getCurrentUser(req);
    const requestApiKey = await getApiKeyForRequest(req);
    const openRouterKey = user ? await getOpenRouterKeyForUser(user.id) : null;
    const effectiveOpenRouterKey = openRouterKey || serverOpenRouterKey;
    if (!requestApiKey && !effectiveOpenRouterKey) {
      return res.status(503).json({
        error: { message: 'Configure a FreeLLMAPI server key or connect a provider account.' }
      });
    }

    const warnings = [];

    async function discoverModels(label, url, headers, key) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 20000));
      const abortOnDisconnect = () => controller.abort();
      req.once('aborted', abortOnDisconnect);
      res.once('close', abortOnDisconnect);

      try {
        const response = await fetchImpl(url, { headers, signal: controller.signal });
        const body = await response.text();

        if (!response.ok) {
          warnings.push(safeUpstreamMessage(body, response.status, key, label));
          return [];
        }

        let result;
        try {
          result = JSON.parse(body);
        } catch {
          warnings.push(label + ' returned an invalid model list.');
          return [];
        }
        if (!Array.isArray(result?.data)) {
          warnings.push(label + ' returned an invalid model list.');
          return [];
        }
        return result.data.filter(model => model && typeof model.id === 'string');
      } catch (error) {
        warnings.push(
          error?.name === 'AbortError'
            ? label + ' did not respond in time.'
            : 'Could not connect to ' + label + '.'
        );
        return [];
      } finally {
        clearTimeout(timer);
        req.removeListener('aborted', abortOnDisconnect);
        res.removeListener('close', abortOnDisconnect);
      }
    }

    try {
      const models = [];

      if (requestApiKey) {
        models.push(...await discoverModels(
          'FreeLLMAPI',
          upstreamBase + '/models?available=true',
          { Authorization: 'Bearer ' + requestApiKey },
          requestApiKey
        ));
      }

      if (effectiveOpenRouterKey) {
        const openRouterModels = await discoverModels(
          'OpenRouter',
          openRouterUpstreamBase + '/models/user',
          {
            Authorization: 'Bearer ' + effectiveOpenRouterKey,
            'X-OpenRouter-Title': 'iamhujju'
          },
          effectiveOpenRouterKey
        );
        models.push(...openRouterModels.map(openRouterModel));
      }

      if (models.length === 0) {
        if (res.destroyed) return;
        return res.status(503).json({
          error: {
            message: warnings.join(' ')
              || 'No models could be discovered. Check your provider configuration.'
          }
        });
      }

      res.set('Cache-Control', 'no-store').json({ object: 'list', data: models });
    } catch {
      if (!res.headersSent && !res.destroyed) {
        res.status(502).json({
          error: { message: 'Could not discover models from the configured providers.' }
        });
      }
    }
  });

  app.post('/api/chat/completions', chatRateLimiter, async (req, res) => {
    const body = validatedBody(
      chatRequestSchema,
      req,
      res,
      'Request must include a model and 1-100 valid messages, including a user message.'
    );
    if (!body) return;

    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({
        error: { message: 'Sign in to send messages.' }
      });
    }

    const usesOpenRouter = body.model.startsWith('openrouter:');
    const sourceModel = usesOpenRouter
      ? body.model.slice('openrouter:'.length)
      : body.model;
    if (!sourceModel) {
      return res.status(400).json({
        error: { message: 'Select a valid model from the connected provider.' }
      });
    }

    const requestApiKey = usesOpenRouter
      ? (await getOpenRouterKeyForUser(user.id)) || serverOpenRouterKey
      : typeof accountStore.getApiKey === 'function'
        ? await accountStore.getApiKey(user.id) || (allowSharedGatewayKey ? apiKey : '')
        : allowSharedGatewayKey ? apiKey : '';
    if (!requestApiKey) {
      return res.status(403).json({
        error: {
          message: usesOpenRouter
            ? 'Connect an OpenRouter account before using its models.'
            : 'Add your personal FreeLLMAPI key in Account before using this model.'
        }
      });
    }

    const requestBody = usesOpenRouter
      ? {
          ...body,
          model: sourceModel,
          ...(body.max_tokens !== undefined ? { max_tokens: Math.min(Number(body.max_tokens) || 2048, 4096) } : {})
        }
      : body;
    const providerName = usesOpenRouter ? 'OpenRouter' : 'FreeLLMAPI';
    const providerBase = usesOpenRouter ? openRouterUpstreamBase : upstreamBase;
    const request = requestAbortSignal(req, res, timeoutMs);

    try {
      const response = await fetchImpl(
        `${providerBase}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${requestApiKey}`,
            'Content-Type': 'application/json',
            ...(usesOpenRouter ? { 'X-OpenRouter-Title': 'iamhujju' } : {})
          },
          body: JSON.stringify(requestBody),
          signal: request.controller.signal
        }
      );

      if (!response.ok) {
        const body = await response.text();
        return res.status(response.status).json({
          error: {
            message: safeUpstreamMessage(
              body,
              response.status,
              requestApiKey,
              providerName
            )
          }
        });
      }

      if (!response.body) {
        return res.status(502).json({
          error: { message: `${providerName} returned an empty response.` }
        });
      }

      res.status(response.status);
      res.setHeader(
        'Content-Type',
        response.headers.get('content-type') || 'text/event-stream'
      );
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');

      await pipeline(Readable.fromWeb(response.body), res);
    } catch {
      if (!res.headersSent && !res.destroyed) {
        const status = request.timedOut ? 504 : 502;
        const message = request.timedOut
          ? `${providerName} did not finish responding in time.`
          : `${providerName} request failed. Check that the provider is available.`;
        res.status(status).json({ error: { message } });
      } else if (!res.destroyed) {
        res.destroy();
      }
    } finally {
      request.cleanup();
    }
  });

  // Cache-busted immutable assets; never cache index.html or service worker.
  app.use(
    express.static(DIST_DIRECTORY, {
      index: false,
      etag: false,
      setHeaders: (res, filePath) => {
        if (/\.html$/.test(filePath) || filePath.endsWith("sw.js")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    })
  );

  app.get("/{*splat}", (req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      return next();
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(INDEX_FILE, error => {
      if (error) next(error);
    });
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    if (error.type !== 'entity.too.large' && error.type !== 'entity.parse.failed') {
      console.error('Local API request failed:', error.message);
      return res.status(500).json({
        error: { message: 'The local API could not complete the request.' }
      });
    }

    const status = error.type === 'entity.too.large' ? 413 : 400;
    const message = status === 413
      ? 'Request body is too large.'
      : 'Request body must be valid JSON.';
    res.status(status).json({ error: { message } });
  });

  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3001);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const pool = getDatabasePool();
  await migrateDatabase(pool);
  await pool.query('SELECT 1');
  const server = createApp().listen(port, '0.0.0.0', () => {
    console.log(`iamhujju server listening on port ${port}`);
  });
  const shutdown = async () => {
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
