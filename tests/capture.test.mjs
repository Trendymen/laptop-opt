import assert from 'node:assert/strict';
import test from 'node:test';
import { captureProfiles, expectedPixelWidth } from '../scripts/capture-config.mjs';

test('capture profiles keep one PC 2x and one mobile 3x output', () => {
  assert.deepEqual(captureProfiles, [
    {
      id: 'pc',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      output: 'output/playwright/pc-1440-2x.png',
    },
    {
      id: 'mobile',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      output: 'output/playwright/mobile-390-3x.png',
    },
  ]);
});

test('capture profiles produce the approved physical widths', () => {
  assert.deepEqual(captureProfiles.map(expectedPixelWidth), [2880, 1170]);
});
