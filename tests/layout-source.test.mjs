import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
