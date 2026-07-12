import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('capture bootstrap marks the root before page rendering', async () => {
  const source = await readFile('src/capture-bootstrap.js', 'utf8');
  assert.match(source, /URLSearchParams/);
  assert.match(source, /dataset\.capture/);
  assert.match(source, /get\(['"]capture['"]\)/);
});
