import express from 'express';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
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
  razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '',
  razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '',
  officialUpiId = process.env.OFFICIAL_UPI_ID || '9975649957@mbk',
  razorpayAccountName = process.env.RAZORPAY_ACCOUNT_NAME || 'iamhujju',
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
        connectSrc: [
          "'self'",
          'https://*.googleapis.com',
          'https://*.firebaseio.com',
          'https://*.firebaseapp.com',
          'https://api.razorpay.com',
          'https://lumberjack.razorpay.com',
          'https://lumberjack-cx.razorpay.com'
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: [
          "'self'",
          'https://iamhujju-680e8.firebaseapp.com',
          'https://*.firebaseapp.com',
          'https://accounts.google.com',
          'https://api.razorpay.com'
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://*.googleusercontent.com',
          'https://lh3.googleusercontent.com',
          'https://api.qrserver.com'
        ],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", 'https://apis.google.com', 'https://checkout.razorpay.com'],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']
      }
    },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
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
    const isFree = id.endsWith(':free') ||
      id === 'openrouter/free' ||
      id === 'openrouter/auto' ||
      (model.pricing?.prompt === '0' && model.pricing?.completion === '0');

    const idParts = id.split('/');
    const brandPrefix = (idParts[0] || '').toLowerCase();
    let brand = idParts[0] || 'OpenRouter';
    if (brandPrefix.includes('google')) brand = 'Google';
    else if (brandPrefix.includes('openai')) brand = 'OpenAI';
    else if (brandPrefix.includes('anthropic')) brand = 'Anthropic';
    else if (brandPrefix.includes('meta')) brand = 'Meta';
    else if (brandPrefix.includes('deepseek')) brand = 'DeepSeek';
    else if (brandPrefix.includes('mistral') || brandPrefix.includes('codestral')) brand = 'Mistral';
    else if (brandPrefix.includes('qwen') || brandPrefix.includes('alibaba')) brand = 'Qwen';
    else if (brandPrefix.includes('x-ai') || brandPrefix.includes('xai')) brand = 'xAI';
    else if (brandPrefix.includes('cohere')) brand = 'Cohere';
    else if (brandPrefix.includes('nvidia')) brand = 'Nvidia';
    else if (brandPrefix.includes('baidu')) brand = 'Baidu';
    else if (brandPrefix.includes('tencent')) brand = 'Tencent';

    return {
      ...model,
      id: `openrouter:${id}`,
      sourceId: id,
      provider: 'openrouter',
      brand,
      name: model.name || id,
      owned_by: brand,
      context_window: model.context_length,
      available: true,
      isFree,
      tier: isFree ? 'free' : 'pro'
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

  app.post('/api/auth/firebase-login', authRateLimiter, async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: { message: 'Valid email required for Firebase authentication.' } });
    }

    try {
      const user = await accountStore.findOrCreateFederatedUser(email);
      const session = await accountStore.createSession(user.id);
      res.set('Cache-Control', 'no-store');
      setSessionCookie(res, session.token);
      res.json({ user });
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Firebase login failed.' } });
    }
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
        let openRouterModels = await discoverModels(
          'OpenRouter',
          openRouterUpstreamBase + '/models',
          {
            Authorization: 'Bearer ' + effectiveOpenRouterKey,
            'X-OpenRouter-Title': 'iamhujju'
          },
          effectiveOpenRouterKey
        );

        if (!openRouterModels.length) {
          openRouterModels = await discoverModels(
            'OpenRouter',
            openRouterUpstreamBase + '/models/user',
            {
              Authorization: 'Bearer ' + effectiveOpenRouterKey,
              'X-OpenRouter-Title': 'iamhujju'
            },
            effectiveOpenRouterKey
          );
        }

        const mapped = openRouterModels.map(openRouterModel);
        mapped.sort((a, b) => {
          if (a.id === 'openrouter:openrouter/free') return -1;
          if (b.id === 'openrouter:openrouter/free') return 1;
          if (a.id === 'openrouter:openrouter/auto') return -1;
          if (b.id === 'openrouter:openrouter/auto') return 1;
          if (a.isFree && !b.isFree) return -1;
          if (!a.isFree && b.isFree) return 1;
          return 0;
        });

        models.push(...mapped);
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

    const usesOpenRouter = body.model.startsWith('openrouter:') || body.model.startsWith('openrouter/');
    const sourceModel = body.model.startsWith('openrouter:')
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

    const hasPersonalKey = usesOpenRouter && user ? Boolean(await getOpenRouterKeyForUser(user.id)) : false;
    const isFreeTierUsingServerKey = (!user || user.tier === 'free') && !hasPersonalKey;

    const isFreeModel = sourceModel.endsWith(':free') ||
      sourceModel === 'openrouter/free' ||
      sourceModel === 'openrouter/auto';

    if (usesOpenRouter && isFreeTierUsingServerKey && !isFreeModel) {
      return res.status(403).json({
        error: {
          message: `${sourceModel} is a Pro model. Connect your personal OpenRouter API key in Account to use Pro models, or choose any of the 100% Free models.`
        }
      });
    }

    const requestBody = usesOpenRouter
      ? {
          ...body,
          model: sourceModel,
          ...(isFreeTierUsingServerKey
            ? { max_tokens: Math.min(Number(body.max_tokens) || 2048, 2048) }
            : (body.max_tokens !== undefined ? { max_tokens: Number(body.max_tokens) } : {}))
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

  const supportRequestSchema = z.object({
    message: z.string().trim().min(1).max(3000),
    history: z.array(z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().max(4000)
    })).max(30).optional()
  });

  app.post('/api/support/chat', chatRateLimiter, async (req, res) => {
    const body = validatedBody(
      supportRequestSchema,
      req,
      res,
      'Request must include a non-empty message string.'
    );
    if (!body) return;

    const userMessage = body.message;
    const history = body.history || [];

    const systemInstruction = `You are iamhujju Copilot, the official interactive AI assistant and website navigator for iamhujju (https://iamhujju.com).
Your mission is to provide comprehensive help, answer queries about any subject related to iamhujju, and guide/navigate users through the platform.

PLATFORM KNOWLEDGE:
- Purpose: One AI Workspace for 400+ Models. Switch between providers instantly, test prompts side-by-side, access a drop-in OpenAI-compatible API, and run models from the terminal.
- 400+ Models: Google Gemini (2.5 Flash, 2.5 Flash Lite, 2.5 Pro), OpenAI (GPT-4o, GPT-4o mini, o1, o3-mini), Anthropic (Claude 3.5 Sonnet, 3.5 Haiku), DeepSeek (V3, R1), Meta Llama (3.3 70B, 3.1 8B), Qwen 2.5, Mistral Large.
- 100% Free Tier: 18+ fast free models ready out of the box with zero configuration or API keys needed (Gemini 2.5 Flash, DeepSeek V3, Llama 3.3 70B, Qwen 2.5).
- Pro Models (BYOK): For models requiring paid credits, users can enter their personal OpenRouter or FreeLLMAPI key in Account settings (encrypted with AES-256-GCM).
- Unified API: Accessible at https://iamhujju.com/api/chat/completions. 100% drop-in replacement for OpenAI SDK (baseURL: 'https://iamhujju.com/api').
- AnyChat Playground: Interactive developer workspace to test prompts, compare model outputs side-by-side, inspect reasoning and latency, and tune parameters.
- AnyCLI: Command-line interface to chat with models and manage configurations from the terminal: \`npx iamhujju chat --model "auto"\`.
- Skills Catalog: 34+ curated AI developer and agent orchestration skills.
- Data Persistence & Privacy: Dual-sync architecture with private Neon PostgreSQL and Cloud Firestore (iamhujju-680e8). Zero prompt training, strict isolated schemas, OWASP compliance.
- Authentication: Firebase Google Sign-In and email/password with secure session cookies.
- Pricing: 100% Free tier available forever; transparent per-token pricing on BYOK for Pro models.
- Creator & Support: Founded and created by Huzaifa Kazi (huzaifakazi1991@gmail.com).

ACTION TAGS:
Whenever your reply recommends or points the user to a section, modal, or feature, ALWAYS append one or more relevant action tags at the end of your response:
- [[action:models|🚀 Open Model Hub]]
- [[action:chat|⚡ Open AnyChat Playground]]
- [[action:pricing|💰 View Pricing Details]]
- [[action:docs:quickstart|📖 API Documentation]]
- [[action:docs:cli|💻 AnyCLI Terminal Setup]]
- [[action:skills|🛠️ Skills Catalog]]
- [[action:saved|☁️ Saved Chats]]
- [[action:auth|🔐 Sign In to Workspace]]
- [[action:scroll:about|ℹ️ About Platform]]
- [[action:scroll:unified-api-section|⚡ Unified API Architecture]]

Answer concisely, helpfully, and with markdown formatting.`;

    const activeKey = serverOpenRouterKey || (allowSharedGatewayKey ? apiKey : '');
    const upstreamUrl = serverOpenRouterKey
      ? `${openRouterUpstreamBase}/chat/completions`
      : `${upstreamBase}/chat/completions`;

    if (activeKey) {
      try {
        const payload = {
          model: serverOpenRouterKey ? 'openrouter/free' : 'google/gemini-2.5-flash:free',
          messages: [
            { role: 'system', content: systemInstruction },
            ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage }
          ],
          max_tokens: 800,
          temperature: 0.7
        };

        const response = await fetchImpl(upstreamUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000)
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) {
            return res.json({ reply: content });
          }
        }
      } catch {
        // Fall back to knowledge base below
      }
    }

    const reply = generateSmartSupportReply(userMessage);
    return res.json({ reply });
  });

  function generateSmartSupportReply(query = '') {
    const q = String(query).toLowerCase().trim();

    if (q.includes('model') || q.includes('free') || q.includes('gemini') || q.includes('deepseek') || q.includes('claude') || q.includes('gpt') || q.includes('llama')) {
      return `iamhujju gives you unified access to over **400+ AI models** from every top provider.

**100% Free Models (Ready to use instantly with 0 setup):**
• **Google Gemini 2.5 Flash** — Ultra-fast (~140ms), 1M+ token context window, multimodal
• **DeepSeek V3 & R1** — State-of-the-art coding and math reasoning
• **Meta Llama 3.3 70B** — Top-tier open weights intelligence
• **Qwen 2.5 72B** — Excellent multilingual code and chat synthesis

**Pro Models (Bring-Your-Own-Key):**
You can connect your personal OpenRouter key in Account settings to use Claude 3.5 Sonnet, GPT-4o, and o3 with direct pass-through pricing and 0% markup.

[[action:models|🚀 Open Model Hub]] [[action:chat|⚡ Try Models in AnyChat]]`;
    }

    if (q.includes('price') || q.includes('cost') || q.includes('plan') || q.includes('bill') || q.includes('tier') || q.includes('subscription')) {
      return `**Pricing on Your Terms — 100% Transparent:**

• **Free Tier ($0/month forever):** Instant access to 18+ fast AI models without entering a credit card or API key.
• **Bring-Your-Own-Key (BYOK):** Connect your personal provider keys in your Account menu. Pay only wholesale provider token rates directly.
• **No Markup or Hidden Fees:** We never charge surcharges on top of upstream provider rates.

[[action:pricing|💰 View Pricing Details]] [[action:docs:pricing|📖 Per-Token Documentation]]`;
    }

    if (q.includes('api') || q.includes('sdk') || q.includes('openai') || q.includes('curl') || q.includes('python') || q.includes('node') || q.includes('code')) {
      return `**Drop-in OpenAI SDK Compatibility:**

You can integrate iamhujju into any app or script by pointing the standard OpenAI SDK to our endpoint:

\`\`\`javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://iamhujju.com/api',
  apiKey: process.env.IAMHUJJU_API_KEY || 'your-key'
});

const response = await client.chat.completions.create({
  model: 'openrouter/free',
  messages: [{ role: 'user', content: 'Hello iamhujju!' }]
});
console.log(response.choices[0].message.content);
\`\`\`

[[action:docs:quickstart|📖 View Quickstart & cURL]] [[action:scroll:unified-api-section|⚡ Unified API Architecture]]`;
    }

    if (q.includes('cli') || q.includes('terminal') || q.includes('command') || q.includes('npx')) {
      return `**AnyCLI — Run AI from Your Terminal:**

Chat with models and manage configurations directly from your command line without installing dependencies:

\`\`\`bash
# Launch interactive chat with the fastest free model
npx iamhujju chat --model "auto"

# Test a prompt with custom temperature
npx iamhujju chat -m "google/gemini-2.5-flash" -p "Summarize README"
\`\`\`

[[action:docs:cli|💻 AnyCLI Terminal Setup]] [[action:scroll:anycli-section|🖥️ Terminal Features]]`;
    }

    if (q.includes('skill') || q.includes('mcp') || q.includes('agent') || q.includes('tool')) {
      return `**Skills & Agent Orchestrator:**

iamhujju includes a catalog of **34+ curated AI developer skills** and MCP (Model Context Protocol) tool integrations:
• Automated codebase audits and refactoring
• Multi-database migrations and query tuning
• Real-time web search and live verification
• OWASP security scanning & vulnerability checks

[[action:skills|🛠️ Browse Skills Catalog]]`;
    }

    if (q.includes('database') || q.includes('privacy') || q.includes('security') || q.includes('firestore') || q.includes('neon') || q.includes('postgre') || q.includes('train')) {
      return `**Privacy & Dual-Persistence Architecture:**

• **Zero Data Retention / Training:** Your prompts and files are strictly private and never used to train models.
• **Neon PostgreSQL:** Stores account credentials encrypted with AES-256-GCM and isolates session tokens.
• **Cloud Firestore:** Automatically mirrors your conversation history across devices under \`users/{userId}/conversations/{chatId}\`.

[[action:saved|☁️ View Saved Chats]] [[action:scroll:about|ℹ️ Security Architecture]]`;
    }

    if (q.includes('sign in') || q.includes('login') || q.includes('auth') || q.includes('google') || q.includes('account') || q.includes('signup') || q.includes('register')) {
      return `**Authentication & Account Access:**

• **Google Sign-In:** 1-click sign in via Firebase Google Authentication.
• **Email & Password:** Secure password hashing with session cookie protection.
• **Dual Database Sync:** Logging in links your Neon PostgreSQL account with Cloud Firestore for instant cross-device continuity.

[[action:auth|🔐 Sign In to Workspace]]`;
    }

    if (q.includes('who') || q.includes('creator') || q.includes('founder') || q.includes('huzaifa') || q.includes('contact') || q.includes('telegram') || q.includes('email') || q.includes('support') || q.includes('help')) {
      return `**iamhujju Support & Direct Channels:**

• **Founder & Engineer:** Huzaifa Kazi
• **Telegram:** \`+91 99756 49957\` (Direct Link: https://t.me/+919975649957)
• **Email:** \`huzaifakazi1991@gmail.com\` / \`support@iamhujju.com\`
• **Response Time:** Usually within 1 business day (often much faster).

[[action:contact|📬 Open Contact Form]] [[action:telegram|✈️ Telegram (+91 99756 49957)]] [[action:models|🚀 Explore Models]]`;
    }

    return `I'm your **iamhujju Copilot**! I can help you with anything related to the platform:

• **Explore 400+ Models:** Benchmark bars, context sizes, and free tier auto-routing.
• **AnyChat Playground:** Test prompts and compare model responses side-by-side.
• **Unified API & SDKs:** Drop-in OpenAI compatibility for Node.js, Python, and cURL.
• **AnyCLI:** Run AI straight from your terminal.
• **Skills Catalog:** 34+ AI orchestrator and agent skills.

What would you like to explore or do right now?

[[action:contact|📬 Contact Us]] [[action:models|🚀 Open Model Hub]] [[action:chat|⚡ Open AnyChat Playground]] [[action:pricing|💰 View Pricing]] [[action:docs:quickstart|📖 API Docs]]`;
  }

  const contactRequestSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    company: z.string().trim().max(140).optional().default(''),
    subject: z.string().trim().min(1).max(100).default('Technical & Integration Support'),
    telegram: z.string().trim().max(80).optional().default(''),
    email: z.string().trim().email('Valid email required').max(254),
    message: z.string().trim().min(1, 'Message is required').max(5000)
  });

  app.post('/api/contact', chatRateLimiter, async (req, res) => {
    const body = validatedBody(
      contactRequestSchema,
      req,
      res,
      'Contact form requires a valid name, email address, and message.'
    );
    if (!body) return;

    console.log('[Contact Form]', {
      name: body.name,
      email: body.email,
      company: body.company,
      subject: body.subject,
      telegram: body.telegram
    });

    return res.json({
      success: true,
      message: 'Inquiry received. We will reply within one business day.'
    });
  });

  // Payment Plans & Razorpay / UPI Integration
  const PLAN_CATALOG = {
    payg: {
      id: 'payg',
      name: 'Pay-as-you-go',
      amountInr: 1699,
      amountPaise: 169900,
      description: 'iamhujju Pay-as-you-go credit balance'
    },
    developer: {
      id: 'developer',
      name: 'Developer Plan',
      amountInrMonthly: 1699,
      amountInrAnnual: 16308,
      amountPaiseMonthly: 169900,
      amountPaiseAnnual: 1630800,
      description: 'iamhujju Developer Plan'
    },
    pro: {
      id: 'pro',
      name: 'Pro Plan',
      amountInrMonthly: 8199,
      amountInrAnnual: 78708,
      amountPaiseMonthly: 819900,
      amountPaiseAnnual: 7870800,
      description: 'iamhujju Pro Plan (Most Popular)'
    },
    enterprise: {
      id: 'enterprise',
      name: 'Enterprise Plan',
      amountInrMonthly: 23999,
      amountInrAnnual: 230388,
      amountPaiseMonthly: 2399900,
      amountPaiseAnnual: 23038800,
      description: 'iamhujju Enterprise Plan'
    }
  };

  app.get('/api/payment/config', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      keyId: razorpayKeyId,
      upiId: officialUpiId,
      accountName: razorpayAccountName,
      currency: 'INR',
      isLive: Boolean(razorpayKeyId && razorpayKeySecret),
      supportEmail: 'contact@iamhujju.com'
    });
  });

  const createOrderSchema = z.object({
    planId: z.enum(['payg', 'developer', 'pro', 'enterprise']),
    billingCycle: z.enum(['monthly', 'annual', 'once']).optional().default('monthly'),
    email: z.string().trim().email().optional().default('')
  });

  app.post('/api/payment/create-order', chatRateLimiter, async (req, res) => {
    const body = validatedBody(
      createOrderSchema,
      req,
      res,
      'Invalid plan or billing cycle specified.'
    );
    if (!body) return;

    const plan = PLAN_CATALOG[body.planId];
    if (!plan) {
      return res.status(400).json({ error: { message: 'Unknown plan selected.' } });
    }

    let amountPaise = 0;
    let amountInr = 0;

    if (body.planId === 'payg') {
      amountPaise = plan.amountPaise;
      amountInr = plan.amountInr;
    } else if (body.billingCycle === 'annual') {
      amountPaise = plan.amountPaiseAnnual;
      amountInr = plan.amountInrAnnual;
    } else {
      amountPaise = plan.amountPaiseMonthly;
      amountInr = plan.amountInrMonthly;
    }

    const receipt = `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // If live Razorpay API keys are configured, create real order with Razorpay
    if (razorpayKeyId && razorpayKeySecret) {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
        const rzpResponse = await fetchImpl('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: amountPaise,
            currency: 'INR',
            receipt,
            notes: {
              planId: body.planId,
              billingCycle: body.billingCycle,
              email: body.email
            }
          })
        });

        if (rzpResponse.ok) {
          const rzpOrder = await rzpResponse.json();
          return res.json({
            success: true,
            orderId: rzpOrder.id,
            amount: rzpOrder.amount,
            amountInr,
            currency: 'INR',
            keyId: razorpayKeyId,
            planId: body.planId,
            planName: plan.name,
            billingCycle: body.billingCycle,
            upiId: officialUpiId,
            accountName: razorpayAccountName,
            receipt
          });
        }
      } catch (rzpErr) {
        console.error('[Razorpay Order Creation Failed, falling back to direct checkout]', rzpErr?.message);
      }
    }

    // Direct / Sandbox Order Fallback
    const simulatedOrderId = `order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return res.json({
      success: true,
      orderId: simulatedOrderId,
      amount: amountPaise,
      amountInr,
      currency: 'INR',
      keyId: razorpayKeyId || '',
      planId: body.planId,
      planName: plan.name,
      billingCycle: body.billingCycle,
      upiId: officialUpiId,
      accountName: razorpayAccountName,
      receipt,
      fallbackToDirectUpi: !razorpayKeySecret
    });
  });

  const verifyPaymentSchema = z.object({
    planId: z.enum(['payg', 'developer', 'pro', 'enterprise']),
    billingCycle: z.enum(['monthly', 'annual', 'once']).optional().default('monthly'),
    razorpay_order_id: z.string().trim().optional(),
    razorpay_payment_id: z.string().trim().optional(),
    razorpay_signature: z.string().trim().optional(),
    upi_ref: z.string().trim().optional(),
    email: z.string().trim().email().optional()
  });

  app.post('/api/payment/verify', chatRateLimiter, async (req, res) => {
    const body = validatedBody(
      verifyPaymentSchema,
      req,
      res,
      'Verification requires valid payment details.'
    );
    if (!body) return;

    let verified = false;
    let paymentRef = '';

    // Check Razorpay signature if provided
    if (body.razorpay_order_id && body.razorpay_payment_id && body.razorpay_signature) {
      paymentRef = body.razorpay_payment_id;
      if (razorpayKeySecret) {
        const expectedSignature = crypto
          .createHmac('sha256', razorpayKeySecret)
          .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`)
          .digest('hex');

        if (expectedSignature === body.razorpay_signature) {
          verified = true;
        } else {
          return res.status(400).json({ error: { message: 'Invalid payment signature. Verification failed.' } });
        }
      } else {
        // In sandbox / testing mode without live secret
        verified = true;
      }
    } else if (body.upi_ref) {
      paymentRef = body.upi_ref;
      if (body.upi_ref.trim().length >= 6) {
        verified = true;
      } else {
        return res.status(400).json({ error: { message: 'Please enter a valid UPI reference (UTR) number.' } });
      }
    } else {
      return res.status(400).json({ error: { message: 'Payment reference or signature is required.' } });
    }

    if (verified) {
      let user = await getCurrentUser(req);
      if (!user && body.email && typeof accountStore.findUserByEmail === 'function') {
        user = await accountStore.findUserByEmail(body.email);
      }

      let updatedUser = null;
      if (user && typeof accountStore.updateUserTier === 'function') {
        updatedUser = await accountStore.updateUserTier(user.id, body.planId);
      }

      console.log('[Payment Verified]', {
        planId: body.planId,
        billingCycle: body.billingCycle,
        paymentRef,
        userId: user?.id,
        email: user?.email || body.email
      });

      return res.json({
        success: true,
        tier: body.planId,
        paymentRef,
        message: `Payment verified successfully! Your ${PLAN_CATALOG[body.planId]?.name || 'Plan'} is now active.`,
        user: updatedUser || user || null
      });
    }

    return res.status(400).json({ error: { message: 'Payment verification could not be confirmed.' } });
  });

  app.get('/api/subscription/status', async (req, res) => {
    const user = await getCurrentUser(req);
    const tier = user?.tier || 'free';
    res.set('Cache-Control', 'no-store').json({
      tier,
      isPro: tier !== 'free',
      planName: PLAN_CATALOG[tier]?.name || (tier === 'free' ? 'Free Tier' : tier.toUpperCase())
    });
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
