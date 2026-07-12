import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

async function decodeVisualPixels(input) {
  return sharp(input, { failOn: 'error', limitInputPixels: false })
    .autoOrient()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

export async function convertAsset(asset, root = process.cwd()) {
  const sourcePath = resolve(root, 'assets/source', asset.source);
  const source = await readFile(sourcePath);
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

  return {
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
}
