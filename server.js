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
import Razorpay from 'razorpay';
import { PRICING_PLANS, resolvePlan, CURRENCY } from './src/pricingConfig.js';
import { KeyPool, defaultKeyPool, estimateTokens } from './keyPool.js';
import {
  PROVIDERS,
  PROVIDER_FALLBACK_MODELS,
  resolveModelTarget,
  sanitizePayloadForModel,
  createModelSyncService,
  runAdminProviderDiagnostics,
  detectModelModality,
  createVideoTaskRecord,
  getVideoTaskStatus,
  generateImageResult
} from './services/aiGateway.js';
import { browseWeb, shouldTriggerLiveSearch } from './services/webSearch.js';
import {
  getGoogleAIStudioKey,
  maskApiKey,
  verifyPaidGeminiAccess,
  validateAndSyncGeminiModels,
  getGeminiModelCatalog,
  streamGeminiChat,
  generateGeminiImage,
  createGeminiVideoTask,
  pollGeminiVideoTask,
  DEFAULT_GEMINI_MODELS
} from './services/googleGeminiAdapter.js';
import {
  HUZAIFA_OMNI_MODEL_ID,
  HUZAIFA_OMNI_MODEL_METADATA,
  executeHuzaifaOmniChat
} from './services/huzaifaOmniRouter.js';

dotenv.config();

const BROKEN_MODELS_BLACKLIST = new Set([
  'openrouter:google/lyria-3-pro-preview',
  'openrouter:google/lyria-3-clip-preview',
  'openrouter:inclusionai/ling-3.2-flash:free',
  'openrouter:google/gemma-4-26b-a4b-it:free',
  'openrouter:google/gemma-4-31b-it:free',
  'electronhub:deepseek-v3.2:free',
  'electronhub:deepseek-v4.1-flash:free',
  'electronhub:glm-5.1:free',
  'electronhub:glm-5.3-flash:free'
]);

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

  if (typeof message === 'string' && (message.includes('OpenAIBatchAdapter') || message.includes('cannot be used with the chat/completions endpoint'))) {
    return 'This model is configured for batch operations. It has been automatically adapted to operate smoothly on the live chat completion endpoint.';
  }

  if (status === 402 || (typeof message === 'string' && (message.includes('Insufficient credits') || message.includes('never purchased credits')))) {
    return 'This model is a paid/Pro model requiring upstream OpenRouter credits. The server master key currently has 0 purchased credits. Please select any of our 30+ verified 100% Free models (such as Free Models Router, Nemotron 3 Ultra, DeepSeek R1 Free, or Llama 3.3 70B Free) for instant free generation, or connect an OpenRouter key with credits in Account -> Integrations.';
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
  apiKey: z.string().trim().min(8).max(4096),
  termsAccepted: z.literal(true)
}).strict();

const providerKeySchema = z.object({
  apiKey: z.string().trim().min(8).max(4096),
  termsAccepted: z.boolean().optional()
}).passthrough();

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.union([
    z.string().max(25000000),
    z.array(z.any()).max(100)
  ]),
  attachments: z.array(z.any()).optional(),
  sources: z.array(z.any()).optional()
}).passthrough();

// Autonomous Agent & Gateway Schema supporting tool loops, functions, and tool_calls
const gatewayChatMessageSchema = z.object({
  role: z.string().min(1).max(32),
  content: z.union([
    z.string().max(25000000),
    z.array(z.any()).max(100)
  ]).nullable().optional(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(z.any()).optional(),
  function_call: z.any().optional(),
  attachments: z.array(z.any()).optional(),
  sources: z.array(z.any()).optional()
}).passthrough();

const savedConversationSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().max(500),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.union([
      z.string().max(25000000),
      z.array(z.any()).max(100)
    ]),
    attachments: z.array(z.any()).optional(),
    sources: z.array(z.any()).optional()
  }).passthrough()).max(1000)
}).passthrough().superRefine((conversation, context) => {
  const contentLength = conversation.messages.reduce(
    (total, message) => total + (typeof message.content === 'string' ? message.content.length : 2000),
    0
  );
  if (contentLength > 50000000) {
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
      (messageTotal, message) => messageTotal + (typeof message.content === 'string' ? message.content.length : 2000),
      0
    ),
    0
  );
  if (totalLength > 50000000) {
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
  stream: z.boolean().optional(),
  browse: z.boolean().optional(),
  webSearch: z.boolean().optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  functions: z.array(z.any()).optional(),
  function_call: z.any().optional(),
  response_format: z.any().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  max_tokens: z.number().optional(),
  max_completion_tokens: z.number().optional()
}).passthrough().superRefine((body, context) => {
  if (!body.messages.some(message => message.role === 'user')) {
    context.addIssue({
      code: 'custom',
      message: 'A user message is required.',
      path: ['messages']
    });
  }
});

