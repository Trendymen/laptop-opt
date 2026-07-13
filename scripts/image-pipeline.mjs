import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  createCacheKey,
  readCacheEntry,
  writeCacheEntryAtomic,
} from './image-cache.mjs';

const pipelineSourcePromise = readFile(fileURLToPath(import.meta.url));
const conversionVersions = {
  sharp: sharp.versions.sharp,
  vips: sharp.versions.vips,
};

async function decodeVisualPixels(input) {
  return sharp(input, { failOn: 'error', limitInputPixels: false })
    .autoOrient()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

export async function convertAsset(
  asset,
  root = process.cwd(),
  { cacheDir = resolve(root, '.cache/image-pipeline') } = {},
) {
  const sourcePath = resolve(root, 'assets/source', asset.source);
  const source = await readFile(sourcePath);
  const key = createCacheKey({
    source,
    asset,
    pipelineSource: await pipelineSourcePromise,
    versions: conversionVersions,
  });
  const cached = await readCacheEntry(cacheDir, key, asset);
  if (cached) return { ...cached, cacheHit: true };

  const sourcePixels = await decodeVisualPixels(source);

  const { data: webp, info } = await sharp(source, { failOn: 'error', limitInputPixels: false })
    .autoOrient()
    .keepIccProfile()
    .webp({ lossless: true, exact: true, effort: 6, preset: asset.preset })
    .toBuffer({ resolveWithObject: true });

  const outputPixels = await decodeVisualPixels(webp);
  assert.equal(outputPixels.info.width, sourcePixels.info.width, `${asset.id}: width changed`);
  assert.equal(outputPixels.info.height, sourcePixels.info.height, `${asset.id}: height changed`);
  assert.equal(outputPixels.info.channels, sourcePixels.info.channels, `${asset.id}: channels changed`);
  assert.ok(outputPixels.data.equals(sourcePixels.data), `${asset.id}: decoded pixels changed`);

  const result = {
    id: asset.id,
    source: asset.source,
    sourceWidth: sourcePixels.info.width,
    sourceHeight: sourcePixels.info.height,
    width: info.width,
    height: info.height,
    bytes: webp.length,
    mimeType: 'image/webp',
    pixelIdentical: true,
    dataUri: `data:image/webp;base64,${webp.toString('base64')}`,
  };
  await writeCacheEntryAtomic(cacheDir, key, result);
  return { ...result, cacheHit: false };
}
