export type ChatRole = 'system' | 'user' | 'assistant';
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
export type ChatMessage = { role: ChatRole; content: string | ContentPart[] };

export function messageText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .map((p) => (p.type === 'text' ? p.text : '[image attached]'))
    .join('\n');
}

export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string };

export type ChatParams = {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  baseUrl?: string | null;
};

export type StreamLimits = {
  maxDurationMs?: number;
  idleTimeoutMs?: number;
  maxOutputChars?: number;
};

export type ImageKind = 'image' | 'video';
export type ImageRequest = { model: string; prompt: string; kind: ImageKind; baseUrl?: string | null };
export type ImageResult = { url: string; kind: ImageKind; note?: string };

export type ProviderAdapter = {
  streamChat(params: ChatParams, credential: string | null, signal?: AbortSignal): AsyncGenerator<ChatEvent>;
  generateImage?(req: ImageRequest, credential: string | null, signal?: AbortSignal): Promise<ImageResult>;
};

export class GatewayError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
