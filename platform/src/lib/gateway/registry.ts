import { mockAdapter } from '@/lib/gateway/mock';
import { openAICompatAdapter } from '@/lib/gateway/openai-compat';
import { anthropicAdapter } from '@/lib/gateway/anthropic';
import type { ProviderAdapter } from '@/lib/gateway/types';

export function adapterForProvider(kind: string): ProviderAdapter {
  switch (kind) {
    case 'mock': return mockAdapter;
    case 'anthropic': return anthropicAdapter;
    case 'mistral': return openAICompatAdapter({ kind: 'mistral' });
    case 'groq': return openAICompatAdapter({ kind: 'groq' });
    case 'openai': return openAICompatAdapter({ kind: 'openai' });
    default: return openAICompatAdapter({ kind: 'custom' });
  }
}
