import { messageText, type ChatEvent, type ChatParams, type ImageRequest, type ImageResult, type ProviderAdapter } from '@/lib/gateway/types';

type ProviderPreset = { kind: 'mistral' | 'openai' | 'groq' | 'gemini' | 'custom' };

export class UpstreamError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function mapUpstreamError(status: number, detail: string, modelSlug: string): string {
  if (status === 401 || status === 403) {
    return 'API key rejected by the provider — paste a valid key in Admin → Providers.';
  }
  if (status === 404 && /model|not found|unsupported/i.test(detail)) {
    return `Model "${modelSlug}" was not found on this provider (it may be retired or misnamed). Admin → Providers → "Sync models" lists the ids this key can actually use.`;
  }
  if (status === 429) {
    return 'The provider rate/quota limit was hit upstream. Please retry in a moment.';
  }
  if (status >= 500) {
    return 'The provider is temporarily unavailable. Please retry.';
  }
  return `Provider request failed: ${detail}`;
}

export function openAICompatAdapter(preset: ProviderPreset): ProviderAdapter {
  const defaultBase =
    preset.kind === 'mistral' ? 'https://api.mistral.ai/v1'
    : preset.kind === 'groq' ? 'https://api.groq.com/openai/v1'
    : preset.kind === 'openai' ? 'https://api.openai.com/v1'
    : preset.kind === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai'
    : '';

  async function open(requestBody: Record<string, unknown>, credential: string, baseUrl: string, signal: AbortSignal | undefined, attempt: number): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credential}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) throw err;
      const cause = (err as Error & { cause?: unknown })?.cause;
      throw new UpstreamError(502, `Could not reach the provider at ${baseUrl} (${String(cause ?? err)})`);
    }
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try { detail = (await res.text()).slice(0, 400); } catch { /* ignore */ }
      if (res.status === 400 && attempt < 2 && 'stream_options' in requestBody) {
        const { stream_options: _drop, ...rest } = requestBody;
        return open(rest, credential, baseUrl, signal, attempt + 1);
      }
      throw new UpstreamError(res.status, mapUpstreamError(res.status, detail, String(requestBody.model ?? '')));
    }
    return res;
  }

  async function* stream(params: ChatParams, credential: string | null, baseUrlOverride: string | null, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    if (!credential) throw new UpstreamError(401, 'This provider has no API key configured yet.');
    const base = (baseUrlOverride || defaultBase).replace(/\/$/, '');
    if (!base) throw new UpstreamError(400, 'This custom provider needs a base URL.');
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
      ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
    };
    const res = await open(body, credential, base, signal, 1);
    if (!res.body) throw new UpstreamError(502, 'Provider returned an empty response body.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let emitted = false;
    let errored = false;
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
            error?: { message?: string };
          };
          if (json.error?.message) {
            errored = true;
            yield { type: 'error', message: `Provider request failed: ${json.error.message}` };
            return;
          }
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
    if (!emitted && !errored) {
      yield { type: 'error', message: `Model "${params.model}" returned an empty response. Use "Sync models" in Admin → Providers to confirm the exact ids this key can use.` };
      return;
    }
    if (!usage) usage = { promptTokens: Math.ceil(params.messages.reduce((n, m) => n + messageText(m.content).length, 0) / 4), completionTokens: Math.max(1, Math.ceil(completionChars / 4)) };
    void emitted;
    yield { type: 'usage', ...usage };
  }

  async function generateImage(req: ImageRequest, credential: string | null, signal?: AbortSignal): Promise<ImageResult> {
    if (!credential) throw new UpstreamError(401, 'This provider has no API key configured yet.');
    const base = (req.baseUrl || defaultBase).replace(/\/$/, '');
    if (!base) throw new UpstreamError(400, 'This custom provider needs a base URL.');

    if (preset.kind === 'gemini' && /googleapis\.com/.test(base)) {
      return geminiNativeImage(req, credential, base.replace(/\/openai$/, ''), signal);
    }

    const attempt = (withFormat: boolean): Promise<Response> =>
      fetch(`${base}/images/generations`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` },
        body: JSON.stringify({ model: req.model, prompt: req.prompt, n: 1, ...(withFormat ? { response_format: 'b64_json' } : {}) }),
      });

    let res: Response;
    try {
      res = await attempt(true);
      if (res.status === 400) res = await attempt(false);
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) throw err;
      const cause = (err as Error & { cause?: unknown })?.cause;
      throw new UpstreamError(502, `Could not reach the provider at ${base} (${String(cause ?? err)})`);
    }

    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try { detail = (await res.text()).slice(0, 400); } catch { /* ignore */ }
      throw new UpstreamError(res.status, `Image model "${req.model}" was rejected by this provider: ${mapUpstreamError(res.status, detail, req.model)}`);
    }

    const json = (await res.json()) as { data?: { b64_json?: string; url?: string; revised_prompt?: string }[] };
    const first = json.data?.[0];
    if (first?.b64_json) return { url: `data:image/png;base64,${first.b64_json}`, kind: req.kind, note: first.revised_prompt };
    if (first?.url) return { url: first.url, kind: req.kind, note: first.revised_prompt };
    throw new UpstreamError(502, 'The provider returned no image data.');
  }

  async function geminiNativeImage(req: ImageRequest, credential: string, nativeBase: string, signal?: AbortSignal): Promise<ImageResult> {
    let res: Response;
    try {
      res = await fetch(`${nativeBase}/models/${encodeURIComponent(req.model)}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': credential },
        body: JSON.stringify({ contents: [{ parts: [{ text: req.prompt }] }] }),
      });
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) throw err;
      throw new UpstreamError(502, `Could not reach the Google endpoint (${String((err as Error)?.cause ?? err)})`);
    }
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try { detail = (await res.text()).slice(0, 400); } catch { /* ignore */ }
      throw new UpstreamError(res.status, mapUpstreamError(res.status, detail, req.model));
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }[] } }[];
    };
    for (const part of json.candidates?.[0]?.content?.parts ?? []) {
      const inline = part.inlineData ?? part.inline_data;
      const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? 'image/png';
      if (inline?.data) return { url: `data:${mime};base64,${inline.data}`, kind: req.kind };
    }
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').filter(Boolean).join('\n');
    throw new UpstreamError(502, text ? `The model replied with text instead of an image: ${text.slice(0, 300)}` : 'The model returned no image data.');
  }

  return {
    async *streamChat(params, credential, signal) {
      yield* stream(params, credential, params.baseUrl ?? null, signal);
    },
    generateImage(req, credential, signal) {
      return generateImage(req, credential, signal);
    },
  };
}
