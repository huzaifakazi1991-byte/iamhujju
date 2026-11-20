// services/aiGateway.js — Upstream AI Provider Adapter, Schema Normalization, Dynamic Model Discovery & Live Sync
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEFAULT_OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const DEFAULT_GROQ_BASE = 'https://api.groq.com/openai/v1';
export const DEFAULT_GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
export const DEFAULT_ELECTRONHUB_BASE = 'https://api.electronhub.ai/v1';
export const DEFAULT_FREEMODEL_BASE = 'https://freemodel.in/v1';
export const DEFAULT_MISTRAL_BASE = 'https://api.mistral.ai/v1';
export const DEFAULT_TOGETHER_BASE = 'https://api.together.xyz/v1';
export const DEFAULT_CEREBRAS_BASE = 'https://api.cerebras.ai/v1';
export const DEFAULT_SAMBANOVA_BASE = 'https://api.sambanova.ai/v1';
export const DEFAULT_COHERE_BASE = 'https://api.cohere.com/v2';
export const DEFAULT_HUGGINGFACE_BASE = 'https://api-inference.huggingface.co/v1';
export const DEFAULT_FREELLMAPI_BASE = 'http://127.0.0.1:31415/v1';

export const PROVIDERS = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    base: DEFAULT_OPENROUTER_BASE,
    modelsUrl: `${DEFAULT_OPENROUTER_BASE}/models`,
    chatUrl: `${DEFAULT_OPENROUTER_BASE}/chat/completions`,
    portalUrl: 'https://openrouter.ai',
    requiresTerms: true,
    headers: {
      'HTTP-Referer': 'https://iamhujju.com',
      'X-Title': 'iamhujju',
      'X-OpenRouter-Title': 'iamhujju'
    }
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud',
    base: DEFAULT_GROQ_BASE,
    modelsUrl: `${DEFAULT_GROQ_BASE}/models`,
    chatUrl: `${DEFAULT_GROQ_BASE}/chat/completions`,
    portalUrl: 'https://console.groq.com',
    requiresTerms: false,
    headers: {}
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    base: DEFAULT_GEMINI_BASE,
    modelsUrl: `${DEFAULT_GEMINI_BASE}/models`,
    chatUrl: `${DEFAULT_GEMINI_BASE}/chat/completions`,
    portalUrl: 'https://aistudio.google.com',
    requiresTerms: false,
    headers: {}
  },
  electronhub: {
    id: 'electronhub',
    name: 'ElectronHub AI',
    base: DEFAULT_ELECTRONHUB_BASE,
    modelsUrl: `${DEFAULT_ELECTRONHUB_BASE}/models`,
    chatUrl: `${DEFAULT_ELECTRONHUB_BASE}/chat/completions`,
    portalUrl: 'https://app.electronhub.ai',
    requiresTerms: false,
    headers: {}
  },
  freemodel: {
    id: 'freemodel',
    name: 'FreeModel.in',
    base: DEFAULT_FREEMODEL_BASE,
    modelsUrl: `${DEFAULT_FREEMODEL_BASE}/models`,
    chatUrl: `${DEFAULT_FREEMODEL_BASE}/chat/completions`,
    portalUrl: 'https://freemodel.in',
    requiresTerms: false,
    headers: {}
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    base: DEFAULT_MISTRAL_BASE,
    modelsUrl: `${DEFAULT_MISTRAL_BASE}/models`,
    chatUrl: `${DEFAULT_MISTRAL_BASE}/chat/completions`,
    portalUrl: 'https://console.mistral.ai',
    requiresTerms: false,
    headers: {}
  },
  together: {
    id: 'together',
    name: 'Together AI',
    base: DEFAULT_TOGETHER_BASE,
    modelsUrl: `${DEFAULT_TOGETHER_BASE}/models`,
    chatUrl: `${DEFAULT_TOGETHER_BASE}/chat/completions`,
    portalUrl: 'https://api.together.ai',
    requiresTerms: false,
    headers: {}
  },
  cerebras: {
    id: 'cerebras',
    name: 'Cerebras Inference',
    base: DEFAULT_CEREBRAS_BASE,
    modelsUrl: `${DEFAULT_CEREBRAS_BASE}/models`,
    chatUrl: `${DEFAULT_CEREBRAS_BASE}/chat/completions`,
    portalUrl: 'https://cloud.cerebras.ai',
    requiresTerms: false,
    headers: {}
  },
  sambanova: {
    id: 'sambanova',
    name: 'SambaNova Systems',
    base: DEFAULT_SAMBANOVA_BASE,
    modelsUrl: `${DEFAULT_SAMBANOVA_BASE}/models`,
    chatUrl: `${DEFAULT_SAMBANOVA_BASE}/chat/completions`,
    portalUrl: 'https://cloud.sambanova.ai',
    requiresTerms: false,
    headers: {}
  },
  huggingface: {
    id: 'huggingface',
    name: 'Hugging Face Inference',
    base: DEFAULT_HUGGINGFACE_BASE,
    modelsUrl: `${DEFAULT_HUGGINGFACE_BASE}/models`,
    chatUrl: `${DEFAULT_HUGGINGFACE_BASE}/chat/completions`,
    portalUrl: 'https://huggingface.co',
    requiresTerms: false,
    headers: {}
  },
  freellmapi: {
    id: 'freellmapi',
    name: 'FreeLLMAPI Gateway',
    base: DEFAULT_FREELLMAPI_BASE,
    modelsUrl: `${DEFAULT_FREELLMAPI_BASE}/models?available=true`,
    chatUrl: `${DEFAULT_FREELLMAPI_BASE}/chat/completions`,
    portalUrl: 'http://127.0.0.1:31415',
    requiresTerms: false,
    headers: {}
  }
};

