import { prisma } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { fail } from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';
import { executeChat } from '@/lib/gateway/run';
import { GatewayError } from '@/lib/gateway/types';

export const maxDuration = 300;

type OpenAIBody = {
  model?: string;
  messages?: { role?: string; content?: string }[];
  stream?: boolean;
};

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const raw = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!raw) return fail(401, 'Missing Authorization header with an API key.');
    const apiKey = await prisma.apiKey.findUnique({ where: { keyHash: sha256(raw) }, include: { User: true } });
    if (!apiKey || apiKey.revoked) return fail(401, 'Invalid or revoked API key.');
    if (apiKey.User.suspended) return fail(403, 'Account suspended.');

    const minute = await checkRateLimit(`apikey:${apiKey.id}`, 120, 10_000_000);
    if (!minute.allowed) return fail(429, 'Rate limit exceeded.');

    let body: OpenAIBody;
    try { body = await req.json() as OpenAIBody; } catch { return fail(400, 'Invalid JSON body.'); }
    if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
      return fail(422, 'Both "model" and a non-empty "messages" array are required.');
    }
    const messages = body.messages.map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user') as 'assistant' | 'system' | 'user',
      content: String(m.content ?? ''),
    }));

    const requestId = crypto.randomUUID();
    const stream = await executeChat({
      userId: apiKey.User.id,
      isAdmin: false,
      modelSlug: body.model,
      messages,
      persist: false,
      signal: req.signal,
    });

    if (body.stream === false) {
      const text = await readAll(stream);
      const parsed = JSON.parse(text.replace(/^data: /gm, '').split('\n\n').filter(Boolean).pop() ?? '{}');
      return Response.json({
        id: `chatcmpl-${requestId}`,
        object: 'chat.completion',
        model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content: parsed.collected ?? '' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: parsed.usage?.promptTokens ?? 0,
          completion_tokens: parsed.usage?.completionTokens ?? 0,
          total_tokens: (parsed.usage?.promptTokens ?? 0) + (parsed.usage?.completionTokens ?? 0),
        },
      });
    }

    return new Response(transformToOpenAISse(stream, body.model, requestId), {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    if (err instanceof GatewayError) return fail(err.status, err.message);
    return fail(500, 'Gateway error.');
  }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function transformToOpenAISse(inner: ReadableStream<Uint8Array>, model: string, requestId: string): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let collected = '';
  let usage: { promptTokens: number; completionTokens: number } | null = null;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = inner.getReader();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as { type?: string; text?: string; usage?: { promptTokens: number; completionTokens: number } };
            if (ev.type === 'delta' && ev.text) {
              collected += ev.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: `chatcmpl-${requestId}`, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { content: ev.text }, finish_reason: null }] })}\n\n`));
            } else if (ev.type === 'usage') {
              usage = ev.usage ?? null;
            }
          } catch { /* skip */ }
        }
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: `chatcmpl-${requestId}`, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: usage ? { prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, total_tokens: usage.promptTokens + usage.completionTokens } : undefined })}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}
