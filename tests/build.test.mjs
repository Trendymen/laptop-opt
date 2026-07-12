import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import test from 'node:test';
import { buildPage, outputPath } from '../scripts/build.mjs';
import { validateHtml } from '../scripts/validate-html.mjs';

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

test('validator rejects visible implementation copy', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const contaminated = html.replace('</main>', '<p>交付格式：单文件 HTML</p></main>');
  assert.throws(() => validateHtml(contaminated), /visible implementation copy/);
});

test('validator rejects remote CSS resources', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const contaminated = html.replace('</style>', '.leak{background:url(https://example.com/leak.png)}</style>');
  assert.throws(() => validateHtml(contaminated), /external CSS resource/);
});

test('validator accepts the generated page', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  assert.doesNotThrow(() => validateHtml(html));
});