export const PROVIDER_FALLBACK_MODELS = {
  electronhub: [
    { id: 'gpt-4o', name: 'GPT-4o (Omni)', owned_by: 'OpenAI', context_window: 128000 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', owned_by: 'OpenAI', context_window: 128000 },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', owned_by: 'Anthropic', context_window: 200000 },
    { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', owned_by: 'Anthropic', context_window: 200000 },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', owned_by: 'Google', context_window: 1048576 },
    { id: 'deepseek-r1', name: 'DeepSeek R1', owned_by: 'DeepSeek', context_window: 64000 }
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', owned_by: 'Meta', context_window: 128000 },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', owned_by: 'Meta', context_window: 128000 },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B', owned_by: 'DeepSeek', context_window: 128000 },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT', owned_by: 'Google', context_window: 8192 },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B 32k', owned_by: 'Mistral', context_window: 32768 }
  ],
  freemodel: [
    { id: 'claude-opus-4.8', name: 'Claude Opus 4.8', owned_by: 'Anthropic', context_window: 200000 },
    { id: 'gpt-4o', name: 'GPT-4o Developer', owned_by: 'OpenAI', context_window: 128000 },
    { id: 'deepseek-v3', name: 'DeepSeek V3', owned_by: 'DeepSeek', context_window: 64000 },
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B Free', owned_by: 'Meta', context_window: 128000 }
  ],
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', owned_by: 'Google', context_window: 1048576 },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', owned_by: 'Google', context_window: 1048576 },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', owned_by: 'Google', context_window: 1048576 }
  ],
  mistral: [
    { id: 'mistral-large-latest', name: 'Mistral Large Latest', owned_by: 'Mistral', context_window: 128000 },
    { id: 'mistral-small-latest', name: 'Mistral Small Latest', owned_by: 'Mistral', context_window: 32768 },
    { id: 'codestral-latest', name: 'Codestral Latest', owned_by: 'Mistral', context_window: 32768 }
  ],
  together: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', owned_by: 'Meta', context_window: 128000 },
    { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1 Together', owned_by: 'DeepSeek', context_window: 64000 }
  ]
};

