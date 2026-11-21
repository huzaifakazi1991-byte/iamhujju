import { z } from 'zod';
import { fail, handleError, ok, readJson, requireUser } from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';

export const maxDuration = 30;

const browseSchema = z.object({
  url: z.string().trim().min(4).max(2048),
});

const BLOCKED_HOST = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?fc00|\[?fd|.*\.local$|.*\.internal$)/i;

function extractText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(withoutScripts)?.[1]?.trim() ?? '';
  const body = withoutScripts
    .replace(/<(br|hr)[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = body
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return (title ? `${title}\n\n` : '') + text;
}

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    const limit = await checkRateLimit(`tools:${actor.id}`, 12, 1_000_000);
    if (!limit.allowed) {
      return fail(429, `Too many page reads. Retry in ${limit.retryAfterSec}s.`);
    }

    const { url } = await readJson(req, browseSchema);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return fail(422, 'Enter a valid URL.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fail(422, 'Only http and https URLs are supported.');
    }
    if (BLOCKED_HOST.test(parsed.hostname)) {
      return fail(400, 'That address is not reachable from the platform.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; IamHujjuBot/1.0; +https://iamhujju.com)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        },
      });
    } catch {
      return fail(502, 'Could not reach that page. Check the URL and try again.');
    } finally {
      clearTimeout(timer);
    }

    if (BLOCKED_HOST.test(new URL(res.url || parsed.toString()).hostname)) {
      return fail(400, 'That address is not reachable from the platform.');
    }
    if (!res.ok) {
      return fail(502, `The page responded with HTTP ${res.status}.`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    const reader = res.body?.getReader();
    let raw = '';
    if (reader) {
      const decoder = new TextDecoder();
      while (raw.length < 600_000) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => undefined);
    } else {
      raw = await res.text();
    }
    const text = contentType.includes('html') ? extractText(raw) : raw.trim();
    const clipped = text.slice(0, 40_000);
    if (!clipped) return fail(422, 'That page has no readable text content.');
    const title = (/^([^\n]+)/.exec(clipped)?.[1] ?? '').slice(0, 120);
    return ok({
      url: res.url || parsed.toString(),
      title,
      text: clipped,
      truncated: text.length > 40_000,
      bytes: text.length,
    });
  } catch (err) {
    return handleError(err);
  }
}
