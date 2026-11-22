export type CatalogCapability = 'chat' | 'image' | 'video' | 'tts';

export type CatalogPlatform = {
  kind: string;
  label: string;
  baseUrl: string;
  keyHint: string;
  keyUrl: string;
  suggested: { slug: string; capability: CatalogCapability }[];
  docs: string;
};

export const PROVIDER_CATALOG: CatalogPlatform[] = [
  {
    kind: 'gemini',
    label: 'Google AI — Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyHint: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    suggested: [
      { slug: 'gemini-3.5-flash-lite', capability: 'chat' },
      { slug: 'gemini-3.8-flash', capability: 'chat' },
      { slug: 'gemini-3.6-flash', capability: 'chat' },
      { slug: 'gemini-4-neon', capability: 'chat' },
      { slug: 'imagen-4.0-generate-001', capability: 'image' },
    ],
    docs: 'Chat via the OpenAI-compatible endpoint; image models route through the native Google endpoint automatically.',
  },
  {
    kind: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyHint: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    suggested: [
      { slug: 'gpt-5', capability: 'chat' },
      { slug: 'gpt-5-mini', capability: 'chat' },
      { slug: 'gpt-4o', capability: 'chat' },
      { slug: 'gpt-4o-mini', capability: 'chat' },
      { slug: 'dall-e-3', capability: 'image' },
    ],
    docs: 'SSE chat streaming + images/generations for image models.',
  },
  {
    kind: 'anthropic',
    label: 'Anthropic — Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    keyHint: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    suggested: [
      { slug: 'claude-sonnet-4-20250514', capability: 'chat' },
      { slug: 'claude-opus-4-20250514', capability: 'chat' },
      { slug: 'claude-haiku-4-20250414', capability: 'chat' },
    ],
    docs: 'Messages API with SSE streaming; thinking TTFB 45 s budget.',
  },
  {
    kind: 'mistral',
    label: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    keyHint: '…',
    keyUrl: 'https://console.mistral.ai/api-keys',
    suggested: [
      { slug: 'mistral-small-latest', capability: 'chat' },
      { slug: 'mistral-large-latest', capability: 'chat' },
      { slug: 'mistral-medium-latest', capability: 'chat' },
    ],
    docs: 'OpenAI-compatible chat completions with streaming.',
  },
  {
    kind: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyHint: 'gsk_…',
    keyUrl: 'https://console.groq.com/keys',
    suggested: [
      { slug: 'llama-3.3-70b-versatile', capability: 'chat' },
      { slug: 'llama-3.1-8b-instant', capability: 'chat' },
      { slug: 'mixtral-8x7b-32768', capability: 'chat' },
    ],
    docs: 'Ultra-fast inference; OpenAI-compatible.',
  },
  {
    kind: 'xai',
    label: 'xAI — Grok',
    baseUrl: 'https://api.x.ai/v1',
    keyHint: 'xai-…',
    keyUrl: 'https://console.x.ai',
    suggested: [
      { slug: 'grok-4', capability: 'chat' },
      { slug: 'grok-3', capability: 'chat' },
      { slug: 'grok-2-image-1212', capability: 'image' },
    ],
    docs: 'OpenAI-compatible endpoints on api.x.ai/v1.',
  },
  {
    kind: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyHint: 'sk-…',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    suggested: [
      { slug: 'deepseek-chat', capability: 'chat' },
      { slug: 'deepseek-reasoner', capability: 'chat' },
    ],
    docs: 'OpenAI-compatible; deepseek-reasoner streams slowly — keep the generous TTFB budget.',
  },
  {
    kind: 'openrouter',
    label: 'OpenRouter (300+ models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyHint: 'sk-or-…',
    keyUrl: 'https://openrouter.ai/keys',
    suggested: [
      { slug: 'openai/gpt-4o-mini', capability: 'chat' },
      { slug: 'google/gemini-2.0-flash-001', capability: 'chat' },
      { slug: 'meta-llama/llama-3.3-70b-instruct', capability: 'chat' },
    ],
    docs: 'One key, hundreds of models. Always run “Sync models” after saving the key.',
  },
  {
    kind: 'together',
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    keyHint: '…',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    suggested: [
      { slug: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', capability: 'chat' },
      { slug: 'black-forest-labs/FLUX.1-schnell-Free', capability: 'image' },
    ],
    docs: 'OpenAI-compatible chat; image models via the images endpoint.',
  },
  {
    kind: 'fireworks',
    label: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    keyHint: 'fw_…',
    keyUrl: 'https://fireworks.ai/account/api-keys',
    suggested: [{ slug: 'accounts/fireworks/models/llama-v3p3-70b-instruct', capability: 'chat' }],
    docs: 'OpenAI-compatible inference endpoint.',
  },
  {
    kind: 'perplexity',
    label: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    keyHint: 'pplx-…',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    suggested: [{ slug: 'sonar', capability: 'chat' }, { slug: 'sonar-pro', capability: 'chat' }],
    docs: 'OpenAI-compatible chat with live web citations.',
  },
  {
    kind: 'cerebras',
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyHint: 'csk-…',
    keyUrl: 'https://cloud.cerebras.ai/apikeys',
    suggested: [{ slug: 'llama3.1-8b', capability: 'chat' }, { slug: 'llama-3.3-70b', capability: 'chat' }],
    docs: 'Wafer-scale speed, OpenAI-compatible.',
  },
  {
    kind: 'custom',
    label: 'Custom / self-hosted',
    baseUrl: '',
    keyHint: 'any token',
    keyUrl: '',
    suggested: [],
    docs: 'Any vLLM, Ollama, LiteLLM or OpenAI-compatible gateway. Base URL required.',
  },
];

export function catalogForKind(kind: string): CatalogPlatform {
  const k = kind.trim().toLowerCase();
  return PROVIDER_CATALOG.find((p) => p.kind === k) ?? PROVIDER_CATALOG[PROVIDER_CATALOG.length - 1];
}

export function capabilityOfSlug(slug: string): CatalogCapability {
  const s = slug.toLowerCase();
  if (/(^|[-_./])(veo|sora|kling|runway|luma|pika|wan-)/.test(s)) return 'video';
  if (/(^|[-_./])(imagen|dall-e|flux|stable-diffusion|sd3|sdxl|seedream|recraft|img-)/.test(s)) return 'image';
  return 'chat';
}
