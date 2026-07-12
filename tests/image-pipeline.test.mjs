import assert from 'node:assert/strict';
import test from 'node:test';
import { assets } from '../src/assets.mjs';
import { convertAsset } from '../scripts/image-pipeline.mjs';

for (const id of ['device-hero', 'uxtu-undervolt', 'memory-stable']) {
  test(`${id} converts to pixel-identical WebP`, async () => {
    const asset = assets.find((candidate) => candidate.id === id);
    const result = await convertAsset(asset);
    assert.equal(result.mimeType, 'image/webp');
    assert.equal(result.width, result.sourceWidth);
    assert.equal(result.height, result.sourceHeight);
    assert.equal(result.pixelIdentical, true);
    assert.match(result.dataUri, /^data:image\/webp;base64,/);
  });
}
