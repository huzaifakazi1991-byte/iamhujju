import { messageText, type ImageRequest, type ImageResult, type ChatEvent, type ChatParams, type ProviderAdapter } from '@/lib/gateway/types';

function replyFor(messages: ChatParams['messages']): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const trimmed = (last ? messageText(last.content) : '').trim().slice(0, 280);
  return [
    `Here is a mock response from the built-in provider \u2014 no external API needed.`,
    '',
    trimmed ? `You asked: "${trimmed}"` : 'You sent an empty message.',
    '',
    'Paste any real provider API key in **Admin \u2192 Providers** and this exact conversation will route to that model through the same gateway, unchanged.',
  ].join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PALETTES: [string, string, string][] = [
  ['#071f14', '#14532d', '#86efac'],
  ['#0b2b1d', '#166534', '#bbf7d0'],
  ['#052e16', '#15803d', '#a7f3d0'],
  ['#0f2e1d', '#3f6212', '#fde68a'],
  ['#022c22', '#047857', '#d1fae5'],
];

function wrapLines(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine) { lines.push(cur.trim()); cur = w; if (lines.length >= maxLines) break; }
    else cur = `${cur} ${w}`;
  }
  if (cur.trim() && lines.length < maxLines) lines.push(cur.trim());
  return lines;
}

function posterSvg(prompt: string, kind: 'image' | 'video'): string {
  const seed = Array.from(prompt).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 7);
  const [c0, c1, c2] = PALETTES[seed % PALETTES.length];
  const w = kind === 'video' ? 1280 : 1024;
  const h = kind === 'video' ? 720 : 1024;
  const corner = kind === 'video' ? 'h 1280' : '';
  void corner;
  const label = kind === 'video' ? 'MOCK VIDEO PREVIEW' : 'MOCK IMAGE PREVIEW';
  const lines = wrapLines(prompt, Math.floor(w / 22), 6);
  const body = lines.map((l, i) => `<text x="${w / 2}" y="${h / 2 + i * 46 - (lines.length - 1) * 23}" fill="${c2}" font-size="34" font-family="system-ui, sans-serif" font-weight="600" text-anchor="middle">${esc(l)}</text>`).join('');
  const play = kind === 'video'
    ? `<circle cx="${w / 2}" cy="${h / 2 + 130}" r="34" fill="${c2}" opacity="0.9"/><path d="M ${w / 2 - 10} ${h / 2 + 114} L ${w / 2 + 16} ${h / 2 + 130} L ${w / 2 - 10} ${h / 2 + 146} Z" fill="${c0}"/>`
    : `<ellipse cx="${w * 0.28}" cy="${h * 0.78}" rx="150" ry="42" fill="${c1}" opacity="0.55"/><ellipse cx="${w * 0.74}" cy="${h * 0.84}" rx="190" ry="52" fill="${c1}" opacity="0.4"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  <defs>\n    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">\n      <stop offset="0" stop-color="${c0}"/><stop offset="0.6" stop-color="${c1}"/><stop offset="1" stop-color="${c0}"/>\n    </linearGradient>\n  </defs>\n  <rect width="${w}" height="${h}" fill="url(#bg)"/>\n  ${play}\n  <text x="${w / 2}" y="${h / 2 - 130}" fill="${c2}" opacity="0.85" font-size="20" font-family="system-ui, sans-serif" letter-spacing="6" text-anchor="middle">${label}</text>\n  ${body}\n  <text x="${w / 2}" y="${h - 28}" fill="${c2}" opacity="0.6" font-size="17" font-family="system-ui, sans-serif" text-anchor="middle">huzaifa.ai \u00b7 demo render \u00b7 add a real image provider in Admin \u2192 Providers</text>\n</svg>`;
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

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    await new Promise((r) => setTimeout(r, 600));
    const svg = posterSvg(req.prompt || 'untitled render', req.kind);
    return {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      kind: req.kind,
      note: 'Rendered by the built-in mock image engine. Add a real image provider (Google Imagen, OpenAI) in Admin \u2192 Providers for production renders.',
    };
  },
};
