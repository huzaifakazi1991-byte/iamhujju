export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string };

export type ChatParams = {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type StreamLimits = {
  maxDurationMs?: number;
  idleTimeoutMs?: number;
  maxOutputChars?: number;
};

export type ProviderAdapter = {
  streamChat(params: ChatParams, credential: string | null, signal?: AbortSignal): AsyncGenerator<ChatEvent>;
};

export class GatewayError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
