import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('motion remains accessible while evidence and completed adjustments stay static and unfolded', async () => {
  const [client, template, css] = await Promise.all([
    readFile('src/client.js', 'utf8'),
    readFile('src/index.template.html', 'utf8'),
    readFile('src/styles.css', 'utf8'),
  ]);
  assert.match(client, /document\.documentElement\.classList\.add\('js-ready'\)/);
  assert.match(client, /prefers-reduced-motion/);
  assert.match(client, /dataset\.capture === 'true'/);
  assert.match(client, /IntersectionObserver/);
  assert.match(client, /classList\.add\('is-visible'\)/);
  for (const forbidden of [/showModal/, /data-zoom/, /image-dialog/, /window\.open/, /preventDefault/, /classList\.toggle/, /aria-expanded/]) {
    assert.doesNotMatch(client, forbidden);
  }
  assert.doesNotMatch(template, /data-zoom|<dialog|image-dialog|<details|<summary|data-(?:collapse|toggle)|aria-expanded/);
  assert.doesNotMatch(css, /cursor:\s*zoom-in|dialog\s*\{|dialog::backdrop/);
});
