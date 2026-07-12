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

test('validator rejects remote resources in HTML attribute variants', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const variants = [
    ['img srcset', html.replace('<img ', '<img srcset=https://example.com/leak.webp '), /external image source/],
    ['spaced script src', html.replace('<script>', '<script src = "https://example.com/leak.js">'), /external script/],
    ['spaced stylesheet rel', html.replace('</head>', '<link rel = "stylesheet" href="https://example.com/leak.css"></head>'), /external stylesheet/],
    ['inline style URL', html.replace('<main>', '<main style="background:url(https://example.com/leak.png)">'), /external CSS resource/],
  ];

  for (const [label, contaminated, expected] of variants) {
    assert.throws(() => validateHtml(contaminated), expected, label);
  }
});

test('validator rejects remote candidates anywhere in srcset attributes', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const variants = [
    ['source srcset', html.replace('</main>', '<source srcset=https://example.com/leak.webp></main>')],
    ['later img candidate', html.replace('<img ', '<img srcset="data/local 1x, https://example.com/leak.webp 2x" ')],
    ['later source candidate', html.replace('</main>', '<source srcset="data/local 1x, https://example.com/leak.webp 2x"></main>')],
  ];

  for (const [label, contaminated] of variants) {
    assert.throws(() => validateHtml(contaminated), /external image source/, label);
  }
});

test('validator requires approved tutorial URLs verbatim', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const approved = 'https://www.bilibili.com/video/BV1yv78zQEnD/?share_source=copy_web&amp;vd_source=91e679d463038976da1b6275f56aec3c&amp;t=1355';
  const variants = [
    ['protocol', approved.replace('https://', 'http://')],
    ['port', approved.replace('www.bilibili.com/', 'www.bilibili.com:443/')],
    ['query', approved.replace('t=1355', 't=1356')],
    ['fragment', `${approved}#changed`],
  ];

  for (const [label, href] of variants) {
    const contaminated = html.replace(approved, href);
    assert.throws(() => validateHtml(contaminated), /exact approved tutorial links/, label);
  }
});

test('validator rejects an additional protocol-relative link', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const contaminated = html.replace('</main>', '<a href="//evil.example/track">extra</a></main>');
  assert.throws(() => validateHtml(contaminated), /exact approved tutorial links/);
});

test('validator decodes numeric character references in visible copy', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const variants = [
    ['decimal', '<p>单文件 &#72;TML</p>'],
    ['hexadecimal', '<p>单文件 &#x48;TML</p>'],
  ];

  for (const [label, copy] of variants) {
    const contaminated = html.replace('</main>', `${copy}</main>`);
    assert.throws(() => validateHtml(contaminated), /visible implementation copy/, label);
  }
});

test('validator checks forbidden copy in user-visible attributes', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const variants = [
    ['alt', '<img alt="交付格式">'],
    ['title', '<span title="图片内联"></span>'],
    ['aria-label', '<button aria-label="离线查看"></button>'],
    ['placeholder', '<input placeholder="Base64">'],
  ];

  for (const [label, element] of variants) {
    const contaminated = html.replace('</main>', `${element}</main>`);
    assert.throws(() => validateHtml(contaminated), /visible implementation copy/, label);
  }
});

test('validator checks form value and label attributes for visible copy', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const variants = [
    ['input value', '<input type="button" value="Base64">'],
    ['option label', '<option label="交付格式"></option>'],
    ['optgroup label', '<optgroup label="图片内联"></optgroup>'],
  ];

  for (const [label, element] of variants) {
    const contaminated = html.replace('</main>', `${element}</main>`);
    assert.throws(() => validateHtml(contaminated), /visible implementation copy/, label);
  }
});

test('validator decodes numeric references before resource URL checks', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const variants = [
    ['decimal inline style', html.replace('<main>', '<main style="background:url(https&#58;//example.com/leak.png)">'), /external CSS resource/],
    ['hex inline style', html.replace('<main>', '<main style="background:url(https&#x3a;//example.com/leak.png)">'), /external CSS resource/],
    ['decimal poster', html.replace('</main>', '<video poster="https&#58;//example.com/leak.webp"></video></main>'), /external media source/],
    ['hex poster', html.replace('</main>', '<video poster="https&#x3A;//example.com/leak.webp"></video></main>'), /external media source/],
  ];

  for (const [label, contaminated, expected] of variants) {
    assert.throws(() => validateHtml(contaminated), expected, label);
  }
});

test('validator accepts the generated page', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  assert.doesNotThrow(() => validateHtml(html));
});
