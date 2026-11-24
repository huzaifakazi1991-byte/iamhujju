/**
 * huzaifa.ai assistant — LLM-backed with knowledge-base fallback.
 * Prompt content lives in lib/assistant-knowledge.ts (pure, eval-covered);
 * commercial facts come from lib/plans.ts (single source of truth).
 */
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';
import { adapterForProvider } from '@/lib/gateway/registry';
import { messageText, type ChatMessage } from '@/lib/gateway/types';
import {
  ASSISTANT_NAME,
  ASSISTANT_SYSTEM_PROMPT,
  faqAnswer,
} from './assistant-knowledge';

export { ASSISTANT_NAME, ASSISTANT_SYSTEM_PROMPT };

export async function assistantAnswer(history: ChatMessage[]): Promise<{ answer: string; source: 'llm' | 'faq' }> {
  const provider = await prisma.provider.findFirst({
    where: { enabled: true, encryptedKey: { not: null } },
    include: { models: { where: { adminEnabled: true }, orderBy: { displayOrder: 'asc' }, take: 1 } },
  });
  if (provider && provider.models.length > 0) {
    try {
      const adapter = adapterForProvider(provider.name);
      const credential = decryptSecret(provider.encryptedKey!);
      const messages: ChatMessage[] = [{ role: 'system', content: ASSISTANT_SYSTEM_PROMPT }, ...history.slice(-10)];
      let answer = '';
      for await (const event of adapter.streamChat({ model: provider.models[0].slug, messages, maxTokens: 400, temperature: 0.4 }, credential)) {
        if (event.type === 'delta') answer += event.text;
        if (event.type === 'error') throw new Error(event.message);
      }
      if (answer.trim()) return { answer: answer.trim(), source: 'llm' };
    } catch {
      // fall through to the built-in knowledge base
    }
  }
  const last = [...history].reverse().find((m) => m.role === 'user');
  return { answer: faqAnswer(last ? messageText(last.content) : ''), source: 'faq' };
}
