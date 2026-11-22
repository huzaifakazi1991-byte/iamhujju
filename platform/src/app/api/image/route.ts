import { handleError, readJson, requireUser, fail } from '@/lib/api';
import { imageSchema } from '@/lib/validation';
import { executeImageRun } from '@/lib/gateway/run-image';
import { GatewayError } from '@/lib/gateway/types';

export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const body = await readJson(req, imageSchema);
    const kind = 'image' as const;
    const stream = await executeImageRun({
      userId: actor.id,
      isAdmin: actor.role === 'ADMIN',
      modelSlug: body.model,
      prompt: body.prompt,
      kind,
      conversationId: body.conversationId ?? null,
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
