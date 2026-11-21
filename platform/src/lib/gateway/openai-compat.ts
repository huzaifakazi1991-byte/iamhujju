import type { ChatEvent, ChatParams, ProviderAdapter } from '@/lib/gateway/types';

type ProviderPreset = { kind: 'mistral' | 'openai' | 'groq' | 'custom' };

export function openAICompatAdapter(preset: ProviderPreset): ProviderAdapter {
  const defaultBase =
    preset.kind === 'mistral' ? 'https://api.mistral.ai/v1'
    : preset.kind === 'groq' ? 'https://api.groq.com/openai/v1'
    : preset.kind === 'openai' ? 'https://api.openai.com/v1'
    : '';

  async function* stream(params: ChatParams, credential: string | null, baseUrl: string | null, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    if (!credential) throw new Error('This provider has no API key configured yet.');
    const base = (baseUrl || defaultBase).replace(/\/$/, '');
    if (!base) throw new Error('This custom provider needs a base URL.');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credential}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        stream: true,
        ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
        ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
        stream_options: { include_usage: true },
      }),
    });
    if (!res.ok || !res.body) {
      let detail = `${res.status} ${res.statusText}`;
      try { detail = (await res.text()).slice(0, 400); } catch { /* ignore */ }
      throw new Error(`Provider request failed: ${detail}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let emitted = false;
    let completionChars = 0;
    let usage: { promptTokens: number; completionTokens: number } | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            emitted = true;
            completionChars += delta.length;
            yield { type: 'delta', text: delta };
          }
          if (json.usage?.prompt_tokens != null) {
            usage = { promptTokens: json.usage.prompt_tokens ?? 0, completionTokens: json.usage.completion_tokens ?? 0 };
          }
        } catch { /* skip malformed SSE line */ }
      }
    }
    if (!usage) usage = { promptTokens: Math.ceil(params.messages.reduce((n, m) => n + m.content.length, 0) / 4), completionTokens: Math.max(1, Math.ceil(completionChars / 4)) };
    void emitted;
    yield { type: 'usage', ...usage };
  }

  return {
    async *streamChat(params, credential, signal) {
      yield* stream(params, credential, null, signal);
    },
  };
}
