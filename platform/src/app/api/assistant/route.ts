import { z } from 'zod';
import { checkIpLimit } from '@/lib/rate-limit';
import { fail, handleError, ok, readJson } from '@/lib/api';
import { assistantAnswer } from '@/lib/assistant';

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(12),
});

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const limit = await checkIpLimit(`assistant:${ip}`, 30);
    if (!limit.allowed) {
      return fail(429, `Too many questions in a row — retry in ${limit.retryAfterSec}s.`);
    }
    const { messages } = await readJson(req, schema);
    const { answer, source } = await assistantAnswer(messages);
    return ok({ answer, source });
  } catch (err) {
    return handleError(err);
  }
}
