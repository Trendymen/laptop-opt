import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { captureScreenshots } from '../scripts/capture.mjs';
import { expectedPixelWidth } from '../scripts/capture-config.mjs';

test('capture script writes verified full-page PNGs and releases its server', async () => {
  const result = await captureScreenshots();

  assert.equal(result.captures.length, 2);
  for (const capture of result.captures) {
    await access(capture.outputPath);
    const metadata = await sharp(capture.outputPath).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, expectedPixelWidth(capture.profile));
    assert.ok(
      metadata.height > capture.profile.viewport.height * capture.profile.deviceScaleFactor,
      `${capture.profile.id} must be a full-page screenshot`,
    );
    assert.deepEqual(capture.audit, {
      captureMode: true,
      scrollingElement: 'HTML',
      horizontalOverflow: false,
      internalScrollers: 0,
      imageCount: 10,
      loadedImages: 10,
    });
  }

  await assert.rejects(fetch(result.serverUrl));
});
