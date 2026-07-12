import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';

test('stylesheet encodes full-width layout and approved minimum type scale', async () => {
  const css = await readFile('src/styles.css', 'utf8');
  for (const token of [
    '--font-label: 0.75rem',
    '--font-note: 0.875rem',
    '--font-body: 1rem',
    '--font-value: 1.75rem',
    '.page-shell { width: 100%',
    'overflow-x: clip',
    'html[data-capture="true"]',
    '@media (prefers-reduced-motion: reduce)',
  ]) assert.ok(css.includes(token), `missing CSS invariant: ${token}`);
  assert.doesNotMatch(css, /\.page-shell\s*\{[^}]*max-width/);
  assert.doesNotMatch(css, /overflow-y\s*:\s*(auto|scroll)/);
});

test('evidence images stack vertically at their original ratios and the mobile hero is uncropped', async () => {
  const [css, template] = await Promise.all([
    readFile('src/styles.css', 'utf8'),
    readFile('src/index.template.html', 'utf8'),
  ]);

  assert.match(template, /class="media-stack"/);
  assert.match(template, /class="umaf-stack"/);
  assert.equal((template.match(/class="umaf-image"/g) ?? []).length, 2);
  assert.equal((template.match(/class="tutorial-meta"/g) ?? []).length, 2);
  assert.equal((template.match(/class="tutorial-copy"/g) ?? []).length, 2);
  assert.equal((template.match(/class="tutorial-link"/g) ?? []).length, 2);
  assert.doesNotMatch(template, /media-pair|umaf-grid|umaf-crop/);
  assert.match(css, /\.media-stack\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.umaf-stack\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.umaf-image\s*\{[^}]*height:\s*auto;[^}]*object-fit:\s*contain/);
  assert.match(css, /\.tutorial\s*\{[^}]*grid-template-columns:\s*8\.5rem minmax\(0, 1fr\) minmax\(15rem, 18rem\)/);
  assert.match(css, /\.tutorial-link\s*\{[^}]*display:\s*flex;[^}]*background:\s*var\(--acid\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.hero-media\s*\{\s*height:\s*auto;\s*\}[\s\S]*?\.hero-media img\s*\{[^}]*height:\s*auto;[^}]*object-fit:\s*contain/);

  const [spd, nonSpd] = await Promise.all([
    sharp('assets/source/UMAF内存时序调整1-DDR SPD Timing.jpg').metadata(),
    sharp('assets/source/UMAF内存时序调整2-DDR Non-SPD Timing.jpg').metadata(),
  ]);
  assert.deepEqual([spd.width, spd.height], [3072, 2024]);
  assert.deepEqual([nonSpd.width, nonSpd.height], [3072, 1208]);
});
