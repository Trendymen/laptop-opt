import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import test from 'node:test';
import { buildPage, outputPath } from '../scripts/build.mjs';

test('build emits one self-contained HTML file with ten WebP assets', async () => {
  await rm('dist', { recursive: true, force: true });
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  assert.equal((html.match(/data:image\/webp;base64,/g) ?? []).length, 10);
  assert.doesNotMatch(html, /<img[^>]+src=["'](?!data:)/);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /\{\{[^}]+\}\}/);
});
