import { mockAdapter } from '@/lib/gateway/mock';
import { openAICompatAdapter } from '@/lib/gateway/openai-compat';
import { anthropicAdapter } from '@/lib/gateway/anthropic';
import type { ProviderAdapter } from '@/lib/gateway/types';

const GEMINI_ALIASES = new Set(['gemini', 'google', 'google-ai', 'google-ai-studio', 'googleai', 'gemma']);

export function adapterForProvider(kind: string): ProviderAdapter {
  const k = kind.trim().toLowerCase();
  if (k === 'mock') return mockAdapter;
  if (GEMINI_ALIASES.has(k)) return openAICompatAdapter({ kind: 'gemini' });
  if (k === 'anthropic' || k === 'claude') return anthropicAdapter;
  if (k === 'mistral') return openAICompatAdapter({ kind: 'mistral' });
  if (k === 'groq') return openAICompatAdapter({ kind: 'groq' });
  if (k === 'openai') return openAICompatAdapter({ kind: 'openai' });
  return openAICompatAdapter({ kind: 'custom' });
}
