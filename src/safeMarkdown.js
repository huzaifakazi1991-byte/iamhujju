import createDOMPurify from 'dompurify';

export function sanitizeMarkdown(markdown, hostWindow = globalThis.window) {
  if (typeof markdown !== 'string') return '';

  const purifier = typeof createDOMPurify.sanitize === 'function'
    ? createDOMPurify
    : hostWindow
      ? createDOMPurify(hostWindow)
      : null;

  if (!purifier) {
    throw new Error('DOMPurify requires a browser window to sanitize Markdown.');
  }

  return purifier.sanitize(markdown, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  });
}
