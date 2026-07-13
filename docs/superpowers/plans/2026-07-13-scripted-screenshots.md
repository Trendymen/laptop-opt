# Scripted High-Density Screenshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one repeatable command that builds the page and produces exactly one PC 2x and one mobile 3x full-page screenshot with runtime and pixel-dimension verification.

**Architecture:** Keep capture profiles in a small dependency-free module so ordinary tests remain fast. A Playwright orchestration module owns the build, ephemeral HTTP server, isolated browser contexts, page audit, screenshots, and cleanup; a browser integration test is exposed separately as `npm run capture:verify` so `npm test` does not regress to ten-second runtime.

**Tech Stack:** Node.js ESM, node:test, Playwright Chromium, Sharp, existing build and image cache.

## Global Constraints

- PC profile is CSS viewport `1440 × 900`, DPR `2`, output `output/playwright/pc-1440-2x.png`, physical width `2880px`.
- Mobile profile is CSS viewport `390 × 844`, DPR `3`, output `output/playwright/mobile-390-3x.png`, physical width `1170px`.
- Capture must build first, use `?capture=1`, wait for fonts and exactly 10 loaded images, and reject horizontal overflow, internal scrolling, browser errors, and resource failures.
- Browser and ephemeral HTTP server must close on both success and failure.
- Ordinary `npm test` must only run fast profile tests; real browser capture belongs to `npm run capture:verify`.
- Remove superseded 1x and extra-DPR screenshots, leaving only the two canonical outputs.
- Work directly in the current workspace as requested; do not create or switch to a worktree.

---

### Task 1: Lock the two capture profiles with fast tests

**Files:**
- Create: `tests/capture.test.mjs`
- Create: `scripts/capture-config.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `captureProfiles: readonly CaptureProfile[]` and `expectedPixelWidth(profile): number`.
- `CaptureProfile` fields: `id`, `viewport.width`, `viewport.height`, `deviceScaleFactor`, and repository-relative `output`.

- [ ] **Step 1: Write the failing profile test**

Create `tests/capture.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/capture.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/capture-config.mjs`.

- [ ] **Step 3: Add the minimal profile implementation**

Create `scripts/capture-config.mjs`:

```js
export const captureProfiles = Object.freeze([
  Object.freeze({
    id: 'pc',
    viewport: Object.freeze({ width: 1440, height: 900 }),
    deviceScaleFactor: 2,
    output: 'output/playwright/pc-1440-2x.png',
  }),
  Object.freeze({
    id: 'mobile',
    viewport: Object.freeze({ width: 390, height: 844 }),
    deviceScaleFactor: 3,
    output: 'output/playwright/mobile-390-3x.png',
  }),
]);

export function expectedPixelWidth(profile) {
  return profile.viewport.width * profile.deviceScaleFactor;
}
```

- [ ] **Step 4: Register only the fast test in the ordinary suite**

Modify `package.json` so its explicit ordinary test list includes `tests/capture.test.mjs` without adding a browser command yet:

```json
{
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "node --test --test-concurrency=1 tests/assets.test.mjs tests/image-cache.test.mjs tests/image-pipeline.test.mjs tests/build.test.mjs tests/capture-source.test.mjs tests/capture.test.mjs tests/content.test.mjs tests/layout-source.test.mjs tests/interaction-source.test.mjs",
    "verify": "npm test && npm run build && node scripts/validate-html.mjs",
    "serve": "node scripts/serve.mjs"
  }
}
```

- [ ] **Step 5: Run the focused test and full fast suite**

Run:

```bash
node --test tests/capture.test.mjs
npm test
git diff --check
```

Expected: profile test PASS; the full fast suite remains PASS and completes in the existing warm-cache range rather than launching a browser.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json scripts/capture-config.mjs tests/capture.test.mjs
git commit -m "test: define high-density capture profiles"
```

---

### Task 2: Implement self-contained Playwright capture and verification

