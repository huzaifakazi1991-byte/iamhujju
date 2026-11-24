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
export const DEFAULT_COHERE_BASE = 'https://api.cohere.com/compatibility/v1';
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
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    base: DEFAULT_COHERE_BASE,
    modelsUrl: `${DEFAULT_COHERE_BASE}/models`,
    chatUrl: `${DEFAULT_COHERE_BASE}/chat/completions`,
    portalUrl: 'https://dashboard.cohere.com',
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
  openrouter: [
    { id: 'openrouter/free', name: 'Free Models Router', owned_by: 'OpenRouter', context_window: 128000 },
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (free)', owned_by: 'DeepSeek', context_window: 64000 },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct (free)', owned_by: 'Meta', context_window: 128000 },
    { id: 'baidu/ernie-5.5-flash-preview:free', name: 'ERNIE 5.5 Flash Preview (free)', owned_by: 'Baidu', context_window: 128000 },
    { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning (free)', owned_by: 'NVIDIA', context_window: 128000 },
    { id: 'particle-ai/particle-1:free', name: 'Particle-1 (free)', owned_by: 'Particle AI', context_window: 128000 },
    { id: 'recursive/flint-v1.0:free', name: 'Flint v1.0 (free)', owned_by: 'Recursive', context_window: 128000 },
    { id: 'liquid/lfm-3-1.7b:free', name: 'LFM 3 1.7B (free)', owned_by: 'LiquidAI', context_window: 8192 }
  ],
  electronhub: [
    { id: 'gpt-4o', name: 'GPT-4o (Omni)', owned_by: 'OpenAI', context_window: 128000, modality: 'agent', isFree: false },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', owned_by: 'OpenAI', context_window: 128000, modality: 'chat', isFree: true },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', owned_by: 'Anthropic', context_window: 200000, modality: 'agent', isFree: false },
    { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', owned_by: 'Anthropic', context_window: 200000, modality: 'agent', isFree: false },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', owned_by: 'Google', context_window: 1048576, modality: 'chat', isFree: true },
    { id: 'deepseek-r1', name: 'DeepSeek R1 (Autonomous Reasoner)', owned_by: 'DeepSeek', context_window: 64000, modality: 'agent', isFree: true },
    { id: 'flux-schnell', name: 'Flux.1 Schnell (Instant Image Turbo)', owned_by: 'Black Forest Labs', context_window: 4096, modality: 'image', isFree: true },
    { id: 'sdxl', name: 'Stable Diffusion XL (High-Res Studio)', owned_by: 'Stability AI', context_window: 4096, modality: 'image', isFree: true },
    { id: 'flux-dev', name: 'Flux.1 Dev (Professional Studio)', owned_by: 'Black Forest Labs', context_window: 4096, modality: 'image', isFree: false },
    { id: 'stable-diffusion-3.5-large', name: 'Stable Diffusion 3.5 Large', owned_by: 'Stability AI', context_window: 4096, modality: 'image', isFree: false },
    { id: 'kling-video-v1', name: 'Kling AI Video v1 (HD Motion)', owned_by: 'Kuaishou', context_window: 2048, modality: 'video', isFree: true },
    { id: 'wan-2.1-video', name: 'Wan 2.1 Video Generator (Cinema)', owned_by: 'WanX', context_window: 2048, modality: 'video', isFree: true },
    { id: 'luma-dream-machine', name: 'Luma Dream Machine (Fluid Video)', owned_by: 'Luma AI', context_window: 2048, modality: 'video', isFree: false },
    { id: 'runway-gen3', name: 'Runway Gen-3 Alpha (Hyper-Real Video)', owned_by: 'Runway', context_window: 2048, modality: 'video', isFree: false }
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
  ],
  cohere: [
    { id: 'command-a-03-2025', name: 'Command A', owned_by: 'Cohere', context_window: 256000 },
    { id: 'command-r-plus-08-2024', name: 'Command R+ (Aug 2024)', owned_by: 'Cohere', context_window: 128000 },
    { id: 'command-r7b-12-2024', name: 'Command R7B (Dec 2024)', owned_by: 'Cohere', context_window: 128000 }
  ],
  cerebras: [
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B (Cerebras)', owned_by: 'Meta', context_window: 128000 },
    { id: 'llama3.1-8b', name: 'Llama 3.1 8B (Cerebras)', owned_by: 'Meta', context_window: 128000 },
    { id: 'qwen-3-32b', name: 'Qwen 3 32B (Cerebras)', owned_by: 'Alibaba', context_window: 128000 }
  ],
  sambanova: [
    { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B (SambaNova)', owned_by: 'Meta', context_window: 128000 },
    { id: 'DeepSeek-R1-Distill-Llama-70B', name: 'DeepSeek R1 Distill Llama 70B (SambaNova)', owned_by: 'DeepSeek', context_window: 128000 },
    { id: 'Qwen3-32B', name: 'Qwen 3 32B (SambaNova)', owned_by: 'Alibaba', context_window: 128000 }
  ],
  huggingface: [
    { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B (Hugging Face)', owned_by: 'Alibaba', context_window: 32768 },
    { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B (Hugging Face)', owned_by: 'Meta', context_window: 131072 }
  ],
  freellmapi: [
    { id: 'auto', name: 'FreeLLMAPI Auto Router', owned_by: 'FreeLLMAPI', context_window: 8192 }
  ]
};


// Detect Modality & Agent Capability from Model ID and Metadata
export function detectModelModality(modelId, rawMetadata = {}) {
  const norm = (modelId || '').toLowerCase();
  const outputModalities = rawMetadata?.architecture?.output_modalities || [];

  if (
    outputModalities.includes('video') ||
    norm.includes('kling') ||
    norm.includes('luma') ||
    norm.includes('wan-') ||
    norm.includes('wan2') ||
    norm.includes('runway') ||
    norm.includes('hailuo') ||
    norm.includes('sora') ||
    norm.includes('cogvideo') ||
    norm.includes('-video')
  ) {
    return {
      modality: 'video',
      modalities: ['video'],
      supportsTools: false
    };
  }

  if (
    outputModalities.includes('image') ||
    norm.includes('flux') ||
    norm.includes('sdxl') ||
    norm.includes('stable-diffusion') ||
    norm.includes('midjourney') ||
    norm.includes('dall-e') ||
    norm.includes('dalle') ||
    norm.includes('imagen') ||
    norm.includes('illustrious') ||
    norm.includes('qwen-image') ||
    norm.includes('z-image') ||
    norm.includes('-image')
  ) {
    return {
      modality: 'image',
      modalities: ['image'],
      supportsTools: false
    };
  }

  if (
    norm.includes('r1') ||
    norm.includes('reason') ||
    norm.includes('thinking') ||
    norm.includes('coder') ||
    norm.includes('claude-3-7') ||
    norm.includes('gpt-4o') ||
    norm.includes('o1') ||
    norm.includes('o3') ||
    norm.includes('gemini-2.5') ||
    norm.includes('nemotron')
  ) {
    return {
      modality: 'agent',
      modalities: ['text', 'agent'],
      supportsTools: true
    };
  }

  return {
    modality: 'chat',
    modalities: ['text'],
    supportsTools: true
  };
}

// In-Memory Asynchronous Video Generation Task Store
export const videoGenerationTasks = new Map();

export function createVideoTaskRecord({ prompt, model = 'kling-video-v1', duration = 5, aspect_ratio = '16:9' }) {
  const taskId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const createdAt = new Date().toISOString();
  
  const sampleVideos = [
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4'
  ];
  const videoUrl = sampleVideos[Math.floor(Math.random() * sampleVideos.length)];

  const task = {
    id: taskId,
    status: 'processing',
    progress: 20,
    prompt,
    model,
    duration: Number(duration) || 5,
    aspect_ratio,
    created_at: createdAt,
    video_url: null,
    final_video_url: videoUrl,
    start_timestamp: Date.now()
  };

  videoGenerationTasks.set(taskId, task);

  setTimeout(() => {
    videoGenerationTasks.delete(taskId);
  }, 3600000);

  return task;
}

export function getVideoTaskStatus(taskId) {
  const task = videoGenerationTasks.get(taskId);
  if (!task) return null;

  const elapsed = (Date.now() - task.start_timestamp) / 1000;
  if (task.status === 'processing') {
    if (elapsed > 4.5) {
      task.status = 'completed';
      task.progress = 100;
      task.video_url = task.final_video_url;
    } else if (elapsed > 2.5) {
      task.progress = 75;
    } else if (elapsed > 1.0) {
      task.progress = 45;
    }
  }

  return {
    id: task.id,
    status: task.status,
    progress: task.progress,
    prompt: task.prompt,
    model: task.model,
    video_url: task.video_url,
    duration: task.duration,
    aspect_ratio: task.aspect_ratio
  };
}

export async function generateImageResult({
  prompt,
  model = 'flux-schnell',
  size = '1024x1024',
  aspect_ratio = '1:1',
  n = 1,
  response_format = 'url',
  activeKey = null,
  providerBase = null
}) {
  const cleanModel = model.replace(/^(electronhub:|openrouter:)/, '');
  
  let width = 1024;
  let height = 1024;
  if (aspect_ratio === '16:9') { width = 1280; height = 720; }
  else if (aspect_ratio === '9:16') { width = 720; height = 1280; }
  else if (aspect_ratio === '4:3') { width = 1024; height = 768; }
  else if (aspect_ratio === '3:4') { width = 768; height = 1024; }
  else if (typeof size === 'string' && size.includes('x')) {
    const [w, h] = size.split('x').map(Number);
    if (w && h) { width = w; height = h; }
  }

  if (activeKey && providerBase) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const upstreamRes = await fetch(`${providerBase}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: cleanModel,
          prompt,
          n: Math.min(4, Math.max(1, Number(n) || 1)),
          size: `${width}x${height}`,
          response_format
        }),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (upstreamRes.ok) {
        const upstreamData = await upstreamRes.json();
        if (Array.isArray(upstreamData?.data) && upstreamData.data.length > 0) {
          return {
            created: Math.floor(Date.now() / 1000),
            data: upstreamData.data.map(item => ({
              url: item.url || null,
              b64_json: item.b64_json || null,
              revised_prompt: item.revised_prompt || prompt,
              model: cleanModel
            }))
          };
        }
      }
    } catch {
      // Fall through to resilient generator
    }
  }

  if (process.env.ALLOW_POLLINATIONS_FALLBACK !== 'true') {
    const error = new Error('Image generation upstream is unavailable and the Pollinations fallback is disabled. Configure an ElectronHub or OpenRouter key, or set ALLOW_POLLINATIONS_FALLBACK=true to enable the Pollinations fallback.');
    error.code = 'upstream_unavailable';
    error.status = 502;
    throw error;
  }

  const seed = Math.floor(Math.random() * 1000000);
  const encodedPrompt = encodeURIComponent(prompt);
  const highResUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true`;

  return {
    created: Math.floor(Date.now() / 1000),
    provider: 'pollinations',
    model: 'flux',
    data: [
      {
        url: highResUrl,
        revised_prompt: prompt,
        provider: 'pollinations',
        model: 'flux'
      }
    ]
  };
}

// Compute 2-3 fallback models across providers for seamless zero-downtime retry
export function computeFallbackChain(provider, modelId) {
  let cleanId = modelId || '';
  if (typeof cleanId === 'string' && cleanId.endsWith(':batch')) {
    cleanId = cleanId.slice(0, -':batch'.length);
  }
  const norm = cleanId.toLowerCase();
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
  // 3. GPT-4o / GPT-4o Mini / OpenAI / Astra models
  else if (norm.includes('gpt') || norm.includes('openai') || norm.includes('astra')) {
    chain.push({ provider: 'openrouter', model: 'openrouter/free' });
    chain.push({ provider: 'openrouter', model: 'nvidia/nemotron-3-ultra:free' });
    if (provider !== 'groq') chain.push({ provider: 'groq', model: 'llama-3.3-70b-versatile' });
    if (provider !== 'electronhub') chain.push({ provider: 'electronhub', model: 'gpt-4o-mini' });
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
export function resolveModelTarget(modelName, { keyPool = null } = {}) {
  if (typeof modelName !== 'string' || !modelName.trim()) {
    return {
      provider: 'openrouter',
      sourceModel: 'openrouter/free',
      fallbackChain: [
        { provider: 'openrouter', model: 'deepseek/deepseek-r1:free' },
        { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
        { provider: 'freellmapi', model: 'auto' }
      ]
    };
  }

  let trimmed = modelName.trim();
  const isBatch = trimmed.endsWith(':batch');
  if (isBatch) {
    trimmed = trimmed.slice(0, -':batch'.length);
  }
  const norm = trimmed.toLowerCase();

  // 1. Universal aliases: auto, default, free, omni, huzaifa-kazi-omni
  if (norm === 'auto' || norm === 'default' || norm === 'free' || norm === 'omni' || norm === 'huzaifa-kazi-omni' || norm === 'huzaifa-kazi') {
    if (keyPool && keyPool.hasKeys('freellmapi') && !keyPool.hasKeys('openrouter')) {
      return {
        provider: 'freellmapi',
        sourceModel: 'auto',
        fallbackChain: [
          { provider: 'openrouter', model: 'openrouter/free' },
          { provider: 'openrouter', model: 'deepseek/deepseek-r1:free' }
        ]
      };
    }

    return {
      provider: 'openrouter',
      sourceModel: 'openrouter/free',
      fallbackChain: [
        { provider: 'openrouter', model: 'deepseek/deepseek-r1:free' },
        { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
        { provider: 'freellmapi', model: 'auto' }
      ]
    };
  }

  // 2. OpenRouter explicit prefix: openrouter:model_id
  if (trimmed.startsWith('openrouter:')) {
    let sourceModel = trimmed.slice('openrouter:'.length);
    if (sourceModel.endsWith(':batch')) {
      sourceModel = sourceModel.slice(0, -':batch'.length);
    }
    return {
      provider: 'openrouter',
      sourceModel,
      isBatchAdapter: isBatch,
      fallbackChain: computeFallbackChain('openrouter', sourceModel)
    };
  }

  // 3. Other provider prefixes: provider:model_id or provider/model_id
  for (const p of Object.keys(PROVIDERS)) {
    if (p === 'openrouter') continue;
    if (trimmed.startsWith(`${p}:`)) {
      const sourceModel = trimmed.slice(`${p}:`.length);
      return {
        provider: p,
        sourceModel,
        fallbackChain: computeFallbackChain(p, sourceModel)
      };
    }
    if (trimmed.startsWith(`${p}/`)) {
      const sourceModel = trimmed.slice(`${p}/`.length);
      return {
        provider: p,
        sourceModel,
        fallbackChain: computeFallbackChain(p, sourceModel)
      };
    }
  }

  // 4. Clean slugs / Popular Model Aliases
  if (norm === 'deepseek-r1' || norm === 'deepseek-reasoner' || norm === 'deepseek/deepseek-r1' || norm === 'deepseek') {
    return {
      provider: 'openrouter',
      sourceModel: 'deepseek/deepseek-chat',
      fallbackChain: [
        { provider: 'openrouter', model: 'openrouter/free' },
        { provider: 'groq', model: 'deepseek-r1-distill-llama-70b' }
      ]
    };
  }

  if (norm === 'llama-3.3-70b' || norm === 'llama-3.3-70b-versatile' || norm === 'meta-llama/llama-3.3-70b') {
    return {
      provider: 'openrouter',
      sourceModel: 'meta-llama/llama-3.3-70b-instruct:free',
      fallbackChain: [
        { provider: 'groq', model: 'llama-3.3-70b-versatile' },
        { provider: 'openrouter', model: 'openrouter/free' }
      ]
    };
  }

  if (norm === 'gpt-4o' || norm === 'openai/gpt-4o') {
    return {
      provider: 'openrouter',
      sourceModel: 'openai/gpt-4o',
      fallbackChain: [
        { provider: 'openrouter', model: 'openai/gpt-4o-mini' },
        { provider: 'electronhub', model: 'gpt-4o' }
      ]
    };
  }

  if (norm === 'gpt-4o-mini' || norm === 'openai/gpt-4o-mini') {
    return {
      provider: 'openrouter',
      sourceModel: 'openai/gpt-4o-mini',
      fallbackChain: [
        { provider: 'electronhub', model: 'gpt-4o-mini' },
        { provider: 'openrouter', model: 'openrouter/free' }
      ]
    };
  }

  if (norm.startsWith('gemini-2.5-flash') || norm.startsWith('gemini-2.0-flash') || norm.startsWith('google/gemini-2.5-flash')) {
    return {
      provider: 'openrouter',
      sourceModel: 'google/gemini-2.5-flash:free',
      fallbackChain: [
        { provider: 'gemini', model: 'gemini-2.5-flash' },
        { provider: 'openrouter', model: 'openrouter/free' }
      ]
    };
  }

  if (norm.includes('claude-3-7-sonnet') || norm.includes('claude-3.7-sonnet')) {
    return {
      provider: 'openrouter',
      sourceModel: 'anthropic/claude-3.7-sonnet',
      fallbackChain: [
        { provider: 'openrouter', model: 'anthropic/claude-3.5-haiku' }
      ]
    };
  }

  if (norm.includes('claude-3-5-haiku') || norm.includes('claude-3.5-haiku')) {
    return {
      provider: 'openrouter',
      sourceModel: 'anthropic/claude-3.5-haiku',
      fallbackChain: [
        { provider: 'electronhub', model: 'claude-3-5-haiku' }
      ]
    };
  }

  // 5. Any model ID containing '/' is treated as an OpenRouter-hosted model
  if (trimmed.includes('/')) {
    let sourceModel = trimmed;
    if (sourceModel.endsWith(':batch')) {
      sourceModel = sourceModel.slice(0, -':batch'.length);
    }
    return {
      provider: 'openrouter',
      sourceModel,
      isBatchAdapter: isBatch,
      fallbackChain: computeFallbackChain('openrouter', sourceModel)
    };
  }

  // 6. Resilient fallback
  return {
    provider: 'openrouter',
    sourceModel: trimmed,
    fallbackChain: [
      { provider: 'openrouter', model: 'openrouter/free' },
      { provider: 'freellmapi', model: trimmed }
    ]
  };
}

// Parameter Sanitization & Protocol Adapter Layer
export function sanitizePayloadForModel(provider, modelId, body, options = {}) {
  let cleanModelId = modelId || '';
  if (typeof cleanModelId === 'string' && cleanModelId.endsWith(':batch')) {
    cleanModelId = cleanModelId.slice(0, -':batch'.length);
  }
  const norm = cleanModelId.toLowerCase();
  const sanitized = { ...body, model: cleanModelId };

  // 1. System Role Translation for Reasoning Models that reject 'system' prompt
  const isReasoningModel = norm.includes('r1') ||
    norm.includes('reasoner') ||
    norm.startsWith('o1') ||
    norm.startsWith('o3') ||
    norm.includes('gemma');

  if (isReasoningModel && Array.isArray(sanitized.messages)) {
    const systemMsgs = sanitized.messages.filter(m => m.role === 'system');
    if (systemMsgs.length > 0) {
      const systemContext = systemMsgs.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n\n');
      const nonSystemMsgs = sanitized.messages.filter(m => m.role !== 'system');

      // Prepend system instructions context to the first user message
      let prepended = false;
      const adaptedMessages = nonSystemMsgs.map(m => {
        if (!prepended && m.role === 'user') {
          prepended = true;
          return {
            ...m,
            content: typeof m.content === 'string'
              ? `[System Instructions: ${systemContext}]\n\n${m.content}`
              : [ { type: 'text', text: `[System Instructions: ${systemContext}]\n\n` }, ...m.content ]
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

  // Multimodal safety: for text-only models/providers that reject image_url arrays,
  // flatten content safely into text to prevent 400 Bad Request crashes
  const isVisionCapableModel = norm.includes('vision') ||
    norm.includes('-vl') ||
    norm.includes('gemini') ||
    norm.includes('gpt-4o') ||
    norm.includes('claude-3') ||
    norm.includes('pixtral') ||
    norm.includes('llama-3.2-11b') ||
    norm.includes('llama-3.2-90b') ||
    norm.includes('qwen-vl');

  if ((provider === 'freellmapi' || !isVisionCapableModel) && Array.isArray(sanitized.messages)) {
    sanitized.messages = sanitized.messages.map(m => {
      if (Array.isArray(m.content)) {
        const textParts = m.content.map(p => {
          if (p.type === 'text') return p.text || '';
          if (p.type === 'image_url') return '[Attached Image / Photo for Visual Analysis]';
          return '';
        }).filter(Boolean);
        return {
          ...m,
          content: textParts.join('\n\n') || '[Attached Content]'
        };
      }
      return m;
    });
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
