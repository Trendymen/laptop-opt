import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function extractVisibleText(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

export function validateHtml(html) {
  const visible = extractVisibleText(html);
  for (const phrase of ['单文件 HTML', 'Base64', 'Data URI', '图片内联', '离线查看', '交付格式']) {
    assert.ok(!visible.includes(phrase), `visible implementation copy: ${phrase}`);
  }
  assert.equal((html.match(/data:image\/webp;base64,/g) ?? []).length, 10, 'expected ten WebP Data URIs');
  assert.doesNotMatch(html, /<img[^>]+src=["'](?!data:)/, 'external image source');
  assert.doesNotMatch(html, /\b(?:src|poster)=["']https?:\/\//i, 'external media source');
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/, 'external stylesheet');
  assert.doesNotMatch(html, /<script[^>]+src=/, 'external script');
  const styleText = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  assert.doesNotMatch(styleText, /(?:url\(|@import\s+)[^;)]*https?:\/\//i, 'external CSS resource');
  const httpLinks = [...html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)/g)]
    .map((match) => new URL(match[1].replaceAll('&amp;', '&')));
  assert.equal(httpLinks.length, 2, 'expected exactly two external tutorial links');
  assert.ok(httpLinks.every((url) => url.hostname === 'www.bilibili.com'), 'non-Bilibili external link');
  assert.equal(httpLinks[0].pathname, '/video/BV1yv78zQEnD/');
  assert.equal(httpLinks[0].searchParams.get('t'), '1355');
  assert.equal(httpLinks[1].pathname, '/video/BV1mvFpzoEp6/');
  return true;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const html = await readFile(resolve('dist/laptop-performance-handoff.html'), 'utf8');
  validateHtml(html);
  console.log('Standalone HTML validation passed.');
}