// Compute 2-3 fallback models across providers for seamless zero-downtime retry
export function computeFallbackChain(provider, modelId) {
  const norm = (modelId || '').toLowerCase();
  const chain = [];

  // 1. Llama 3.3 / Llama family
  if (norm.includes('llama-3.3') || norm.includes('llama-3.1') || norm.includes('llama-70b')) {
    if (provider !== 'groq') chain.push({ provider: 'groq', model: 'llama-3.3-70b-versatile' });
    if (provider !== 'openrouter') chain.push({ provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' });
    if (provider !== 'freemodel') chain.push({ provider: 'freemodel', model: 'llama-3.3-70b' });
  }
  // 2. DeepSeek R1 / Reasoning models
  else if (norm.includes('r1') || norm.includes('reasoner') || norm.includes('deepseek')) {
    if (provider !== 'openrouter') chain.push({ provider: 'openrouter', model: 'deepseek/deepseek-r1:free' });
    if (provider !== 'groq') chain.push({ provider: 'groq', model: 'deepseek-r1-distill-llama-70b' });
    if (provider !== 'electronhub') chain.push({ provider: 'electronhub', model: 'deepseek-r1' });
    if (provider !== 'freemodel') chain.push({ provider: 'freemodel', model: 'deepseek-v3' });
  }
  // 3. GPT-4o / GPT-4o Mini
  else if (norm.includes('gpt-4o') || norm.includes('openai')) {
    if (provider !== 'electronhub') chain.push({ provider: 'electronhub', model: 'gpt-4o-mini' });
    if (provider !== 'freemodel') chain.push({ provider: 'freemodel', model: 'gpt-4o' });
    if (provider !== 'openrouter') chain.push({ provider: 'openrouter', model: 'openai/gpt-4o-mini' });
  }
  // 4. Gemini models
  else if (norm.includes('gemini')) {
    if (provider !== 'gemini') chain.push({ provider: 'gemini', model: 'gemini-2.5-flash' });
    if (provider !== 'openrouter') chain.push({ provider: 'openrouter', model: 'google/gemini-2.5-flash:free' });
    if (provider !== 'electronhub') chain.push({ provider: 'electronhub', model: 'gemini-2.0-flash' });
  }
  // 5. Claude models
  else if (norm.includes('claude') || norm.includes('anthropic')) {
    if (provider !== 'electronhub') chain.push({ provider: 'electronhub', model: 'claude-3-5-haiku' });
    if (provider !== 'freemodel') chain.push({ provider: 'freemodel', model: 'claude-opus-4.8' });
  }
  // 6. Generic resilient fallback
  else {
    if (provider !== 'openrouter') chain.push({ provider: 'openrouter', model: 'openrouter/free' });
    if (provider !== 'groq') chain.push({ provider: 'groq', model: 'llama-3.3-70b-versatile' });
    if (provider !== 'electronhub') chain.push({ provider: 'electronhub', model: 'gpt-4o-mini' });
  }

  return chain.slice(0, 3);
}

// Model Target Resolver
export function resolveModelTarget(modelName) {
  if (typeof modelName !== 'string') {
    return { provider: 'freellmapi', sourceModel: '', fallbackChain: [] };
  }

  for (const p of Object.keys(PROVIDERS)) {
    if (modelName.startsWith(`${p}:`)) {
      const sourceModel = modelName.slice(`${p}:`.length);
      return { provider: p, sourceModel, fallbackChain: computeFallbackChain(p, sourceModel) };
    }
    if (modelName.startsWith(`${p}/`)) {
      const sourceModel = modelName.slice(`${p}/`.length);
      return { provider: p, sourceModel, fallbackChain: computeFallbackChain(p, sourceModel) };
    }
  }

  // Handle direct clean slugs
  const norm = modelName.toLowerCase();
  if (norm === 'llama-3.3-70b' || norm === 'llama-3.3-70b-versatile') {
    return { provider: 'groq', sourceModel: 'llama-3.3-70b-versatile', fallbackChain: computeFallbackChain('groq', 'llama-3.3-70b-versatile') };
  }
  if (norm === 'deepseek-r1') {
    return { provider: 'openrouter', sourceModel: 'deepseek/deepseek-r1:free', fallbackChain: computeFallbackChain('openrouter', 'deepseek/deepseek-r1:free') };
  }
  if (norm === 'gemini-2.5-flash' || norm === 'gemini-2.0-flash') {
    return { provider: 'gemini', sourceModel: norm, fallbackChain: computeFallbackChain('gemini', norm) };
  }
  if (norm === 'gpt-4o-mini') {
    return { provider: 'electronhub', sourceModel: 'gpt-4o-mini', fallbackChain: computeFallbackChain('electronhub', 'gpt-4o-mini') };
  }

  return {
    provider: 'freellmapi',
    sourceModel: modelName,
    fallbackChain: computeFallbackChain('freellmapi', modelName)
  };
}

// Parameter Sanitization & Protocol Adapter Layer
export function sanitizePayloadForModel(provider, modelId, body, options = {}) {
  const norm = (modelId || '').toLowerCase();
  const sanitized = { ...body, model: modelId };

  // 1. System Role Translation for Reasoning Models that reject 'system' prompt
  const isReasoningModel = norm.includes('r1') ||
    norm.includes('reasoner') ||
    norm.startsWith('o1') ||
    norm.startsWith('o3') ||
    norm.includes('gemma');

  if (isReasoningModel && Array.isArray(sanitized.messages)) {
    const systemMsgs = sanitized.messages.filter(m => m.role === 'system');
    if (systemMsgs.length > 0) {
      const systemContext = systemMsgs.map(m => m.content).join('\n\n');
      const nonSystemMsgs = sanitized.messages.filter(m => m.role !== 'system');

      // Prepend system instructions context to the first user message
      let prepended = false;
      const adaptedMessages = nonSystemMsgs.map(m => {
        if (!prepended && m.role === 'user') {
          prepended = true;
          return {
            ...m,
            content: `[System Instructions: ${systemContext}]\n\n${m.content}`
          };
        }
        return m;
      });

      if (!prepended) {
        adaptedMessages.unshift({
          role: 'user',
          content: `[System Instructions]\n${systemContext}`
        });
      }

      sanitized.messages = adaptedMessages;
    }
  }

  // 2. max_tokens vs max_completion_tokens for OpenAI reasoning models
  if (norm.startsWith('o1') || norm.startsWith('o3')) {
    if (sanitized.max_tokens !== undefined) {
      sanitized.max_completion_tokens = sanitized.max_tokens;
      delete sanitized.max_tokens;
    }
    // o1/o3 reject temperature values other than 1
    delete sanitized.temperature;
  } else if (sanitized.max_tokens !== undefined) {
    sanitized.max_tokens = Math.max(1, Number(sanitized.max_tokens) || 2048);
  }

  // 3. Free tier on OpenRouter server key token bounding
  if (provider === 'openrouter' && options.isFreeTierUsingServerKey) {
    sanitized.max_tokens = Math.min(sanitized.max_tokens || 2048, 2048);
  }

  // 4. Strip unsupported empty tools and tool_choice
  if (!Array.isArray(sanitized.tools) || sanitized.tools.length === 0) {
    delete sanitized.tools;
    delete sanitized.tool_choice;
  }

  return sanitized;
}

// Brand Slug Extractor
export function getBrandFromId(modelId = '') {
  const norm = modelId.toLowerCase();
  if (norm.includes('gpt') || norm.includes('openai') || norm.includes('o1') || norm.includes('o3')) return 'OpenAI';
  if (norm.includes('claude') || norm.includes('anthropic')) return 'Anthropic';
  if (norm.includes('gemini') || norm.includes('gemma') || norm.includes('google')) return 'Google';
  if (norm.includes('deepseek')) return 'DeepSeek';
  if (norm.includes('llama') || norm.includes('meta')) return 'Meta';
  if (norm.includes('mistral') || norm.includes('mixtral') || norm.includes('codestral')) return 'Mistral';
  if (norm.includes('qwen') || norm.includes('alibaba')) return 'Alibaba';
  return 'Independent';
}

// Live Dynamic Model Sync Service
export function createModelSyncService({ db = null, keyPool, fetchImpl = fetch }) {
  let cachedCatalog = [];
  let syncTimer = null;
  let lastSyncedAt = null;

  async function syncProviderModels() {
    const allModels = [];
    console.log('[ModelSync] Starting live background sync of upstream provider models...');

    for (const [providerId, config] of Object.entries(PROVIDERS)) {
      if (providerId === 'freellmapi') continue; // Handled dynamically

      const candidates = keyPool.getKeyCandidates(providerId);
      const activeKey = candidates.find(c => Date.now() >= c.cooldownUntil)?.key;

      if (!activeKey) {
        // Use standard high-reliability fallback models if no active key configured
        const fallbackList = PROVIDER_FALLBACK_MODELS[providerId] || [];
        for (const m of fallbackList) {
          allModels.push({
            id: `${providerId}:${m.id}`,
            name: m.name,
            provider: providerId,
            upstreamModelId: m.id,
            context_window: m.context_window || 8192,
            isFree: true,
            tier: 'free',
            fallbackChain: computeFallbackChain(providerId, m.id),
            owned_by: m.owned_by || getBrandFromId(m.id)
          });
        }
        continue;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const res = await fetchImpl(config.modelsUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${activeKey}`,
            'Content-Type': 'application/json',
            ...(config.headers || {})
          },
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!res.ok) {
          console.warn(`[ModelSync] Provider '${providerId}' /models returned HTTP ${res.status}. Using fallback definitions.`);
          const fallbackList = PROVIDER_FALLBACK_MODELS[providerId] || [];
          for (const m of fallbackList) {
            allModels.push({
              id: `${providerId}:${m.id}`,
              name: m.name,
              provider: providerId,
              upstreamModelId: m.id,
              context_window: m.context_window || 8192,
              isFree: true,
              tier: 'free',
              fallbackChain: computeFallbackChain(providerId, m.id),
              owned_by: m.owned_by || getBrandFromId(m.id)
            });
          }
          continue;
        }

        const data = await res.json();
        const rawList = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);

        for (const item of rawList) {
          const rawId = item.id || item.name;
          if (!rawId) continue;
          const isFree = Boolean(
            rawId.endsWith(':free') ||
            rawId.includes('/free') ||
            item.pricing?.prompt === 0 ||
            item.is_free === true
          );

          allModels.push({
            id: `${providerId}:${rawId}`,
            name: item.name || rawId,
            provider: providerId,
            upstreamModelId: rawId,
            context_window: item.context_length || item.context_window || 8192,
            isFree,
            tier: isFree ? 'free' : 'pro',
            fallbackChain: computeFallbackChain(providerId, rawId),
            owned_by: item.owned_by || getBrandFromId(rawId)
          });
        }

        console.log(`[ModelSync] Discovered ${rawList.length} models from '${providerId}'.`);
      } catch (err) {
        console.warn(`[ModelSync] Failed to fetch live models from '${providerId}': ${err.message}. Using fallback definitions.`);
        const fallbackList = PROVIDER_FALLBACK_MODELS[providerId] || [];
        for (const m of fallbackList) {
          allModels.push({
            id: `${providerId}:${m.id}`,
            name: m.name,
            provider: providerId,
            upstreamModelId: m.id,
            context_window: m.context_window || 8192,
            isFree: true,
            tier: 'free',
            fallbackChain: computeFallbackChain(providerId, m.id),
            owned_by: m.owned_by || getBrandFromId(m.id)
          });
        }
      }
    }

    // Default primary models if list is empty
    if (allModels.length === 0) {
      allModels.push(
        { id: 'openrouter:openrouter/free', name: 'OpenRouter Free Universal', provider: 'openrouter', upstreamModelId: 'openrouter/free', context_window: 128000, isFree: true, tier: 'free', fallbackChain: computeFallbackChain('openrouter', 'openrouter/free'), owned_by: 'OpenRouter' },
        { id: 'groq:llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', provider: 'groq', upstreamModelId: 'llama-3.3-70b-versatile', context_window: 128000, isFree: true, tier: 'free', fallbackChain: computeFallbackChain('groq', 'llama-3.3-70b-versatile'), owned_by: 'Meta' }
      );
    }

    cachedCatalog = allModels;
    lastSyncedAt = new Date().toISOString();

    // Persist to DB cache if DB connection provided
    if (db && typeof db.query === 'function') {
      try {
        for (const m of cachedCatalog.slice(0, 100)) { // Cache top 100 in DB
          await db.query(
            `INSERT INTO cached_provider_models (id, name, provider, upstream_model_id, context_window, is_free, tier, fallback_chain, owned_by, last_synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               context_window = EXCLUDED.context_window,
               is_free = EXCLUDED.is_free,
               tier = EXCLUDED.tier,
               fallback_chain = EXCLUDED.fallback_chain,
               owned_by = EXCLUDED.owned_by,
               last_synced_at = NOW()`,
            [m.id, m.name, m.provider, m.upstreamModelId, m.context_window, m.isFree, m.tier, JSON.stringify(m.fallbackChain), m.owned_by]
          ).catch(() => {});
        }
      } catch (e) {
        // DB cache is non-blocking
      }
    }

    return cachedCatalog;
  }

  function startPeriodicSync(intervalMs = 6 * 60 * 60 * 1000) {
    // Initial sync
    syncProviderModels().catch(err => console.error('[ModelSync] Initial sync error:', err));
    // Every 6 hours
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      syncProviderModels().catch(err => console.error('[ModelSync] Periodic sync error:', err));
    }, intervalMs);
    if (syncTimer.unref) syncTimer.unref();
  }

  function stopPeriodicSync() {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  }

  function getCatalog() {
    return {
      models: cachedCatalog,
      count: cachedCatalog.length,
      lastSyncedAt
    };
  }

  return {
    syncProviderModels,
    startPeriodicSync,
    stopPeriodicSync,
    getCatalog
  };
}

// Deep Admin Diagnostics Runner (GET /api/admin/health/providers)
export async function runAdminProviderDiagnostics({ keyPool, fetchImpl = fetch }) {
  const results = {};
  let overallHealthy = true;

  for (const [providerId, config] of Object.entries(PROVIDERS)) {
    if (providerId === 'freellmapi') continue;

    const candidates = keyPool.getKeyCandidates(providerId);
    const health = keyPool.getPoolHealth()[providerId] || { totalKeys: 0, healthyKeys: 0, inCooldown: 0, state: 'unconfigured' };

    if (candidates.length === 0) {
      results[providerId] = {
        name: config.name,
        state: 'unconfigured',
        latencyMs: 0,
        httpStatus: null,
        totalKeys: 0,
        healthyKeys: 0,
        inCooldown: 0,
        message: 'No keys configured in .env or key vault'
      };
      continue;
    }

    const testKey = candidates[0].key;
    const testModel = providerId === 'openrouter' ? 'openrouter/free'
      : providerId === 'groq' ? 'llama-3.1-8b-instant'
      : providerId === 'gemini' ? 'gemini-2.0-flash'
      : providerId === 'electronhub' ? 'gpt-4o-mini'
      : providerId === 'freemodel' ? 'llama-3.3-70b'
      : providerId === 'mistral' ? 'mistral-small-latest'
      : 'auto';

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetchImpl(config.chatUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testKey}`,
          'Content-Type': 'application/json',
          ...(config.headers || {})
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - startTime;
      const isOk = res.status === 200;

      if (!isOk) overallHealthy = false;

      results[providerId] = {
        name: config.name,
        state: isOk ? 'operational' : 'degraded',
        latencyMs,
        httpStatus: res.status,
        totalKeys: health.totalKeys,
        healthyKeys: health.healthyKeys,
        inCooldown: health.inCooldown,
        testModel,
        statusOk: isOk
      };
    } catch (err) {
      overallHealthy = false;
      results[providerId] = {
        name: config.name,
        state: 'error',
        latencyMs: Date.now() - startTime,
        httpStatus: 500,
        totalKeys: health.totalKeys,
        healthyKeys: health.healthyKeys,
        inCooldown: health.inCooldown,
        testModel,
        error: err.message
      };
    }
  }

  return {
    status: overallHealthy ? 'operational' : 'degraded',
    timestamp: new Date().toISOString(),
    providers: results
  };
}
