import { messageText, type ChatEvent, type ChatParams, type ProviderAdapter } from '@/lib/gateway/types';

function replyFor(messages: ChatParams['messages']): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const trimmed = (last ? messageText(last.content) : '').trim().slice(0, 280);
  return [
    `Here is a mock response from the built-in provider — no external API needed.`,
    '',
    trimmed ? `You asked: "${trimmed}"` : 'You sent an empty message.',
    '',
    'Paste any real provider API key in **Admin → Providers** and this exact conversation will route to that model through the same gateway, unchanged.',
  ].join('\n');
}

export const mockAdapter: ProviderAdapter = {
  async *streamChat(params: ChatParams): AsyncGenerator<ChatEvent> {
    const text = replyFor(params.messages);
    const words = text.split(/(\s+)/);
    for (const w of words) {
      if (w) yield { type: 'delta', text: w };
      await new Promise((r) => setTimeout(r, 8));
    }
    const promptChars = params.messages.reduce((n, m) => n + messageText(m.content).length, 0);
    yield {
      type: 'usage',
      promptTokens: Math.max(1, Math.ceil(promptChars / 4)),
      completionTokens: Math.max(1, Math.ceil(text.length / 4)),
    };
  },
};
