// services/pdfExtractor.js
// Safe server-side PDF text extraction using pdf-parse wrapped in strict error handling

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pdfParseLib = null;
try {
  pdfParseLib = require('pdf-parse');
} catch {
  pdfParseLib = null;
}

export async function extractPdfTextSafely(bufferOrBase64, maxChars = 40000) {
  if (!pdfParseLib) return '';
  try {
    let buffer;
    if (Buffer.isBuffer(bufferOrBase64)) {
      buffer = bufferOrBase64;
    } else if (typeof bufferOrBase64 === 'string') {
      const cleanBase64 = bufferOrBase64.replace(/^data:application\/pdf;base64,/, '');
      buffer = Buffer.from(cleanBase64, 'base64');
    } else {
      return '';
    }

    if (!buffer || buffer.length === 0) return '';

    let rawText = '';
    if (pdfParseLib.PDFParse) {
      const parser = new pdfParseLib.PDFParse({ data: buffer });
      const res = await parser.getText();
      rawText = typeof res === 'string' ? res : (res?.text || '');
      if (typeof parser.destroy === 'function') {
        await parser.destroy().catch(() => {});
      }
    } else if (typeof pdfParseLib === 'function') {
      const parsed = await pdfParseLib(buffer, { max: 25 });
      rawText = parsed?.text || '';
    }

    const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return cleanText.slice(0, maxChars);
  } catch (err) {
    console.warn('[PDF Extractor Warning: Failed to parse PDF]', err?.message || err);
    return '';
  }
}
