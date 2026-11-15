import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import test from 'node:test';
import { sanitizeMarkdown } from './src/safeMarkdown.js';

test('Markdown sanitization removes executable raw HTML and event attributes', () => {
  const dom = new JSDOM('');
  const sanitized = sanitizeMarkdown(
    '<img src=x onerror="alert(1)"> <script>alert(document.cookie)</script>\n\n**safe markdown**',
    dom.window
  );

  assert.doesNotMatch(sanitized, /<\s*(?:img|script)\b/i);
  assert.doesNotMatch(sanitized, /onerror\s*=/i);
  assert.match(sanitized, /\*\*safe markdown\*\*/);
  dom.window.close();
});
