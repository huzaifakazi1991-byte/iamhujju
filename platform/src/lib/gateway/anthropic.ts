import type { ChatEvent, ChatParams, ProviderAdapter } from '@/lib/gateway/types';

export const anthropicAdapter: ProviderAdapter = {
  async *streamChat(params: ChatParams, credential: string | null, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    if (!credential) throw new Error('This provider has no API key configured yet.');
    const system = params.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': credential,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens ?? 1024,
        stream: true,
        ...(system ? { system } : {}),
        messages,
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
    let usage: { promptTokens: number; completionTokens: number } | null = null;
    let completionChars = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        try {
          const json = JSON.parse(trimmed.slice(5).trim()) as {
            type?: string;
            delta?: { text?: string };
            message?: { usage?: { input_tokens?: number; output_tokens?: number } };
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          if (json.type === 'content_block_delta' && json.delta?.text) {
            completionChars += json.delta.text.length;
            yield { type: 'delta', text: json.delta.text };
          }
          const u = json.message?.usage ?? json.usage;
          if (u?.input_tokens != null) {
            usage = { promptTokens: u.input_tokens ?? 0, completionTokens: u.output_tokens ?? 0 };
          }
        } catch { /* skip malformed SSE line */ }
      }
    }
    if (!usage) usage = { promptTokens: Math.ceil(params.messages.reduce((n, m) => n + m.content.length, 0) / 4), completionTokens: Math.max(1, Math.ceil(completionChars / 4)) };
    yield { type: 'usage', ...usage };
  },
};
