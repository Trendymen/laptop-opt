import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { captureScreenshots } from '../scripts/capture.mjs';
import { expectedPixelWidth } from '../scripts/capture-config.mjs';

async function waitForOpacity(locator, minimum, timeoutMs = 2_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const opacity = Number(await locator.evaluate((node) => getComputedStyle(node).opacity));
    if (opacity >= minimum) return opacity;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(`Timed out waiting for opacity >= ${minimum}`);
}

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

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1440, height: 900 },
    });
    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(resolve('dist/index.html')).href);
      const revealItems = page.locator('[data-reveal]');
      const visibility = await revealItems.evaluateAll((nodes) => (
        nodes.map((node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return {
            opacity: style.opacity,
            visibility: style.visibility,
            display: style.display,
            width: rect.width,
            height: rect.height,
          };
        })
      ));
      assert.equal(visibility.length, 6);
      for (const state of visibility) {
        assert.ok(Number(state.opacity) >= 0.7, `content must never be invisible: ${state.opacity}`);
        assert.equal(state.visibility, 'visible');
        assert.notEqual(state.display, 'none');
        assert.ok(state.width > 0);
        assert.ok(state.height > 0);
      }
      for (let index = 0; index < visibility.length; index += 1) {
        const item = revealItems.nth(index);
        await item.scrollIntoViewIfNeeded();
        const opacity = await waitForOpacity(item, 0.99);
        assert.ok(opacity >= 0.99, `revealed content ${index} must be fully opaque: ${opacity}`);
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