**Files:**
- Create: `scripts/capture.mjs`
- Create: `tests/capture-integration.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `output/playwright/content-priority-1440.png`
- Delete: `output/playwright/content-priority-390.png`
- Delete: `output/playwright/mobile-400-2x.png`
- Delete: `output/playwright/mobile-400-3x.png`
- Delete: `output/playwright/pc-1440-2x.png`
- Delete: `output/playwright/pc-1440-3x.png`
- Create: `output/playwright/pc-1440-2x.png`
- Create: `output/playwright/mobile-390-3x.png`

**Interfaces:**
- Consumes: `buildPage()`, `outputPath`, `captureProfiles`, and Playwright `chromium`.
- Produces: `captureScreenshots(): Promise<{ serverUrl: string, captures: CaptureResult[] }>`; each `CaptureResult` contains `profile`, `outputPath`, and the successful runtime `audit`.

- [ ] **Step 1: Write the failing browser integration test**

Create `tests/capture-integration.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the browser test and verify RED**

Run:

```bash
node --test tests/capture-integration.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/capture.mjs`.

- [ ] **Step 3: Install Playwright and register the browser commands**

Run:

```bash
npm install --save-dev playwright
```

Add these two entries to `package.json` scripts without changing the ordinary test list:

```json
{
  "capture": "node scripts/capture.mjs",
  "capture:verify": "node --test tests/capture-integration.test.mjs"
}
```

- [ ] **Step 4: Implement the capture lifecycle**

Create `scripts/capture.mjs` with these exact responsibilities:

```js
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildPage, outputPath as htmlPath } from './build.mjs';
import { captureProfiles } from './capture-config.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function startServer(html) {
  const server = createServer((request, response) => {
    if (request.url === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Capture server has no TCP address');
  return { server, url: `http://127.0.0.1:${address.port}/?capture=1` };
}

async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function formatBrowserFailures(profile, failures) {
  return failures.map((failure) => `[${profile.id}] ${failure}`).join('\n');
}

