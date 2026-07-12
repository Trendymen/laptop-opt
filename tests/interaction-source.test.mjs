import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('motion and lightbox interactions are accessible', async () => {
  const client = await readFile('src/client.js', 'utf8');

  for (const token of [
    'prefers-reduced-motion: reduce',
    "dataset.capture === 'true'",
    'IntersectionObserver',
    "classList.add('is-visible')",
    "querySelectorAll('img[data-zoom]')",
    'image.tabIndex = 0',
    "setAttribute('role', 'button')",
    "image.addEventListener('click', open)",
    "image.addEventListener('keydown'",
    "event.key === 'Enter'",
    "event.key === ' '",
    'event.preventDefault()',
    'dialog.showModal()',
    'dialogImage.alt = image.alt',
    "closeButton.addEventListener('click'",
    'event.target === dialog',
    "event.key === 'Escape'",
    'dialog.open',
  ]) assert.ok(client.includes(token), `missing interaction invariant: ${token}`);
});
