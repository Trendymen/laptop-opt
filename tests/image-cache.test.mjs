import assert from 'node:assert/strict';
import test from 'node:test';
import { createCacheKey } from '../scripts/image-cache.mjs';

const base = {
  source: Buffer.from('source-a'),
  asset: {
    id: 'asset-a',
    source: 'asset-a.png',
    preset: 'text',
    webPMode: 'lossless',
  },
  pipelineSource: Buffer.from('pipeline-a'),
  versions: { sharp: '0.35.3', vips: '8.18.3' },
};

test('cache key is stable and invalidates every conversion input', () => {
  const key = createCacheKey(base);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(createCacheKey(base), key);

  const variants = [
    { ...base, source: Buffer.from('source-b') },
    { ...base, asset: { ...base.asset, id: 'asset-b' } },
    { ...base, asset: { ...base.asset, source: 'asset-b.png' } },
    { ...base, asset: { ...base.asset, preset: 'picture' } },
    { ...base, asset: { ...base.asset, webPMode: 'near-lossless' } },
    { ...base, pipelineSource: Buffer.from('pipeline-b') },
    { ...base, versions: { ...base.versions, sharp: '0.36.0' } },
    { ...base, versions: { ...base.versions, vips: '8.19.0' } },
  ];

  for (const variant of variants) {
    assert.notEqual(createCacheKey(variant), key);
  }
});

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  cachePathFor,
  readCacheEntry,
  writeCacheEntryAtomic,
} from '../scripts/image-cache.mjs';
import { defaultCacheDir } from '../scripts/build.mjs';
import { convertAsset } from '../scripts/image-pipeline.mjs';
import { integrationCacheDir } from './helpers/test-cache.mjs';

const cachedResult = {
  id: 'asset-a',
  source: 'asset-a.png',
  sourceWidth: 1,
  sourceHeight: 1,
  width: 1,
  height: 1,
  bytes: 4,
  mimeType: 'image/webp',
  pixelIdentical: true,
  dataUri: `data:image/webp;base64,${Buffer.from('webp').toString('base64')}`,
};

test('cache storage validates records and recovers from corruption', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'laptop-opt-image-cache-'));
  const asset = { id: cachedResult.id, source: cachedResult.source };
  const key = 'a'.repeat(64);

  try {
    await writeCacheEntryAtomic(cacheDir, key, cachedResult);
    assert.deepEqual(await readCacheEntry(cacheDir, key, asset), cachedResult);

    await writeFile(cachePathFor(cacheDir, key), '{"broken":', 'utf8');
    assert.equal(await readCacheEntry(cacheDir, key, asset), null);

    await Promise.all([
      writeCacheEntryAtomic(cacheDir, key, cachedResult),
      writeCacheEntryAtomic(cacheDir, key, cachedResult),
    ]);
    assert.deepEqual(await readCacheEntry(cacheDir, key, asset), cachedResult);
    assert.deepEqual(
      (await readdir(cacheDir)).filter((name) => name.endsWith('.tmp')),
      [],
    );
    const stored = await readFile(cachePathFor(cacheDir, key), 'utf8');
    assert.doesNotThrow(() => JSON.parse(stored));
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('convertAsset reuses verified output and invalidates changed source pixels', async () => {
  const root = await mkdtemp(join(tmpdir(), 'laptop-opt-convert-cache-'));
  const sourceDir = resolve(root, 'assets/source');
  const sourcePath = resolve(sourceDir, 'tiny.png');
  const cacheDir = resolve(root, '.cache/image-pipeline');
  const asset = {
    id: 'tiny',
    source: 'tiny.png',
    preset: 'text',
    webPMode: 'lossless',
  };

  try {
    await mkdir(sourceDir, { recursive: true });
    await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 20, g: 40, b: 60, alpha: 1 },
      },
    }).png().toFile(sourcePath);

    const first = await convertAsset(asset, root, { cacheDir });
    const second = await convertAsset(asset, root, { cacheDir });
    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.deepEqual(
      { ...second, cacheHit: false },
      first,
    );

    await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 90, g: 40, b: 60, alpha: 1 },
      },
    }).png().toFile(sourcePath);
    const changed = await convertAsset(asset, root, { cacheDir });
    assert.equal(changed.cacheHit, false);
    assert.notEqual(changed.dataUri, first.dataUri);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildPage forwards its configured cache directory', async () => {
  const source = await readFile('scripts/build.mjs', 'utf8');
  assert.match(source, /export async function buildPage\(\{[\s\S]*?cacheDir[\s\S]*?\}\s*=\s*\{\}\)/);
  assert.match(source, /convertAsset\(asset, root, \{ cacheDir \}\)/);
});

test('production builds and integration tests share the same persistent cache', () => {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  assert.equal(defaultCacheDir, resolve(projectRoot, '.cache/image-pipeline'));
  assert.equal(integrationCacheDir, defaultCacheDir);
});