export async function captureScreenshots() {
  await buildPage();
  const html = await readFile(htmlPath);
  const { server, url } = await startServer(html);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const captures = [];
    for (const profile of captureProfiles) {
      const context = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
      });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        const failures = [];
        page.on('console', (message) => {
          if (message.type() === 'error') failures.push(`console: ${message.text()}`);
        });
        page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
        page.on('requestfailed', (request) => {
          failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`.trim());
        });

        await page.goto(url, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => {
          const images = [...document.querySelectorAll('img[src]')];
          return images.length === 10
            && images.every((image) => image.complete && image.naturalWidth > 0);
        });

        const audit = await page.evaluate(() => {
          const images = [...document.querySelectorAll('img[src]')];
          const internalScrollers = [...document.querySelectorAll('body *')].filter((element) => {
            const style = getComputedStyle(element);
            return /(auto|scroll)/.test(style.overflowY)
              && element.scrollHeight > element.clientHeight;
          }).length;
          return {
            captureMode: document.documentElement.dataset.capture === 'true',
            scrollingElement: document.scrollingElement?.tagName ?? null,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            internalScrollers,
            imageCount: images.length,
            loadedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length,
          };
        });

        const auditFailures = Object.entries({
          captureMode: audit.captureMode === true,
          scrollingElement: audit.scrollingElement === 'HTML',
          horizontalOverflow: audit.horizontalOverflow === false,
          internalScrollers: audit.internalScrollers === 0,
          imageCount: audit.imageCount === 10,
          loadedImages: audit.loadedImages === 10,
        }).filter(([, valid]) => !valid).map(([name]) => `${name}: ${JSON.stringify(audit[name])}`);
        failures.push(...auditFailures);
        if (failures.length) throw new Error(formatBrowserFailures(profile, failures));

        const absoluteOutput = resolve(root, profile.output);
        await mkdir(dirname(absoluteOutput), { recursive: true });
        await page.screenshot({ path: absoluteOutput, type: 'png', fullPage: true, animations: 'disabled' });
        captures.push({ profile, outputPath: absoluteOutput, audit });
      } finally {
        await context.close();
      }
    }
    return { serverUrl: url, captures };
  } finally {
    await browser?.close();
    await closeServer(server);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await captureScreenshots();
  for (const capture of result.captures) console.log(capture.outputPath);
}
```

- [ ] **Step 5: Run the integration test and fix only observed failures**

Run:

```bash
npm run capture:verify
```

Expected: PASS; both PNGs exist at the canonical paths with widths `2880px` and `1170px`, and fetching the returned ephemeral URL fails because the server is closed.

- [ ] **Step 6: Remove superseded screenshots and generate canonical outputs**

Delete:

```text
output/playwright/content-priority-1440.png
output/playwright/content-priority-390.png
output/playwright/mobile-400-2x.png
output/playwright/mobile-400-3x.png
output/playwright/pc-1440-3x.png
```

`output/playwright/pc-1440-2x.png` is overwritten by the scripted capture. Run:

```bash
npm run capture
```

Expected: stdout lists only the absolute PC 2x and mobile 3x output paths.

- [ ] **Step 7: Verify the complete project and screenshot metadata**

Run:

```bash
npm run verify
npm run capture:verify
node --input-type=module -e "import sharp from 'sharp'; for (const file of ['output/playwright/pc-1440-2x.png','output/playwright/mobile-390-3x.png']) { const m = await sharp(file).metadata(); console.log(file, m.width, m.height, m.format); }"
git diff --check
git status --short
```

Expected: 38 fast tests PASS, standalone HTML validation passes, capture verification passes, metadata widths are `2880` and `1170`, and only intentional script/test/dependency/screenshot changes remain.

- [ ] **Step 8: Visually inspect both canonical screenshots**

Inspect:

```text
output/playwright/pc-1440-2x.png
output/playwright/mobile-390-3x.png
```

Expected: desktop Hero uses three columns, mobile Hero uses one column, chapter order is 01–04 then appendix, all screenshots are sharp and unclipped, and the final memory/UMAF appendix is visible rather than folded.

- [ ] **Step 9: Commit Task 2**

```bash
git add scripts/capture.mjs tests/capture-integration.test.mjs output/playwright package.json package-lock.json dist/index.html
git commit -m "feat: script PC and mobile screenshots"
```

---

### Task 3: Final independent review and diagnostics record

**Files:**
- Modify only if review finds a verified issue in Task 1 or Task 2 scope.

**Interfaces:**
- Consumes: complete branch diff from `origin/master` to `HEAD` and both design specifications.
- Produces: zero unresolved Critical or Important findings and a recorded diagnostics limitation if `vscode_mcp_server` is unavailable.

- [ ] **Step 1: Request an independent whole-branch review**

Review cache key correctness and corruption handling, warm-test reuse, capture cleanup, runtime audit strictness, exact output profiles, page hierarchy, and source-contract tests against:

```text
docs/superpowers/specs/2026-07-13-build-cache-design.md
docs/superpowers/specs/2026-07-13-content-priority-redesign.md
docs/superpowers/specs/2026-07-13-scripted-screenshot-design.md
```

Expected: reviewer reports findings by Critical, Important, and Minor severity.

- [ ] **Step 2: Resolve findings and rerun verification**

For every Critical or Important finding, add a failing regression test, observe RED, apply the smallest fix, then rerun:

```bash
npm run verify
npm run capture:verify
```

Expected: both commands PASS after fixes.

- [ ] **Step 3: Run touched-file diagnostics if available**

Use `vscode_mcp_server` diagnostics for modified `.mjs`, JSON, CSS, and HTML sources. If the tool is absent, explicitly record that diagnostics were skipped because the MCP tool was unavailable; do not claim diagnostics passed.

- [ ] **Step 4: Confirm clean completion state**

Run:

```bash
git status --short
git log --oneline --decorate -15
```

Expected: worktree is clean and all implementation commits are on the current `master`; no push is performed unless separately requested.