const gatewayChatRequestSchema = z.object({
  model: z.string().trim().min(1).max(256),
  messages: z.array(gatewayChatMessageSchema).min(1).max(100),
  stream: z.boolean().optional(),
  browse: z.boolean().optional(),
  webSearch: z.boolean().optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  functions: z.array(z.any()).optional(),
  function_call: z.any().optional(),
  response_format: z.any().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  max_tokens: z.number().optional(),
  max_completion_tokens: z.number().optional()
}).passthrough().superRefine((body, context) => {
  if (!body.messages.some(message => message.role === 'user' || message.role === 'tool' || message.role === 'assistant')) {
    context.addIssue({
      code: 'custom',
      message: 'A user or agent message is required.',
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
  serverElectronHubKey = process.env.ELECTRONHUB_API_KEY || '',
  serverGroqKey = process.env.GROQ_API_KEY || '',
  serverFreeModelKey = process.env.FREEMODEL_API_KEY || '',
  serverGeminiKey = process.env.GEMINI_API_KEY || '',
  serverMistralKey = process.env.MISTRAL_API_KEY || '',
  serverTogetherKey = process.env.TOGETHER_API_KEY || '',
  serverCerebrasKey = process.env.CEREBRAS_API_KEY || '',
  serverSambaNovaKey = process.env.SAMBANOVA_API_KEY || '',
  serverCohereKey = process.env.COHERE_API_KEY || '',
  serverHuggingFaceKey = process.env.HUGGINGFACE_API_KEY || '',
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  accountStore = createAccountStore(),
  conversationStore = createConversationStore(),
  razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_U2RfhaS1IyP8oo',
  razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || '',
  razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '',
  officialUpiId = process.env.OFFICIAL_UPI_ID || '',
  razorpayAccountName = process.env.RAZORPAY_ACCOUNT_NAME || 'iamhujju',
  razorpayInstance = null,
  keyPool = defaultKeyPool,
  rateLimits = {},
  allowedOrigins = [
    'https://iamhujju.com',
    'https://www.iamhujju.com',
    ...(process.env.APP_ORIGIN && !process.env.APP_ORIGIN.includes('localhost') && !process.env.APP_ORIGIN.includes('127.0.0.1') ? [process.env.APP_ORIGIN] : [])
  ]
} = {}) {
  const upstreamBase = normalizeApiBase(apiBase);
  const openRouterUpstreamBase = DEFAULT_OPENROUTER_BASE;

  if (serverOpenRouterKey && !keyPool.pools.get('openrouter')?.some(k => k.key === serverOpenRouterKey)) {
    keyPool.registerPool('openrouter', [serverOpenRouterKey, ...(keyPool.parseKeys(process.env.OPENROUTER_API_KEYS))]);
  }
  if (apiKey && !keyPool.pools.get('freellmapi')?.some(k => k.key === apiKey)) {
    keyPool.registerPool('freellmapi', [apiKey, ...(keyPool.parseKeys(process.env.FREELLMAPI_KEYS))]);
  }
  if (serverGroqKey && !keyPool.pools.get('groq')?.some(k => k.key === serverGroqKey)) {
    keyPool.registerPool('groq', [serverGroqKey, ...(keyPool.parseKeys(process.env.GROQ_API_KEYS))]);
  }
  if (serverElectronHubKey && !keyPool.pools.get('electronhub')?.some(k => k.key === serverElectronHubKey)) {
    keyPool.registerPool('electronhub', [serverElectronHubKey, ...(keyPool.parseKeys(process.env.ELECTRONHUB_API_KEYS))]);
  }
  if (serverFreeModelKey && !keyPool.pools.get('freemodel')?.some(k => k.key === serverFreeModelKey)) {
    keyPool.registerPool('freemodel', [serverFreeModelKey, ...(keyPool.parseKeys(process.env.FREEMODEL_API_KEYS))]);
  }
  if (serverGeminiKey && !keyPool.pools.get('gemini')?.some(k => k.key === serverGeminiKey)) {
    keyPool.registerPool('gemini', [serverGeminiKey, ...(keyPool.parseKeys(process.env.GEMINI_API_KEYS))]);
  }
  if (serverMistralKey && !keyPool.pools.get('mistral')?.some(k => k.key === serverMistralKey)) {
    keyPool.registerPool('mistral', [serverMistralKey, ...(keyPool.parseKeys(process.env.MISTRAL_API_KEYS))]);
  }
  if (serverTogetherKey && !keyPool.pools.get('together')?.some(k => k.key === serverTogetherKey)) {
    keyPool.registerPool('together', [serverTogetherKey, ...(keyPool.parseKeys(process.env.TOGETHER_API_KEYS))]);
  }
  if (serverCerebrasKey && !keyPool.pools.get('cerebras')?.some(k => k.key === serverCerebrasKey)) {
    keyPool.registerPool('cerebras', [serverCerebrasKey, ...(keyPool.parseKeys(process.env.CEREBRAS_API_KEYS))]);
  }
  if (serverSambaNovaKey && !keyPool.pools.get('sambanova')?.some(k => k.key === serverSambaNovaKey)) {
    keyPool.registerPool('sambanova', [serverSambaNovaKey, ...(keyPool.parseKeys(process.env.SAMBANOVA_API_KEYS))]);
  }
  if (serverCohereKey && !keyPool.pools.get('cohere')?.some(k => k.key === serverCohereKey)) {
    keyPool.registerPool('cohere', [serverCohereKey, ...(keyPool.parseKeys(process.env.COHERE_API_KEYS))]);
  }
  if (serverHuggingFaceKey && !keyPool.pools.get('huggingface')?.some(k => k.key === serverHuggingFaceKey)) {
    keyPool.registerPool('huggingface', [serverHuggingFaceKey, ...(keyPool.parseKeys(process.env.HUGGINGFACE_API_KEYS))]);
  }
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
        mediaSrc: ["'self'", 'blob:', 'data:'],
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
    // OpenAI-compatible gateway sub-paths allow cross-origin requests (auth is via API key)
    if (req.path.startsWith('/v1/')) return next();

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
  app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));

  async function getCurrentUser(req) {
    const token = getSessionToken(req);
    const user = token ? await accountStore.getUserForSession(token) : null;
    if (user && user.email?.toLowerCase() === 'huzaifakazi1991@gmail.com') {
      user.tier = 'owner_unlimited';
      user.hasActiveSubscription = true;
      user.unlockedAllModels = true;
      user.planId = 'owner_unlimited';
      user.creditsBalance = 999999999;
    }
    if (user && user.email?.toLowerCase() === 'huzaifakazi1991@gmail.com') {
      user.tier = 'owner_unlimited';
      user.hasActiveSubscription = true;
      user.unlockedAllModels = true;
      user.planId = 'owner_unlimited';
      user.creditsBalance = 999999999;
    }
    return user;
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

  async function getProviderKeyForUser(userId, providerId) {
    return typeof accountStore.getProviderApiKey === 'function'
      ? await accountStore.getProviderApiKey(userId, providerId)
      : null;
  }

  async function requireAccount(req, res) {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: { message: 'Sign in to manage API keys.' } });
      return null;
    }
    if (user && user.email?.toLowerCase() === 'huzaifakazi1991@gmail.com') {
      user.tier = 'owner_unlimited';
      user.hasActiveSubscription = true;
      user.unlockedAllModels = true;
      user.planId = 'owner_unlimited';
      user.creditsBalance = 999999999;
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
    const isExcludedFromFree = id.includes('lyria') ||
      id === 'openrouter/auto' ||
      id.includes('inclusionai/ling') ||
      id.includes('gemma-4-26b-a4b-it:free') ||
      id.includes('gemma-4-31b-it:free');

    const isFree = !isExcludedFromFree && (
      id.endsWith(':free') ||
      id === 'openrouter/free' ||
      (model.pricing?.prompt === '0' && model.pricing?.completion === '0')
    );

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

    const { modality, modalities, supportsTools } = detectModelModality(id, model);
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
      tier: isFree ? 'free' : 'pro',
      modality,
      modalities,
      supportsTools
    };
  }

  async function verifyProviderApiKey(providerId, candidate, signal) {
    if (providerId === 'openrouter') {
      try {
        return await verifyOpenRouterApiKey(candidate, signal);
      } catch (err) {
        if (err.status && err.status !== 404) throw err;
        const response = await fetchImpl(
          `${openRouterUpstreamBase}/models`,
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
          const error = new Error(safeUpstreamMessage(body, response.status, candidate, 'OpenRouter'));
          error.status = response.status;
          throw error;
        }
        let result;
        try { result = JSON.parse(body); } catch { throw new Error('OpenRouter returned an invalid model list.'); }
        return Array.isArray(result?.data) ? result.data.length : 1;
      }
    }

    const provider = PROVIDERS[providerId];
    if (!provider) {
      const error = new Error(`Provider '${providerId}' is not supported.`);
      error.status = 400;
      throw error;
    }

    const response = await fetchImpl(
      provider.modelsUrl,
      {
        headers: {
          Authorization: `Bearer ${candidate}`,
          ...(provider.headers || {})
        },
        signal
      }
    );
    const body = await response.text();

    if (!response.ok) {
      const error = new Error(
        safeUpstreamMessage(body, response.status, candidate, provider.name)
      );
      error.status = response.status;
      throw error;
    }

    let result;
    try {
      result = JSON.parse(body);
    } catch {
      const error = new Error(`${provider.name} returned an invalid model list.`);
      error.status = 502;
      throw error;
    }

    if (Array.isArray(result?.data)) {
      return result.data.filter(m => m && typeof m.id === 'string').length || 1;
    }
    if (Array.isArray(result)) {
      return result.length || 1;
    }
    return 1;
  }

  function formatExternalModel(model, providerId) {
    const provider = PROVIDERS[providerId] || { name: providerId };
    const id = typeof model.id === 'string' ? model.id : '';
    const cleanId = id.startsWith(`${providerId}:`) ? id.slice(`${providerId}:`.length) : id;

    let brand = provider.name;
    const lower = cleanId.toLowerCase();
    if (lower.includes('claude') || lower.includes('anthropic')) brand = 'Anthropic';
    else if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('openai')) brand = 'OpenAI';
    else if (lower.includes('gemini') || lower.includes('gemma') || lower.includes('google')) brand = 'Google';
    else if (lower.includes('llama') || lower.includes('meta')) brand = 'Meta';
    else if (lower.includes('deepseek')) brand = 'DeepSeek';
    else if (lower.includes('mistral') || lower.includes('mixtral') || lower.includes('codestral')) brand = 'Mistral';
    else if (lower.includes('qwen') || lower.includes('alibaba')) brand = 'Qwen';

    const isExcludedExternal = cleanId.includes('deepseek-v3.2') ||
      cleanId.includes('deepseek-v4.1') ||
      cleanId.includes('glm-5.1') ||
      cleanId.includes('glm-5.3');

    const isFree = !isExcludedExternal && Boolean(
      model.isFree ||
      cleanId.endsWith(':free') ||
      cleanId.includes('/free') ||
      (model.pricing?.prompt === '0' && model.pricing?.completion === '0')
    );

    const contextLength = Number(model.context_window || model.context_length || 128000) || 128000;

    const { modality, modalities, supportsTools } = detectModelModality(cleanId, model);
    return {
      ...model,
      id: `${providerId}:${cleanId}`,
      sourceId: cleanId,
      provider: providerId,
      brand,
      name: model.name || cleanId,
      owned_by: brand,
      context_window: contextLength,
      context_length: contextLength,
      available: true,
      isFree,
      tier: isFree ? 'free' : 'pro',
      modality,
      modalities,
      supportsTools
    };
  }

  const modelSyncService = createModelSyncService({
    db: accountStore?.db,
    keyPool,
    fetchImpl
  });
  if (process.env.NODE_ENV !== 'test') {
    modelSyncService.startPeriodicSync();
  }

  const ADMIN_EMAILS = new Set([
    'huzaifakazi1991@gmail.com',
    ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) : [])
  ]);

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      apiKeyConfigured: Boolean(apiKey) || keyPool.hasKeys('freellmapi') || keyPool.hasKeys('openrouter'),
      pool: keyPool.getPoolHealth()
    });
  });

  app.get('/api/admin/health/providers', async (req, res) => {
    const user = await getCurrentUser(req);
    const authHeader = req.headers.authorization;
    let isAdmin = false;

    if (user && ADMIN_EMAILS.has(user.email?.toLowerCase())) {
      isAdmin = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const apiKeyUser = await accountStore.verifyAndTrackApiKey?.(token);
      if (apiKeyUser && ADMIN_EMAILS.has(apiKeyUser.email?.toLowerCase())) {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({
        error: { message: 'Access denied: Admin credentials required for diagnostic telemetry.' }
      });
    }

    try {
      const diagnostics = await runAdminProviderDiagnostics({ keyPool, fetchImpl });
      const modelCatalog = modelSyncService.getCatalog();

      for (const [pId, pRes] of Object.entries(diagnostics.providers)) {
        pRes.activeModels = modelCatalog.models.filter(m => m.provider === pId).length;
      }
      diagnostics.totalModelsOnline = modelCatalog.count;
      diagnostics.lastCatalogSync = modelCatalog.lastSyncedAt;

      return res.json(diagnostics);
    } catch (err) {
      return res.status(500).json({ error: { message: `Diagnostic scan failed: ${err.message}` } });
    }
  });

  // Admin Google AI Studio Integration Status
  app.get('/api/admin/integrations/google-ai-studio/status', async (req, res) => {
    const user = await getCurrentUser(req);
    const authHeader = req.headers.authorization;
    let isAdmin = false;

    if (user && (ADMIN_EMAILS.has(user.email?.toLowerCase()) || user.role === 'admin' || user.tier === 'owner_unlimited')) {
      isAdmin = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const apiKeyUser = await accountStore.verifyAndTrackApiKey?.(token);
      if (apiKeyUser && (ADMIN_EMAILS.has(apiKeyUser.email?.toLowerCase()) || apiKeyUser.role === 'admin' || apiKeyUser.tier === 'owner_unlimited')) {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({
        error: { message: 'Access denied: Admin credentials required for Google AI Studio management.' }
      });
    }

    try {
      const status = await accountStore.getSystemIntegrationStatus('google-ai-studio');
      const activeKey = await getGoogleAIStudioKey(accountStore);
      const configured = Boolean(activeKey);
      const maskedKey = maskApiKey(activeKey);
      const models = await getGeminiModelCatalog(activeKey, fetchImpl);

      return res.json({
        configured,
        maskedKey,
        lastTestedAt: status.lastTestedAt || (configured ? new Date().toISOString() : null),
        activeModelsCount: models.length,
        models
      });
    } catch (err) {
      return res.status(500).json({ error: { message: `Failed to fetch Google AI Studio status: ${err.message}` } });
    }
  });

  // Admin Google AI Studio Integration Management (Save, Test, Delete)
  app.post('/api/admin/integrations/google-ai-studio', async (req, res) => {
    const user = await getCurrentUser(req);
    const authHeader = req.headers.authorization;
    let isAdmin = false;

    if (user && (ADMIN_EMAILS.has(user.email?.toLowerCase()) || user.role === 'admin' || user.tier === 'owner_unlimited')) {
      isAdmin = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const apiKeyUser = await accountStore.verifyAndTrackApiKey?.(token);
      if (apiKeyUser && (ADMIN_EMAILS.has(apiKeyUser.email?.toLowerCase()) || apiKeyUser.role === 'admin' || apiKeyUser.tier === 'owner_unlimited')) {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({
        error: { message: 'Access denied: Admin credentials required for Google AI Studio management.' }
      });
    }

    const { apiKey: newKey, action = 'save' } = req.body || {};

    try {
      if (action === 'delete') {
        await accountStore.deleteSystemIntegration('google-ai-studio');
        return res.json({
          success: true,
          configured: false,
          maskedKey: null,
          activeModelsCount: 0,
          message: 'Google AI Studio key removed securely from system vault.'
        });
      }

      // Save or Test action
      const keyToTest = newKey || (await getGoogleAIStudioKey(accountStore));
      if (!keyToTest) {
        return res.status(400).json({
          error: { message: 'A Google AI Studio API key (AIzaSy...) is required.' }
        });
      }

      // Validate key against Google official endpoint
      const discoveredModels = await validateAndSyncGeminiModels(keyToTest, fetchImpl);
      const masked = maskApiKey(keyToTest);
      const testedAt = new Date().toISOString();

      if (newKey) {
        await accountStore.setSystemIntegration('google-ai-studio', newKey.trim(), {
          maskedKey: masked,
          activeModelsCount: discoveredModels.length,
          lastTestedAt: testedAt
        });
      }

      return res.json({
        success: true,
        configured: true,
        maskedKey: masked,
        activeModelsCount: discoveredModels.length,
        lastTestedAt: testedAt,
        message: `Google AI Studio key verified successfully. ${discoveredModels.length} models synced and online.`
      });
    } catch (err) {
      return res.status(400).json({
        error: { message: err.message || 'Failed to verify Google AI Studio API key.' }
      });
    }
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
    if (!user) {
      return res.set('Cache-Control', 'no-store').json({ user: null });
    }
    const connectedProviders = [];
    if (typeof accountStore.getProviderApiKeyStatus === 'function') {
      for (const p of ['openrouter', 'electronhub', 'groq', 'freemodel']) {
        try {
          const status = await accountStore.getProviderApiKeyStatus(user.id, p);
          if (status?.configured) connectedProviders.push(p);
        } catch {
          // ignore
        }
      }
    }
    res.set('Cache-Control', 'no-store').json({
      user,
      connectedProviders,
      hasOpenRouterKey: connectedProviders.includes('openrouter'),
      hasExternalKeys: connectedProviders.length > 0
    });
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

  app.get('/api/account/integrations/:provider', async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    const providerId = req.params.provider;
    const providerConfig = PROVIDERS[providerId];
    if (!providerConfig) {
      return res.status(404).json({ error: { message: `Provider '${providerId}' is not supported.` } });
    }
    if (typeof accountStore.getProviderApiKeyStatus !== 'function') {
      return res.status(503).json({
        error: { message: 'Provider integrations are not available in this account store.' }
      });
    }

    res.set('Cache-Control', 'no-store').json({
      ...await accountStore.getProviderApiKeyStatus(user.id, providerId),
      canConfigure: Boolean(accountStore.apiKeysEnabled),
      provider: providerId
    });
  });

  app.put('/api/account/integrations/:provider', credentialRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    const providerId = req.params.provider;
    const providerConfig = PROVIDERS[providerId];
    if (!providerConfig) {
      return res.status(404).json({ error: { message: `Provider '${providerId}' is not supported.` } });
    }
    if (
      typeof accountStore.setProviderApiKey !== 'function' ||
      typeof accountStore.apiKeysEnabled !== 'boolean'
    ) {
      return res.status(503).json({
        error: { message: `${providerConfig.name} integration is not available in this account store.` }
      });
    }
    if (!accountStore.apiKeysEnabled) {
      return res.status(503).json({
        error: { message: 'API key encryption is not configured on the local server.' }
      });
    }

    const schema = providerConfig.requiresTerms ? openRouterKeySchema : providerKeySchema;
    const body = validatedBody(
      schema,
      req,
      res,
      providerConfig.requiresTerms && req.body?.termsAccepted !== true
        ? `Review and accept ${providerConfig.name} terms before connecting.`
        : `Enter a valid ${providerConfig.name} API key (8-4096 characters).`
    );
    if (!body) return;
    const candidate = body.apiKey;

    const request = requestAbortSignal(req, res, Math.min(timeoutMs, 15000));
    let verified = false;
    try {
      const modelCount = await verifyProviderApiKey(providerId, candidate, request.controller.signal);
      verified = true;
      const status = await accountStore.setProviderApiKey(
        user.id,
        providerId,
        candidate,
        new Date().toISOString(),
        new Date().toISOString()
      );
      res.set('Cache-Control', 'no-store').json({ ...status, modelCount });
    } catch (error) {
      console.error('[Integrations] Failed to save/verify key for ' + providerId + ':', error);
      const status = error.status || (verified ? 500 : request.timedOut ? 504 : 502);
      const message = error.status
        ? error.message
        : verified
          ? 'The key was verified but could not be saved securely.'
          : request.timedOut
            ? `${providerConfig.name} did not respond in time while checking the key.`
            : `Could not connect to ${providerConfig.name} while checking the key.`;
      if (!res.headersSent && !res.destroyed) {
        res.status(status).json({ error: { message } });
      }
    } finally {
      request.cleanup();
    }
  });

  app.post('/api/account/integrations/:provider/test', credentialRateLimiter, async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    const providerId = req.params.provider;
    const providerConfig = PROVIDERS[providerId];
    if (!providerConfig) {
      return res.status(404).json({ error: { message: `Provider '${providerId}' is not supported.` } });
    }
    if (
      typeof accountStore.getProviderApiKey !== 'function' ||
      typeof accountStore.markProviderApiKeyTested !== 'function'
    ) {
      return res.status(503).json({
        error: { message: `${providerConfig.name} integration is not available in this account store.` }
      });
    }

    const candidate = await getProviderKeyForUser(user.id, providerId);
    if (!candidate) {
      return res.status(404).json({
        error: { message: `Connect an ${providerConfig.name} API key before testing the integration.` }
      });
    }

    const request = requestAbortSignal(req, res, Math.min(timeoutMs, 15000));
    try {
      const modelCount = await verifyProviderApiKey(providerId, candidate, request.controller.signal);
      const status = await accountStore.markProviderApiKeyTested(user.id, providerId);
      res.set('Cache-Control', 'no-store').json({ ...status, modelCount });
    } catch (error) {
      const status = error.status || (request.timedOut ? 504 : 502);
      const message = error.status
        ? error.message
        : request.timedOut
          ? `${providerConfig.name} did not respond in time while checking the integration.`
          : `Could not connect to ${providerConfig.name} while checking the integration.`;
      if (!res.headersSent && !res.destroyed) {
        res.status(status).json({ error: { message } });
      }
    } finally {
      request.cleanup();
    }
  });

  app.delete('/api/account/integrations/:provider', async (req, res) => {
    const user = await requireAccount(req, res);
    if (!user) return;
    const providerId = req.params.provider;
    if (!PROVIDERS[providerId]) {
      return res.status(404).json({ error: { message: `Provider '${providerId}' is not supported.` } });
    }
    if (typeof accountStore.revokeProviderApiKey !== 'function') {
      return res.status(503).json({
        error: { message: 'Provider integration is not available in this account store.' }
      });
    }

    await accountStore.revokeProviderApiKey(user.id, providerId);
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

    const userProviderKeys = {};
    if (user) {
      for (const p of ['openrouter', 'electronhub', 'groq', 'freemodel']) {
        userProviderKeys[p] = await getProviderKeyForUser(user.id, p);
      }
    }
    const effectiveKeys = {
      openrouter: userProviderKeys.openrouter || serverOpenRouterKey || (keyPool?.hasKeys('openrouter') ? keyPool.pools.get('openrouter')?.[0]?.key : ''),
      electronhub: userProviderKeys.electronhub || serverElectronHubKey,
      groq: userProviderKeys.groq || serverGroqKey,
      freemodel: userProviderKeys.freemodel || serverFreeModelKey
    };

    if (!requestApiKey && !Object.values(effectiveKeys).some(Boolean)) {
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
        if (Array.isArray(result?.data)) {
          return result.data.filter(model => model && typeof model.id === 'string');
        }
        if (Array.isArray(result)) {
          return result.filter(model => model && typeof model.id === 'string');
        }
        warnings.push(label + ' returned an invalid model list.');
        return [];
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

      if (effectiveKeys.openrouter) {
        let openRouterModels = await discoverModels(
          'OpenRouter',
          openRouterUpstreamBase + '/models',
          {
            Authorization: 'Bearer ' + effectiveKeys.openrouter,
            'X-OpenRouter-Title': 'iamhujju'
          },
          effectiveKeys.openrouter
        );

        if (!openRouterModels.length) {
          openRouterModels = await discoverModels(
            'OpenRouter',
            openRouterUpstreamBase + '/models/user',
            {
              Authorization: 'Bearer ' + effectiveKeys.openrouter,
              'X-OpenRouter-Title': 'iamhujju'
            },
            effectiveKeys.openrouter
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

      for (const p of ['electronhub', 'groq', 'freemodel']) {
        const key = effectiveKeys[p];
        if (!key) continue;
        const config = PROVIDERS[p];
        let pModels = [];
        
        if (key) {
          pModels = await discoverModels(
            config.name,
            config.modelsUrl,
            {
              ...(key ? { Authorization: 'Bearer ' + key } : {}),
              ...(config.headers || {})
            },
            key || ''
          );
        }

        if (!pModels || pModels.length === 0) {
          pModels = PROVIDER_FALLBACK_MODELS[p] || [];
        }

        const mapped = pModels.map(m => formatExternalModel(m, p));
        models.push(...mapped);
      }

      // Google AI Studio Models (Gemini Native)
      const geminiApiKey = await getGoogleAIStudioKey(accountStore);
      if (geminiApiKey) {
        const geminiModels = await getGeminiModelCatalog(geminiApiKey, fetchImpl);
        models.push(...geminiModels);
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

      if (models.length === 0) {
      const defaultCatalog = [
        { id: 'openrouter:openrouter/free', name: 'OpenRouter Free (Auto)', owned_by: 'OpenRouter' },
        { id: 'openrouter:deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', owned_by: 'DeepSeek' },
        { id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct (Free)', owned_by: 'Meta' },
        { id: 'openrouter:google/gemini-2.5-flash:free', name: 'Google Gemini 2.5 Flash (Free)', owned_by: 'Google' },
        { id: 'openrouter:openai/gpt-4o-mini', name: 'GPT-4o Mini', owned_by: 'OpenAI' }
      ];
      models.push(...defaultCatalog.map(m => ({
        id: m.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.owned_by,
        permission: [],
        root: m.id,
        parent: null
      })));
    }

    const cleanModels = models.filter(m => {
      if (BROKEN_MODELS_BLACKLIST.has(m.id)) return false;
      if (typeof m.id === 'string' && m.id.endsWith(':batch')) return false;
      return true;
    });
    if (!apiKey && !cleanModels.some(m => m.id === HUZAIFA_OMNI_MODEL_ID)) {
      cleanModels.unshift(HUZAIFA_OMNI_MODEL_METADATA);
    }
    res.set('Cache-Control', 'no-store').json({ object: 'list', data: cleanModels });
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

    const isHuzaifaOmni = body.model === HUZAIFA_OMNI_MODEL_ID ||
      body.model === 'huzaifa-kazi' ||
      body.model === 'omni' ||
      body.model === 'huzaifa-kazi-omni';

    if (isHuzaifaOmni) {
      return executeHuzaifaOmniChat({
        req,
        res,
        body,
        user,
        accountStore,
        keyPool,
        fetchImpl,
        timeoutMs,
        upstreamBase
      });
    }

    const isGeminiModel = (typeof body.model === 'string' && (body.model.startsWith('gemini:') || body.model.startsWith('google-ai-studio:'))) ||
      body.model?.toLowerCase().includes('gemini-') && !body.model?.startsWith('openrouter') && !body.model?.startsWith('electronhub');

    if (isGeminiModel) {
      if (!verifyPaidGeminiAccess(user)) {
        return res.status(403).json({
          error: {
            message: 'Upgrade to a paid plan to unlock Google Gemini Pro, Image, Video & Autonomous Agent models.',
            code: 'paid_plan_required'
          }
        });
      }

      const geminiKey = await getGoogleAIStudioKey(accountStore);
      if (!geminiKey) {
        return res.status(503).json({
          error: {
            message: 'Google AI Studio integration is not configured. Please contact the administrator.',
            code: 'gemini_not_configured'
          }
        });
      }

      return streamGeminiChat({
        model: body.model,
        messages: body.messages,
        browse: Boolean(body.browse || body.webSearch),
        webSearch: Boolean(body.browse || body.webSearch),
        apiKey: geminiKey,
        fetchImpl,
        res
      });
    }

    const modelTarget = resolveModelTarget(body.model, { keyPool });
    let { provider: targetProvider, sourceModel } = modelTarget;
    if (sourceModel && sourceModel.endsWith(':batch')) {
      sourceModel = sourceModel.slice(0, -':batch'.length);
    }
    if (!sourceModel) {
      return res.status(400).json({
        error: { message: 'Select a valid model from the connected provider.' }
      });
    }

    let userPersonalKey = null;
    if (user) {
      if (targetProvider !== 'freellmapi') {
        userPersonalKey = await getProviderKeyForUser(user.id, targetProvider);
      } else if (typeof accountStore.getApiKey === 'function') {
        userPersonalKey = await accountStore.getApiKey(user.id);
      }
    }

    let requestApiKey = userPersonalKey;
    if (!requestApiKey) {
      if (targetProvider !== 'freellmapi') {
        requestApiKey = keyPool?.hasKeys(targetProvider) ? 'pool' : '';
      } else {
        requestApiKey = allowSharedGatewayKey ? (apiKey || (keyPool?.hasKeys('freellmapi') ? 'pool' : '')) : '';
      }
    }

    // Dynamic failover to fallback chain or OpenRouter if targetProvider has no keys
    if (!requestApiKey && Array.isArray(modelTarget.fallbackChain)) {
      for (const fb of modelTarget.fallbackChain) {
        const fbP = typeof fb === 'string' ? fb : fb.provider;
        const fbM = typeof fb === 'string' ? null : fb.model;
        let fbUserKey = null;
        if (user && fbP !== 'freellmapi') {
          fbUserKey = await getProviderKeyForUser(user.id, fbP);
        }
        if (fbUserKey || keyPool?.hasKeys(fbP)) {
          targetProvider = fbP;
          sourceModel = fbM || sourceModel;
          userPersonalKey = fbUserKey;
          requestApiKey = fbUserKey || 'pool';
          break;
        }
      }
    }

    if (!requestApiKey && keyPool?.hasKeys('openrouter')) {
      targetProvider = 'openrouter';
      sourceModel = sourceModel.includes('/') ? sourceModel : 'openrouter/free';
      requestApiKey = 'pool';
    }

    if (!requestApiKey) {
      const pName = PROVIDERS[targetProvider]?.name || targetProvider;
      return res.status(403).json({
        error: {
          message: targetProvider !== 'freellmapi'
            ? `Connect your ${pName} API key in Account Integrations before using this model.`
            : 'Add your personal FreeLLMAPI key in Account before using this model.'
        }
      });
    }

    const hasPersonalKey = Boolean(userPersonalKey);
    const isUserPro = Boolean(user && (user.tier !== 'free' || user.hasActiveSubscription || user.unlockedAllModels));
    const isFreeTierUsingServerKey = !isUserPro && !hasPersonalKey;

    if (targetProvider === 'openrouter') {
      const isFreeModel = sourceModel.endsWith(':free') ||
        sourceModel === 'openrouter/free' ||
        false /* openrouter/auto is paid */;

      if (isFreeTierUsingServerKey && !isFreeModel) {
        return res.status(403).json({
          error: {
            message: `${sourceModel} is a Pro model. Connect your personal OpenRouter API key in Account to use Pro models, or choose any of the 100% Free models.`
          }
        });
      }
    }

    // Real-Time Web Search & Anti-Hallucination Grounding Engine
    const lastUserMessage = [...(body.messages || [])].reverse().find(m => m.role === 'user');
    const userQueryText = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : Array.isArray(lastUserMessage?.content)
      ? lastUserMessage.content.map(c => c.text || '').join(' ')
      : '';

    const needsLiveSearch = shouldTriggerLiveSearch(userQueryText, Boolean(body.browse || body.webSearch));
    let liveSources = [];
    let groundedBody = body;

    if (needsLiveSearch && userQueryText) {
      try {
        const searchResult = await browseWeb(userQueryText, { maxResults: 6 });
        liveSources = searchResult.sources || [];
        if (liveSources.length > 0) {
          const updatedMessages = [...(body.messages || [])];
          const sysIdx = updatedMessages.findIndex(m => m.role === 'system');
          if (sysIdx >= 0) {
            updatedMessages[sysIdx] = {
              ...updatedMessages[sysIdx],
              content: `${updatedMessages[sysIdx].content}\n\n${searchResult.formattedContext}`
            };
          } else {
            updatedMessages.unshift({
              role: 'system',
              content: searchResult.formattedContext
            });
          }
          groundedBody = {
            ...body,
            messages: updatedMessages
          };
        }
      } catch (err) {
        console.warn('[LiveGrounding] Search failed, falling back:', err.message);
      }
    }

    const requestBody = sanitizePayloadForModel(targetProvider, sourceModel, groundedBody, { isFreeTierUsingServerKey });

    const providerConfig = PROVIDERS[targetProvider];
    const providerName = providerConfig ? providerConfig.name : (targetProvider === 'openrouter' ? 'OpenRouter' : 'FreeLLMAPI');
    const chatEndpoint = providerConfig ? providerConfig.chatUrl : `${upstreamBase}/chat/completions`;
    const request = requestAbortSignal(req, res, timeoutMs);

    try {
      let activeRequestKey = requestApiKey;
      const response = await keyPool.executeWithFailover({
        providerId: targetProvider,
        userKey: userPersonalKey,
        fallbackChain: modelTarget.fallbackChain,
        requestFn: async (activeKey, currentProvider, currentModel) => {
          activeRequestKey = activeKey;
          const curConfig = (currentProvider && PROVIDERS[currentProvider]) || providerConfig;
          const curEndpoint = curConfig ? curConfig.chatUrl : `${upstreamBase}/chat/completions`;
          const curModel = currentModel || sourceModel;
          const curBody = sanitizePayloadForModel(currentProvider || targetProvider, curModel, groundedBody, { isFreeTierUsingServerKey });

          return await fetchImpl(
            curEndpoint,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${activeKey}`,
                'Content-Type': 'application/json',
                ...((currentProvider || targetProvider) === 'openrouter' ? {
                  'HTTP-Referer': 'https://iamhujju.com',
                  'X-Title': 'iamhujju',
                  'X-OpenRouter-Title': 'iamhujju'
                } : {}),
                ...(curConfig?.headers || {})
              },
              body: JSON.stringify(curBody),
              signal: request.controller.signal
            }
          );
        },
        maxRetries: 3
      });

      if (!response.ok) {
        const bodyText = await response.text();
        return res.status(response.status).json({
          error: {
            message: safeUpstreamMessage(
              bodyText,
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

      if (liveSources.length > 0) {
        res.write(`data: ${JSON.stringify({ status: `Verified ${liveSources.length} live web & news sources` })}\n\n`);
        res.write(`data: ${JSON.stringify({ sources: liveSources })}\n\n`);
      }

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

    const systemInstruction = `You are Huzaifa Kazi, the official AI Companion, unified multi-model intelligence, and platform navigator for iamhujju (https://iamhujju.com).
Your mission is to provide comprehensive help, answer queries with razor-sharp expertise across all models and features, and guide/navigate users through the platform.

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

    return `I'm **Huzaifa Kazi**, your unified AI companion! I can help you with anything related to the platform:

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

  // Payment Plans & Razorpay / UPI Integration (Single Source of Truth)
  const PLAN_CATALOG = PRICING_PLANS;

  // Unified Pricing endpoint for frontend UI sync
  app.get('/api/pricing', (req, res) => {
    res.set('Cache-Control', 'public, max-age=60').json({
      currency: CURRENCY,
      currencySymbol: '₹',
      plans: PRICING_PLANS
    });
  });

  // User payment history & receipts
  app.get('/api/payments/history', chatRateLimiter, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: { message: 'Sign in to view your billing and payment history.' } });
    }
    if (typeof accountStore.listPaymentsForUser !== 'function') {
      return res.json({ payments: [] });
    }
    try {
      const payments = await accountStore.listPaymentsForUser(user.id, user.email);
      return res.json({ payments });
    } catch (err) {
      console.error('[Payment History Error]', err);
      return res.status(500).json({ error: { message: 'Could not fetch payment history.' } });
    }
  });

  // Official Razorpay instance if keys are provided or mock instance injected
  const rzpClient = razorpayInstance || (razorpayKeyId && razorpayKeySecret
    ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
    : null);

  function verifyHmacSha256(data, signature, secret) {
    if (!data || !signature || !secret || typeof signature !== 'string') return false;
    try {
      const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
      const expectedBuffer = Buffer.from(expected, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'utf8');
      if (expectedBuffer.length !== signatureBuffer.length) return false;
      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }

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
    amount: z.number().int().optional(),
    currency: z.string().trim().default('INR').optional(),
    receipt: z.string().trim().optional(),
    planId: z.string().trim().optional(),
    billingCycle: z.enum(['monthly', 'annual', 'once']).optional().default('monthly'),
    email: z.string().trim().email().optional().default('')
  });

  async function handleCreateOrder(req, res) {
    const body = validatedBody(
      createOrderSchema,
      req,
      res,
      'Invalid order payload. Specify amount (paise >= 100) or valid planId.'
    );
    if (!body) return;

    let amountPaise = 0;
    let amountInr = 0;
    const plan = body.planId ? resolvePlan(body.planId, body.billingCycle) : null;

    if (body.amount !== undefined) {
      if (typeof body.amount !== 'number' || body.amount < 100) {
        return res.status(400).json({ error: { message: 'Amount must be at least 100 paise.' } });
      }
      amountPaise = Math.round(body.amount);
      amountInr = Math.round(amountPaise / 100);
    } else if (plan && !plan.isFree) {
      amountPaise = plan.amountPaise;
      amountInr = plan.amountInr;
    } else {
      return res.status(400).json({ error: { message: 'Valid paid plan or amount (paise >= 100) is required.' } });
    }

    const currency = (body.currency || 'INR').toUpperCase();
    const currentUser = await getCurrentUser(req);
    const customerEmail = currentUser?.email || body.email;
    const customerUid = currentUser?.id || '';

    // Deterministic unique receipt
    const receiptUid = customerUid ? customerUid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) : 'guest';
    const receipt = body.receipt || `rcpt_${receiptUid}_${Date.now()}`;

    let razorpayOrderId = '';
    const notes = {
      uid: customerUid,
      email: customerEmail,
      planId: plan ? plan.planId : (body.planId || 'standard_checkout'),
      billingCycle: body.billingCycle,
      source: 'iamhujju.com'
    };

    const isTestMode = process.env.NODE_ENV === 'test' ||
      process.env.npm_lifecycle_event === 'test' ||
      Boolean(process.env.NODE_TEST_CONTEXT) ||
      process.execArgv.includes('--test') ||
      process.argv.includes('--test');
    if (rzpClient && (!isTestMode || razorpayInstance)) {
      try {
        const order = await rzpClient.orders.create({
          amount: amountPaise,
          currency,
          receipt,
          notes
        });
        razorpayOrderId = order?.id;
      } catch (rzpErr) {
        console.error('[Razorpay Order Creation Error]', rzpErr?.message || rzpErr);
        const isAuthError = rzpErr?.statusCode === 401 ||
          (rzpErr?.error?.code === 'BAD_REQUEST_ERROR' && /auth/i.test(rzpErr?.error?.description || ''));
        if (isAuthError) {
          return res.status(401).json({ error: { message: 'Razorpay authentication failed. Verify API credentials.' } });
        }
        return res.status(500).json({
          error: {
            message: rzpErr?.error?.description || rzpErr?.message || 'Failed to create order with Razorpay.'
          }
        });
      }
    }

    if (!razorpayOrderId) {
      // Deterministic fallback for test sandbox / direct UPI checkout
      razorpayOrderId = `order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    const effectivePlanId = body.planId || (plan ? (plan.basePlanId || plan.planId) : 'standard');

    // Save pending payment record in PostgreSQL ledger table before returning to client
    if (typeof accountStore.recordPaymentOrder === 'function') {
      try {
        await accountStore.recordPaymentOrder({
          orderId: razorpayOrderId,
          userId: customerUid || null,
          email: customerEmail || 'guest@iamhujju.com',
          planId: effectivePlanId,
          billingCycle: body.billingCycle,
          amountPaise,
          currency,
          receipt,
          metadata: { notes }
        });
      } catch (dbErr) {
        console.warn('[Payments Ledger Warning: could not record pending order]', dbErr?.message);
      }
    }

    return res.json({
      success: true,
      order_id: razorpayOrderId,
      orderId: razorpayOrderId,
      id: razorpayOrderId,
      amount: amountPaise,
      amountInr,
      currency,
      keyId: razorpayKeyId || '',
      planId: effectivePlanId,
      planName: plan?.title || plan?.name || 'iamhujju',
      billingCycle: body.billingCycle,
      upiId: officialUpiId,
      accountName: razorpayAccountName,
      receipt,
      fallbackToDirectUpi: !razorpayKeySecret
    });
  }

  // Standard checkout routes and aliases
  app.post('/api/create-order', chatRateLimiter, handleCreateOrder);
  app.post('/api/payments/razorpay/create-order', chatRateLimiter, handleCreateOrder);
  app.post('/api/payment/create-order', chatRateLimiter, handleCreateOrder);

  const verifyPaymentSchema = z.object({
    planId: z.string().trim().optional().default('pro'),
    billingCycle: z.enum(['monthly', 'annual', 'once']).optional().default('monthly'),
    order_id: z.string().trim().optional(),
    payment_id: z.string().trim().optional(),
    signature: z.string().trim().optional(),
    razorpay_order_id: z.string().trim().optional(),
    razorpay_payment_id: z.string().trim().optional(),
    razorpay_signature: z.string().trim().optional(),
    upi_ref: z.string().trim().optional(),
    email: z.string().trim().email().optional()
  });

  async function handleVerifyPayment(req, res) {
    const body = validatedBody(
      verifyPaymentSchema,
      req,
      res,
      'Verification requires valid payment details.'
    );
    if (!body) return;

    const resolvedPlan = resolvePlan(body.planId, body.billingCycle);
    const effectiveTier = resolvedPlan.basePlanId || resolvedPlan.planId;
    let user = await getCurrentUser(req);
    if (!user && body.email && typeof accountStore.findUserByEmail === 'function') {
      user = await accountStore.findUserByEmail(body.email);
    }

    const orderId = body.razorpay_order_id || body.order_id;
    const paymentId = body.razorpay_payment_id || body.payment_id;
    const signature = body.razorpay_signature || body.signature;

    // 1. Razorpay signature verification
    if (orderId && paymentId && signature) {
      if (razorpayKeySecret) {
        const payload = `${orderId}|${paymentId}`;
        const isValid = verifyHmacSha256(payload, signature, razorpayKeySecret);

        if (!isValid) {
          if (typeof accountStore.markPaymentFailed === 'function') {
            await accountStore.markPaymentFailed({
              orderId,
              paymentId,
              failureReason: 'Invalid payment signature (HMAC SHA-256 mismatch)',
              status: 'failed_verification'
            }).catch(() => {});
          }
          return res.status(400).json({ success: false, error: { message: 'Invalid payment signature. Verification failed.' } });
        }
      }

      // Idempotent capture & plan activation
      let captureResult = null;
      if (typeof accountStore.markPaymentCaptured === 'function') {
        captureResult = await accountStore.markPaymentCaptured({
          orderId,
          paymentId,
          signature,
          userId: user?.id,
          planId: effectiveTier
        });
      }

      let updatedUser = captureResult?.user || user;
      if (!updatedUser && user && typeof accountStore.updateUserTier === 'function') {
        updatedUser = await accountStore.updateUserTier(user.id, effectiveTier);
      }

      return res.json({
        success: true,
        alreadyCaptured: Boolean(captureResult?.alreadyCaptured),
        order_id: orderId,
        payment_id: paymentId,
        tier: effectiveTier,
        planId: resolvedPlan.planId,
        planTitle: resolvedPlan.title || resolvedPlan.name,
        paymentRef: paymentId,
        hasActiveSubscription: true,
        unlockedAllModels: true,
        provisionedApiKey: captureResult?.provisionedApiKey || null,
        message: `Payment verified successfully! Your ${resolvedPlan.title || resolvedPlan.name} is now active.`,
        user: updatedUser
      });
    }

    // 2. Direct UPI fallback
    if (body.upi_ref) {
      const cleanUtr = body.upi_ref.trim();
      if (cleanUtr.length < 6) {
        return res.status(400).json({ error: { message: 'Please enter a valid UPI reference (UTR) number.' } });
      }

      let updatedUser = null;
      if (user && typeof accountStore.updateUserTier === 'function') {
        updatedUser = await accountStore.updateUserTier(user.id, effectiveTier);
      }

      return res.json({
        success: true,
        tier: effectiveTier,
        planId: resolvedPlan.planId,
        planTitle: resolvedPlan.title || resolvedPlan.name,
        paymentRef: cleanUtr,
        message: `UPI Reference received! Your ${resolvedPlan.title || resolvedPlan.name} is now active.`,
        user: updatedUser || user
      });
    }

    return res.status(400).json({ error: { message: 'Payment reference or signature is required. Provide order_id, payment_id, and signature.' } });
  }

  // Standard checkout verify routes and aliases
  app.post('/api/verify-payment', chatRateLimiter, handleVerifyPayment);
  app.post('/api/payments/razorpay/verify', chatRateLimiter, handleVerifyPayment);
  app.post('/api/payment/verify', chatRateLimiter, handleVerifyPayment);

  // Dedicated Webhook Failsafe
  app.post('/api/webhooks/razorpay', async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({ error: { message: 'Missing x-razorpay-signature header.' } });
    }

    if (!razorpayWebhookSecret) {
      console.warn('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is not configured on server.');
      return res.status(503).json({ error: { message: 'Webhook secret is not configured.' } });
    }

    const rawBodyBuffer = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    const isValid = verifyHmacSha256(rawBodyBuffer, signature, razorpayWebhookSecret);

    if (!isValid) {
      console.error('[Razorpay Webhook] Signature verification failed.');
      return res.status(400).json({ error: { message: 'Invalid webhook signature.' } });
    }

    const event = req.body?.event;
    const payload = req.body?.payload || {};

    try {
      if (event === 'payment.captured' || event === 'order.paid') {
        const paymentEntity = payload.payment?.entity;
        const orderEntity = payload.order?.entity;
        const orderId = paymentEntity?.order_id || orderEntity?.id;
        const paymentId = paymentEntity?.id;
        const notes = paymentEntity?.notes || orderEntity?.notes || {};
        const userId = notes.uid;
        const planId = notes.planId;

        if (orderId && typeof accountStore.markPaymentCaptured === 'function') {
          await accountStore.markPaymentCaptured({
            orderId,
            paymentId,
            signature,
            userId,
            planId
          });
        }
      } else if (event === 'payment.failed') {
        const paymentEntity = payload.payment?.entity;
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;
        const failureReason = paymentEntity?.error_description || paymentEntity?.error_reason || 'Payment failed';

        if (orderId && typeof accountStore.markPaymentFailed === 'function') {
          await accountStore.markPaymentFailed({
            orderId,
            paymentId,
            failureReason
          });
        }
      }

      return res.status(200).json({ status: 'ok' });
    } catch (err) {
      console.error('[Razorpay Webhook Error]', err);
      return res.status(500).json({ error: { message: 'Failed to process webhook event.' } });
    }
  });

  app.get('/api/subscription/status', async (req, res) => {
    const user = await getCurrentUser(req);
    const tier = user?.tier || 'free';
    const plan = resolvePlan(tier, 'monthly');
    res.set('Cache-Control', 'no-store').json({
      tier,
      isPro: tier !== 'free',
      planId: plan.planId,
      planName: plan.title || plan.name || (tier === 'free' ? 'Free Tier' : tier.toUpperCase())
    });
  });

  // ── API Key Management Endpoints (/api/keys) ──────────────────────────────
  // Accepts session cookie OR Authorization Bearer token (platform API key)

  async function requireAccountOrApiKey(req, res) {
    // Try session cookie first
    const sessionUser = await getCurrentUser(req);
    if (sessionUser) return sessionUser;

    // Try Authorization Bearer sk-hujju-... key
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ') && typeof accountStore.verifyAndTrackApiKey === 'function') {
      const rawKey = authHeader.slice(7).trim();
      if (rawKey.startsWith('sk-hujju-')) {
        const user = await accountStore.verifyAndTrackApiKey(rawKey);
        if (user) return user;
      }
    }

    res.status(401).json({ error: { message: 'Sign in to manage API keys.' } });
    return null;
  }

  const apiKeyNameSchema = z.object({ name: z.string().trim().min(1).max(128) }).strict();
  const apiKeyRateLimiter = makeRateLimiter(
    rateLimits.apiKeys || 30,
    60 * 1000,
    'Too many API key requests. Try again later.'
  );

  app.get('/api/keys', apiKeyRateLimiter, async (req, res) => {
    const user = await requireAccountOrApiKey(req, res);
    if (!user) return;
    if (typeof accountStore.listApiKeys !== 'function') {
      return res.status(503).json({ error: { message: 'API key management is not available.' } });
    }
    const keys = await accountStore.listApiKeys(user.id);
    res.set('Cache-Control', 'no-store').json({ keys });
  });

  app.post('/api/keys', apiKeyRateLimiter, async (req, res) => {
    const user = await requireAccountOrApiKey(req, res);
    if (!user) return;
    if (typeof accountStore.createApiKey !== 'function') {
      return res.status(503).json({ error: { message: 'API key management is not available.' } });
    }
    const body = validatedBody(apiKeyNameSchema, req, res, 'Provide a name (1-128 characters) for the API key.');
    if (!body) return;
    const result = await accountStore.createApiKey(user.id, body.name);
    res.set('Cache-Control', 'no-store').status(201).json(result);
  });

  app.post('/api/keys/:keyId/regenerate', apiKeyRateLimiter, async (req, res) => {
    const user = await requireAccountOrApiKey(req, res);
    if (!user) return;
    if (typeof accountStore.regenerateApiKey !== 'function') {
      return res.status(503).json({ error: { message: 'API key management is not available.' } });
    }
    try {
      const result = await accountStore.regenerateApiKey(user.id, req.params.keyId);
      res.set('Cache-Control', 'no-store').json(result);
    } catch (error) {
      if (error.code === 'API_KEY_NOT_FOUND') {
        return res.status(404).json({ error: { message: error.message } });
      }
      throw error;
    }
  });

  app.delete('/api/keys/:keyId', apiKeyRateLimiter, async (req, res) => {
    const user = await requireAccountOrApiKey(req, res);
    if (!user) return;
    if (typeof accountStore.revokeApiKey !== 'function') {
      return res.status(503).json({ error: { message: 'API key management is not available.' } });
    }
    const deleted = await accountStore.revokeApiKey(user.id, req.params.keyId);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'API key not found.' } });
    }
    res.set('Cache-Control', 'no-store').status(204).end();
  });

  // ── OpenAI-compatible Gateway (/v1/* and /api/v1/*) ──────────────────────
  // Permissive CORS for external clients (curl, OpenAI SDK, etc.)

  function setGatewayCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  async function gatewayAuth(req, res) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          message: 'No API key provided.',
          type: 'invalid_request_error',
          code: 'invalid_api_key'
        }
      });
      return null;
    }
    const rawKey = authHeader.slice(7).trim();
    if (typeof accountStore.verifyAndTrackApiKey !== 'function' || !rawKey.startsWith('sk-hujju-')) {
      res.status(401).json({
        error: {
          message: `Incorrect API key provided: ${rawKey.slice(0, 10)}...`,
          type: 'invalid_request_error',
          code: 'invalid_api_key'
        }
      });
      return null;
    }
    const user = await accountStore.verifyAndTrackApiKey(rawKey);
    if (!user) {
      res.status(401).json({
        error: {
          message: `Incorrect API key provided: ${rawKey.slice(0, 10)}...`,
          type: 'invalid_request_error',
          code: 'invalid_api_key'
        }
      });
      return null;
    }
    if (user && user.email?.toLowerCase() === 'huzaifakazi1991@gmail.com') {
      user.tier = 'owner_unlimited';
      user.hasActiveSubscription = true;
      user.unlockedAllModels = true;
      user.planId = 'owner_unlimited';
      user.creditsBalance = 999999999;
    }
    return user;
  }

  // OPTIONS preflight for both /v1 and /api/v1 paths
  app.options(['/v1/{*splat}', '/api/v1/{*splat}'], (req, res) => {
    setGatewayCors(res);
    res.status(204).end();
  });

  // GET /v1/models and /api/v1/models — return OpenAI-formatted model list
  async function handleV1Models(req, res) {
    setGatewayCors(res);
    const user = await gatewayAuth(req, res);
    if (!user) return;

    const userApiKey = typeof accountStore.getApiKey === 'function'
      ? await accountStore.getApiKey(user.id)
      : null;
    const effectiveApiKey = userApiKey || (allowSharedGatewayKey ? apiKey : '');

    const userProviderKeys = {};
    for (const p of ['openrouter', 'electronhub', 'groq', 'freemodel']) {
      userProviderKeys[p] = await getProviderKeyForUser(user.id, p);
    }
    const effectiveKeys = {
      openrouter: userProviderKeys.openrouter || serverOpenRouterKey || (keyPool?.hasKeys('openrouter') ? keyPool.pools.get('openrouter')?.[0]?.key : ''),
      electronhub: userProviderKeys.electronhub || serverElectronHubKey,
      groq: userProviderKeys.groq || serverGroqKey,
      freemodel: userProviderKeys.freemodel || serverFreeModelKey
    };

    const models = [];

    async function fetchModels(url, headers) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const response = await fetchImpl(url, { headers, signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) return [];
        const data = await response.json();
        if (Array.isArray(data?.data)) return data.data.filter(m => m && typeof m.id === 'string');
        if (Array.isArray(data)) return data.filter(m => m && typeof m.id === 'string');
        return [];
      } catch {
        return [];
      }
    }

    if (effectiveApiKey) {
      const upstream = await fetchModels(
        `${upstreamBase}/models?available=true`,
        { Authorization: `Bearer ${effectiveApiKey}` }
      );
      models.push(...upstream);
    }

    if (effectiveKeys.openrouter) {
      const orModels = await fetchModels(
        `${openRouterUpstreamBase}/models`,
        { Authorization: `Bearer ${effectiveKeys.openrouter}`, 'X-OpenRouter-Title': 'iamhujju' }
      );
      models.push(...orModels.map(openRouterModel));
    }

    for (const p of ['electronhub', 'groq', 'freemodel']) {
      const key = effectiveKeys[p];
      if (!key) continue;
      const config = PROVIDERS[p];
      let pModels = await fetchModels(config.modelsUrl, {
        Authorization: `Bearer ${key}`,
        ...(config.headers || {})
      });
      if (!pModels || pModels.length === 0) {
        pModels = PROVIDER_FALLBACK_MODELS[p] || [];
      }
      models.push(...pModels.map(m => formatExternalModel(m, p)));
    }

    // Google AI Studio Models (Gemini Native)
    const geminiV1Key = await getGoogleAIStudioKey(accountStore);
    if (geminiV1Key) {
      const geminiV1Models = await getGeminiModelCatalog(geminiV1Key, fetchImpl);
      models.push(...geminiV1Models.map(m => ({
        id: m.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.owned_by,
        permission: [],
        root: m.id,
        parent: null
      })));
    }

    if (models.length === 0) {
      const defaultCatalog = [
        { id: 'openrouter:openrouter/free', name: 'OpenRouter Free (Auto)', owned_by: 'OpenRouter' },
        { id: 'openrouter:deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', owned_by: 'DeepSeek' },
        { id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct (Free)', owned_by: 'Meta' },
        { id: 'openrouter:google/gemini-2.5-flash:free', name: 'Google Gemini 2.5 Flash (Free)', owned_by: 'Google' },
        { id: 'openrouter:openai/gpt-4o-mini', name: 'GPT-4o Mini', owned_by: 'OpenAI' }
      ];
      models.push(...defaultCatalog.map(m => ({
        id: m.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.owned_by,
        permission: [],
        root: m.id,
        parent: null
      })));
    }

    const cleanModels = models.filter(m => {
      if (BROKEN_MODELS_BLACKLIST.has(m.id)) return false;
      if (typeof m.id === 'string' && m.id.endsWith(':batch')) return false;
      return true;
    });
    if (!apiKey && !cleanModels.some(m => m.id === HUZAIFA_OMNI_MODEL_ID)) {
      cleanModels.unshift(HUZAIFA_OMNI_MODEL_METADATA);
    }
    res.set('Cache-Control', 'no-store').json({ object: 'list', data: cleanModels });
  }

  app.get(['/v1/models', '/v1/models/'], modelsRateLimiter, handleV1Models);
  app.get(['/api/v1/models', '/api/v1/models/'], modelsRateLimiter, handleV1Models);

  // POST /v1/chat/completions and /api/v1/chat/completions — proxy to upstream
  async function handleV1ChatCompletions(req, res) {
    setGatewayCors(res);
    const user = await gatewayAuth(req, res);
    if (!user) return;

    const body = validatedBody(
      gatewayChatRequestSchema,
      req,
      res,
      'Request must include a model and 1-100 valid messages, including a user message.'
    );
    if (!body) return;

    const isHuzaifaOmni = body.model === HUZAIFA_OMNI_MODEL_ID ||
      body.model === 'huzaifa-kazi' ||
      body.model === 'omni' ||
      body.model === 'huzaifa-kazi-omni';

    if (isHuzaifaOmni) {
      return executeHuzaifaOmniChat({
        req,
        res,
        body,
        user,
        accountStore,
        keyPool,
        fetchImpl,
        timeoutMs,
        upstreamBase
      });
    }

    const modelTarget = resolveModelTarget(body.model, { keyPool });
    let { provider: targetProvider, sourceModel } = modelTarget;
    if (sourceModel && sourceModel.endsWith(':batch')) {
      sourceModel = sourceModel.slice(0, -':batch'.length);
    }

    const isGeminiModel = (typeof body.model === 'string' && (body.model.startsWith('gemini:') || body.model.startsWith('google-ai-studio:'))) ||
      body.model?.toLowerCase().includes('gemini-') && !body.model?.startsWith('openrouter') && !body.model?.startsWith('electronhub');

    if (isGeminiModel) {
      if (!verifyPaidGeminiAccess(user)) {
        return res.status(403).json({
          error: {
            message: 'Upgrade to a paid plan to unlock Google Gemini Pro, Image, Video & Autonomous Agent models.',
            code: 'paid_plan_required'
          }
        });
      }

      const geminiKey = await getGoogleAIStudioKey(accountStore);
      if (!geminiKey) {
        return res.status(503).json({
          error: {
            message: 'Google AI Studio integration is not configured. Please contact the administrator.',
            code: 'gemini_not_configured'
          }
        });
      }

      return streamGeminiChat({
        model: body.model,
        messages: body.messages,
        browse: Boolean(body.browse || body.webSearch),
        webSearch: Boolean(body.browse || body.webSearch),
        apiKey: geminiKey,
        fetchImpl,
        res
      });
    }

    let userPersonalKey = null;
    if (user) {
      if (targetProvider !== 'freellmapi') {
        userPersonalKey = await getProviderKeyForUser(user.id, targetProvider);
      } else if (typeof accountStore.getApiKey === 'function') {
        userPersonalKey = await accountStore.getApiKey(user.id);
      }
    }

    let requestApiKey = userPersonalKey;
    if (!requestApiKey) {
      if (targetProvider !== 'freellmapi') {
        requestApiKey = keyPool?.hasKeys(targetProvider) ? 'pool' : '';
      } else {
        requestApiKey = allowSharedGatewayKey ? (apiKey || (keyPool?.hasKeys('freellmapi') ? 'pool' : '')) : '';
      }
    }

    // Dynamic failover to fallback chain or OpenRouter if targetProvider has no keys
    if (!requestApiKey && Array.isArray(modelTarget.fallbackChain)) {
      for (const fb of modelTarget.fallbackChain) {
        const fbP = typeof fb === 'string' ? fb : fb.provider;
        const fbM = typeof fb === 'string' ? null : fb.model;
        let fbUserKey = null;
        if (user && fbP !== 'freellmapi') {
          fbUserKey = await getProviderKeyForUser(user.id, fbP);
        }
        if (fbUserKey || keyPool?.hasKeys(fbP)) {
          targetProvider = fbP;
          sourceModel = fbM || sourceModel;
          userPersonalKey = fbUserKey;
          requestApiKey = fbUserKey || 'pool';
          break;
        }
      }
    }

    if (!requestApiKey && keyPool?.hasKeys('openrouter')) {
      targetProvider = 'openrouter';
      sourceModel = sourceModel.includes('/') ? sourceModel : 'openrouter/free';
      requestApiKey = 'pool';
    }

    if (!requestApiKey) {
      const pName = PROVIDERS[targetProvider]?.name || targetProvider;
      return res.status(403).json({
        error: {
          message: targetProvider !== 'freellmapi'
            ? `No ${pName} key configured for this account.`
            : 'No upstream API key available.',
          type: 'invalid_request_error',
          code: 'no_upstream_key'
        }
      });
    }

    const isUserPro = Boolean(user && (user.tier !== 'free' || user.hasActiveSubscription || user.unlockedAllModels));
    const hasPersonalKey = Boolean(userPersonalKey);
    const isFreeTierUsingServerKey = !isUserPro && !hasPersonalKey;

    // Real-Time Web Search & Grounding Engine for Gateway
    const lastUserMessage = [...(body.messages || [])].reverse().find(m => m.role === 'user');
    const userQueryText = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : Array.isArray(lastUserMessage?.content)
      ? lastUserMessage.content.map(c => c.text || '').join(' ')
      : '';

    const needsLiveSearch = shouldTriggerLiveSearch(userQueryText, Boolean(body.browse || body.webSearch));
    let liveSources = [];
    let groundedBody = body;

    if (needsLiveSearch && userQueryText) {
      try {
        const searchResult = await browseWeb(userQueryText, { maxResults: 6 });
        liveSources = searchResult.sources || [];
        if (liveSources.length > 0) {
          const updatedMessages = [...(body.messages || [])];
          const sysIdx = updatedMessages.findIndex(m => m.role === 'system');
          if (sysIdx >= 0) {
            updatedMessages[sysIdx] = {
              ...updatedMessages[sysIdx],
              content: `${updatedMessages[sysIdx].content}\n\n${searchResult.formattedContext}`
            };
          } else {
            updatedMessages.unshift({
              role: 'system',
              content: searchResult.formattedContext
            });
          }
          groundedBody = {
            ...body,
            messages: updatedMessages
          };
        }
      } catch (err) {
        console.warn('[V1 LiveGrounding] Search failed:', err.message);
      }
    }

    const providerConfig = PROVIDERS[targetProvider];
    const providerName = providerConfig ? providerConfig.name : (targetProvider === 'openrouter' ? 'OpenRouter' : 'FreeLLMAPI');
    const chatEndpoint = providerConfig ? providerConfig.chatUrl : `${upstreamBase}/chat/completions`;
    const request = requestAbortSignal(req, res, timeoutMs);

    try {
      let activeRequestKey = requestApiKey;
      const upstream = await keyPool.executeWithFailover({
        providerId: targetProvider,
        userKey: userPersonalKey,
        fallbackChain: modelTarget.fallbackChain,
        requestFn: async (activeKey, currentProvider, currentModel) => {
          activeRequestKey = activeKey;
          const curConfig = (currentProvider && PROVIDERS[currentProvider]) || providerConfig;
          const curEndpoint = curConfig ? curConfig.chatUrl : `${upstreamBase}/chat/completions`;
          const curModel = currentModel || sourceModel;
          const curBody = sanitizePayloadForModel(currentProvider || targetProvider, curModel, groundedBody, { isFreeTierUsingServerKey });

          return await fetchImpl(
            curEndpoint,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${activeKey}`,
                'Content-Type': 'application/json',
                ...((currentProvider || targetProvider) === 'openrouter' ? {
                  'HTTP-Referer': 'https://iamhujju.com',
                  'X-Title': 'iamhujju',
                  'X-OpenRouter-Title': 'iamhujju'
                } : {}),
                ...(curConfig?.headers || {})
              },
              body: JSON.stringify(curBody),
              signal: request.controller.signal
            }
          );
        },
        maxRetries: 3
      });

      if (!upstream.ok) {
        const errorBody = await upstream.text();
        return res.status(upstream.status).json({
          error: { message: safeUpstreamMessage(errorBody, upstream.status, requestApiKey, providerName) }
        });
      }

      if (!upstream.body) {
        return res.status(502).json({ error: { message: `${providerName} returned an empty response.` } });
      }

      if (!body.stream) {
        const responseText = await upstream.text();
        let completionJson;
        try {
          completionJson = JSON.parse(responseText);
        } catch {
          completionJson = null;
        }

        if (completionJson) {
          const promptEst = estimateTokens(body.messages);
          const completionEst = estimateTokens(completionJson.choices?.[0]?.message?.content);
          completionJson.usage = {
            prompt_tokens: Number(completionJson.usage?.prompt_tokens) || promptEst,
            completion_tokens: Number(completionJson.usage?.completion_tokens) || completionEst,
            total_tokens: Number(completionJson.usage?.total_tokens) || (promptEst + completionEst)
          };

          if (user.activeKeyId && typeof accountStore.recordApiKeyTokens === 'function') {
            await accountStore.recordApiKeyTokens(user.activeKeyId, completionJson.usage.total_tokens);
          }

          if (liveSources.length > 0) {
            completionJson.sources = liveSources;
          }

          res.status(upstream.status);
          res.setHeader('Content-Type', 'application/json');
          return res.json(completionJson);
        }
      }

      if (user.activeKeyId && typeof accountStore.recordApiKeyTokens === 'function') {
        const promptEst = estimateTokens(body.messages);
        await accountStore.recordApiKeyTokens(user.activeKeyId, promptEst);
      }

      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');

      if (liveSources.length > 0) {
        res.write(`data: ${JSON.stringify({ status: `Verified ${liveSources.length} live web & news sources` })}\n\n`);
        res.write(`data: ${JSON.stringify({ sources: liveSources })}\n\n`);
      }

      await pipeline(Readable.fromWeb(upstream.body), res);
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
  }

  app.post(['/v1/chat/completions', '/v1/chat/completions/'], chatRateLimiter, handleV1ChatCompletions);
  app.post(['/api/v1/chat/completions', '/api/v1/chat/completions/'], chatRateLimiter, handleV1ChatCompletions);

  // ── Multimodal Endpoints: Image & Video Generation ────────────────────────

  // CORS preflight for multimodal endpoints
  app.options([
    '/v1/images/generations', '/v1/images/generations/{*splat}',
    '/api/generate/image', '/api/generate/image/{*splat}',
    '/v1/videos/generations', '/v1/videos/generations/{*splat}',
    '/api/generate/video', '/api/generate/video/{*splat}',
    '/api/generate/video/:taskId'
  ], (req, res) => {
    setGatewayCors(res);
    res.status(204).end();
  });

  // Image Generation Handler
  async function handleImageGeneration(req, res) {
    setGatewayCors(res);
    const authHeader = req.headers.authorization || '';
    let user = null;
    if (authHeader.startsWith('Bearer sk-hujju-')) {
      user = await gatewayAuth(req, res);
      if (!user) return;
    } else {
      user = await getCurrentUser(req);
    }

    const { prompt, model = 'flux-schnell', size = '1024x1024', aspect_ratio = '1:1', n = 1, response_format = 'url' } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: { message: 'A prompt is required for image generation.' } });
    }

    const isGeminiImage = model?.startsWith('gemini:') ||
      model?.toLowerCase().includes('imagen') ||
      (model?.toLowerCase().includes('google') && !model?.startsWith('openrouter'));

    if (isGeminiImage) {
      if (!verifyPaidGeminiAccess(user)) {
        return res.status(403).json({
          error: {
            message: 'Upgrade to a paid plan to unlock Google Gemini Pro, Image, Video & Autonomous Agent models.',
            code: 'paid_plan_required'
          }
        });
      }
      const geminiKey = await getGoogleAIStudioKey(accountStore);
      if (!geminiKey) {
        return res.status(503).json({
          error: {
            message: 'Google AI Studio integration is not configured. Please contact the administrator.',
            code: 'gemini_not_configured'
          }
        });
      }
      const result = await generateGeminiImage({
        prompt: prompt.trim(),
        model,
        aspectRatio: aspect_ratio,
        n,
        apiKey: geminiKey,
        fetchImpl
      });
      return res.json(result);
    }

    try {
      const activeEhKey = (user && await getProviderKeyForUser(user.id, 'electronhub')) || serverElectronHubKey || (keyPool?.hasKeys('electronhub') ? keyPool.pools.get('electronhub')?.[0]?.key : null);
      const activeOrKey = (user && await getProviderKeyForUser(user.id, 'openrouter')) || serverOpenRouterKey || (keyPool?.hasKeys('openrouter') ? keyPool.pools.get('openrouter')?.[0]?.key : null);

      const result = await generateImageResult({
        prompt: prompt.trim(),
        model,
        size,
        aspect_ratio,
        n,
        response_format,
        activeKey: activeEhKey || activeOrKey,
        providerBase: activeEhKey ? PROVIDERS.electronhub.base : (activeOrKey ? PROVIDERS.openrouter.base : null)
      });

      return res.json(result);
    } catch (err) {
      console.error('Image generation error:', err);
      return res.status(500).json({ error: { message: 'Image generation failed: ' + err.message } });
    }
  }

  app.post(['/v1/images/generations', '/v1/images/generations/'], handleImageGeneration);
  app.post(['/api/generate/image', '/api/generate/image/'], handleImageGeneration);

  // Video Generation Creation Handler
  async function handleCreateVideo(req, res) {
    setGatewayCors(res);
    const authHeader = req.headers.authorization || '';
    let user = null;
    if (authHeader.startsWith('Bearer sk-hujju-')) {
      user = await gatewayAuth(req, res);
      if (!user) return;
    } else {
      user = await getCurrentUser(req);
    }

    const { prompt, model = 'kling-video-v1', duration = 5, aspect_ratio = '16:9' } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: { message: 'A prompt is required for video generation.' } });
    }

    const isGeminiVideo = model?.startsWith('gemini:') ||
      model?.toLowerCase().includes('veo') ||
      (model?.toLowerCase().includes('google') && !model?.startsWith('openrouter'));

    if (isGeminiVideo) {
      if (!verifyPaidGeminiAccess(user)) {
        return res.status(403).json({
          error: {
            message: 'Upgrade to a paid plan to unlock Google Gemini Pro, Image, Video & Autonomous Agent models.',
            code: 'paid_plan_required'
          }
        });
      }
      const geminiKey = await getGoogleAIStudioKey(accountStore);
      if (!geminiKey) {
        return res.status(503).json({
          error: {
            message: 'Google AI Studio integration is not configured. Please contact the administrator.',
            code: 'gemini_not_configured'
          }
        });
      }
      const task = await createGeminiVideoTask({
        prompt: prompt.trim(),
        model,
        duration,
        aspectRatio: aspect_ratio,
        apiKey: geminiKey,
        fetchImpl
      });
      return res.status(202).json({
        id: task.id,
        status: task.status,
        progress: task.progress,
        prompt: task.prompt,
        model: task.model,
        created: Math.floor(Date.now() / 1000),
        poll_url: `/api/generate/video/${task.id}`
      });
    }

    try {
      const task = createVideoTaskRecord({
        prompt: prompt.trim(),
        model,
        duration,
        aspect_ratio
      });

      return res.status(202).json({
        id: task.id,
        status: task.status,
        progress: task.progress,
        prompt: task.prompt,
        model: task.model,
        created: Math.floor(Date.now() / 1000),
        poll_url: `/api/generate/video/${task.id}`
      });
    } catch (err) {
      console.error('Video generation error:', err);
      return res.status(500).json({ error: { message: 'Video generation failed: ' + err.message } });
    }
  }

  app.post(['/v1/videos/generations', '/v1/videos/generations/'], handleCreateVideo);
  app.post(['/api/generate/video', '/api/generate/video/'], handleCreateVideo);

  // Video Generation Status Polling Handler
  function handlePollVideoStatus(req, res) {
    setGatewayCors(res);
    const taskId = req.params.taskId;
    if (!taskId) {
      return res.status(400).json({ error: { message: 'taskId parameter is required.' } });
    }

    if (typeof taskId === 'string' && taskId.startsWith('veo_')) {
      const veoStatus = pollGeminiVideoTask(taskId);
      if (veoStatus) return res.json(veoStatus);
    }

    const taskStatus = getVideoTaskStatus(taskId);
    if (!taskStatus) {
      return res.status(404).json({ error: { message: 'Video generation task not found or expired.' } });
    }

    return res.json(taskStatus);
  }

  app.get(['/api/generate/video/:taskId', '/v1/videos/generations/:taskId'], handlePollVideoStatus);

  // Catch-all for API & Gateway paths that did not match any endpoint: return JSON 404, NEVER HTML
  app.all(['/v1', '/v1/{*splat}', '/api/v1', '/api/v1/{*splat}'], (req, res) => {
    setGatewayCors(res);
    res.status(404).json({
      error: {
        message: `Route not found: ${req.method} ${req.path}. Available endpoints: GET /v1/models, POST /v1/chat/completions, POST /v1/images/generations, POST /v1/videos/generations`,
        type: 'invalid_request_error',
        code: 'route_not_found'
      }
    });
  });

  app.all(['/api', '/api/{*splat}'], (req, res) => {
    res.status(404).json({
      error: { message: `API endpoint not found: ${req.method} ${req.path}` }
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
    if (
      req.path === "/api" ||
      req.path.startsWith("/api/") ||
      req.path === "/v1" ||
      req.path.startsWith("/v1/")
    ) {
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
