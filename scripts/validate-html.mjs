import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const approvedTutorialLinks = [
  'https://www.bilibili.com/video/BV1yv78zQEnD/?share_source=copy_web&vd_source=91e679d463038976da1b6275f56aec3c&t=1355',
  'https://www.bilibili.com/video/BV1mvFpzoEp6/?share_source=copy_web&vd_source=91e679d463038976da1b6275f56aec3c',
];

function decodeNumericCharacterReferences(value) {
  return value.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (reference, hexadecimal, decimal) => {
    const codePoint = Number.parseInt(hexadecimal ?? decimal, hexadecimal === undefined ? 10 : 16);
    const isValid = codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
    return isValid ? String.fromCodePoint(codePoint) : reference;
  });
}

export function extractVisibleText(html) {
  const visibleAttributes = [...html.matchAll(/\b(?:alt|title|aria-label|placeholder)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    .map((match) => match[1] ?? match[2] ?? match[3]);
  const bodyText = html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeNumericCharacterReferences(`${bodyText} ${visibleAttributes.join(' ')}`).replace(/\s+/g, ' ');
}

export function validateHtml(html) {
  const visible = extractVisibleText(html);
  for (const phrase of ['单文件 HTML', 'Base64', 'Data URI', '图片内联', '离线查看', '交付格式']) {
    assert.ok(!visible.includes(phrase), `visible implementation copy: ${phrase}`);
  }
  assert.equal((html.match(/data:image\/webp;base64,/g) ?? []).length, 10, 'expected ten WebP Data URIs');
  assert.doesNotMatch(html, /<img\b[^>]*\bsrc\s*=\s*(?:"(?!data:)[^"]*"|'(?!data:)[^']*'|(?!data:)[^\s"'=<>`]+)/i, 'external image source');
  assert.doesNotMatch(html, /<img\b[^>]*\bsrcset\s*=\s*(?:["']\s*(?:https?:)?\/\/|(?:https?:)?\/\/)/i, 'external image source');
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i, 'external script');
  assert.doesNotMatch(html, /\b(?:src|poster)\s*=\s*(?:["']\s*(?:https?:)?\/\/|(?:https?:)?\/\/)/i, 'external media source');
  assert.doesNotMatch(html, /<link\b[^>]*\brel\s*=\s*(?:"[^"]*\bstylesheet\b[^"]*"|'[^']*\bstylesheet\b[^']*'|stylesheet\b)/i, 'external stylesheet');
  const styleText = [
    ...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]),
    ...[...html.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
      .map((match) => match[1] ?? match[2] ?? match[3]),
  ].join('\n');
  assert.doesNotMatch(styleText, /(?:url\(\s*["']?\s*|@import\s+(?:url\(\s*)?["']?\s*)(?:https?:)?\/\//i, 'external CSS resource');
  const tutorialLinks = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    .map((match) => (match[1] ?? match[2] ?? match[3]).replaceAll('&amp;', '&'));
  assert.deepEqual(tutorialLinks, approvedTutorialLinks, 'expected exact approved tutorial links');
  return true;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const html = await readFile(resolve('dist/laptop-performance-handoff.html'), 'utf8');
  validateHtml(html);
  console.log('Standalone HTML validation passed.');
}
