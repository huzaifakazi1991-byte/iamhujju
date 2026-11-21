import { handleError, readJson, requireUser, fail } from '@/lib/api';
import { chatSchema } from '@/lib/validation';
import { executeChat } from '@/lib/gateway/run';
import { GatewayError } from '@/lib/gateway/types';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const body = await readJson(req, chatSchema);
    const stream = await executeChat({
      userId: actor.id,
      isAdmin: actor.role === 'ADMIN',
      modelSlug: body.model,
      messages: body.messages,
      conversationId: body.conversationId ?? null,
      persist: true,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      signal: req.signal,
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    if (err instanceof GatewayError) return fail(err.status, err.message);
    return handleError(err);
  }
}
