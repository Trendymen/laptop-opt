# 图片转换持久缓存实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为无损 WebP 转换增加内容寻址的持久缓存，使首次冷构建保持现有质量校验，后续测试与构建直接复用已验证结果。

**Architecture:** 新增独立 `scripts/image-cache.mjs` 负责缓存键、记录校验和原子 I/O；`scripts/image-pipeline.mjs` 继续负责 Sharp 转换，只在 miss 时执行。测试级集成使用固定的忽略目录跨 Node 测试进程复用，validator 用例在单文件内共享同一份生成 HTML。

**Tech Stack:** Node.js ESM、node:test、node:crypto、node:fs/promises、Sharp 0.35.3

## Global Constraints

- 首次无缓存构建允许约 13 秒，热缓存第二次 `npm test` 本机目标不超过 5 秒。
- 热缓存下单个 validator 测试不得触发 Sharp 转换，本机目标不超过 1 秒。
- WebP 参数、RGBA 像素一致性校验、10 张图片和最终 HTML 字节语义保持不变。
- 图片或 manifest 变化只失效对应图片；pipeline、Sharp 或 libvips 变化失效全部图片。
- 模板、CSS、capture bootstrap 和客户端脚本每次重新读取，不缓存整页 HTML。
- 缓存文件位于 `.cache/`，不得提交；不得增加 npm 依赖。

---

### Task 1: 内容寻址缓存存储层

**Files:**
- Create: `scripts/image-cache.mjs`
- Create: `tests/image-cache.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `createCacheKey({ source, asset, pipelineSource, versions }): string`
- Produces: `cachePathFor(cacheDir, key): string`
- Produces: `readCacheEntry(cacheDir, key, asset): Promise<object | null>`
- Produces: `writeCacheEntryAtomic(cacheDir, key, result): Promise<void>`

- [ ] **Step 1: Write failing deterministic-key tests**

Create `tests/image-cache.test.mjs` with:

```js
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
```

Add `tests/image-cache.test.mjs` immediately after `tests/assets.test.mjs` in the explicit `package.json` test script.

- [ ] **Step 2: Run the key test and verify RED**

Run:

```bash
node --test tests/image-cache.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/image-cache.mjs`.

- [ ] **Step 3: Implement the complete cache module**

Create `scripts/image-cache.mjs`:

```js
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SCHEMA_VERSION = 1;
const DATA_URI_PREFIX = 'data:image/webp;base64,';

function addPart(hash, label, value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  hash.update(`${label}\0${buffer.length}\0`);
  hash.update(buffer);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function createCacheKey({ source, asset, pipelineSource, versions }) {
  const hash = createHash('sha256');
  addPart(hash, 'schema', String(SCHEMA_VERSION));
  addPart(hash, 'source-bytes', source);
  addPart(hash, 'manifest', JSON.stringify({
    id: asset.id,
    source: asset.source,
    preset: asset.preset ?? null,
    webPMode: asset.webPMode ?? null,
  }));
  addPart(hash, 'pipeline-source', pipelineSource);
  addPart(hash, 'versions', JSON.stringify({
    sharp: versions.sharp,
    vips: versions.vips,
  }));
  return hash.digest('hex');
}

export function cachePathFor(cacheDir, key) {
  return resolve(cacheDir, `${key}.json`);
}

function validateEntry(entry, key, asset) {
  if (entry?.schemaVersion !== SCHEMA_VERSION || entry.key !== key) return null;
  const result = entry.result;
  if (!result || result.id !== asset.id || result.source !== asset.source) return null;
  if (![result.sourceWidth, result.sourceHeight, result.width, result.height].every(isPositiveInteger)) return null;
  if (result.sourceWidth !== result.width || result.sourceHeight !== result.height) return null;
  if (result.mimeType !== 'image/webp' || result.pixelIdentical !== true) return null;
  if (typeof result.dataUri !== 'string' || !result.dataUri.startsWith(DATA_URI_PREFIX)) return null;

  const webp = Buffer.from(result.dataUri.slice(DATA_URI_PREFIX.length), 'base64');
  if (webp.length !== result.bytes || sha256(webp) !== entry.webpSha256) return null;
  return result;
}

export async function readCacheEntry(cacheDir, key, asset) {
  const path = cachePathFor(cacheDir, key);
  try {
    const entry = JSON.parse(await readFile(path, 'utf8'));
    const result = validateEntry(entry, key, asset);
    if (result) return result;
    await rm(path, { force: true });
    return null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      await rm(path, { force: true });
      return null;
    }
    throw error;
  }
}

export async function writeCacheEntryAtomic(cacheDir, key, result) {
  await mkdir(cacheDir, { recursive: true });
  const finalPath = cachePathFor(cacheDir, key);
  const temporaryPath = resolve(cacheDir, `.${key}.${process.pid}.${randomUUID()}.tmp`);
  const webp = Buffer.from(result.dataUri.slice(DATA_URI_PREFIX.length), 'base64');
  const entry = {
    schemaVersion: SCHEMA_VERSION,
    key,
    webpSha256: sha256(webp),
    result,
  };

  try {
    await writeFile(temporaryPath, JSON.stringify(entry), { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, finalPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
```

- [ ] **Step 4: Add storage corruption and atomic-write tests**

Append to `tests/image-cache.test.mjs`:

```js
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cachePathFor,
  readCacheEntry,
  writeCacheEntryAtomic,
} from '../scripts/image-cache.mjs';

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
```

- [ ] **Step 5: Run cache storage tests and commit**

Run:

```bash
node --test tests/image-cache.test.mjs
git diff --check
```

Expected: 2 tests PASS and no whitespace errors.

Commit:

```bash
git add package.json scripts/image-cache.mjs tests/image-cache.test.mjs
git commit -m "feat: add verified image cache storage"
```

---

### Task 2: Cache-aware image conversion

**Files:**
- Modify: `scripts/image-pipeline.mjs`
- Modify: `tests/image-cache.test.mjs`

**Interfaces:**
- Consumes: Task 1 cache functions.
- Produces: `convertAsset(asset, root, { cacheDir }?): Promise<ConversionResult & { cacheHit: boolean }>`

- [ ] **Step 1: Write a failing real-conversion cache test**

Append to `tests/image-cache.test.mjs`:

```js
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { convertAsset } from '../scripts/image-pipeline.mjs';

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
```

- [ ] **Step 2: Run the conversion test and verify RED**

Run:

```bash
node --test --test-name-pattern='convertAsset reuses' tests/image-cache.test.mjs
```

Expected: FAIL because the third options argument is ignored and `cacheHit` is missing.

- [ ] **Step 3: Integrate the cache into `convertAsset`**

Update imports in `scripts/image-pipeline.mjs`:

```js
import { fileURLToPath } from 'node:url';
import {
  createCacheKey,
  readCacheEntry,
  writeCacheEntryAtomic,
} from './image-cache.mjs';
```

Add module constants:

```js
const pipelineSourcePromise = readFile(fileURLToPath(import.meta.url));
const conversionVersions = {
  sharp: sharp.versions.sharp,
  vips: sharp.versions.vips,
};
```

Replace `scripts/image-pipeline.mjs` with this complete cache-aware version:

```js
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
```

- [ ] **Step 4: Verify GREEN and corrupted-cache fallback**

Run:

```bash
node --test tests/image-cache.test.mjs tests/image-pipeline.test.mjs
```

Expected: all cache and representative real-image tests PASS.

- [ ] **Step 5: Commit cache-aware conversion**

```bash
git add scripts/image-pipeline.mjs tests/image-cache.test.mjs
git commit -m "feat: reuse verified image conversions"
```

---

### Task 3: Reuse cached assets and generated HTML across tests and builds

**Files:**
- Create: `tests/helpers/test-cache.mjs`
- Modify: `scripts/build.mjs`
- Modify: `tests/image-cache.test.mjs`
- Modify: `tests/build.test.mjs`
- Modify: `tests/content.test.mjs`
- Modify: `tests/image-pipeline.test.mjs`
- Modify: `docs/superpowers/specs/2026-07-13-build-cache-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-image-cache.md`

**Interfaces:**
- Produces: `integrationCacheDir: string`
- Produces: `defaultCacheDir: string`
- Produces: `buildPage({ cacheDir }?): Promise<Array<ConversionResult & { cacheHit: boolean }>>`

- [ ] **Step 1: Add the shared test cache path and a failing build wiring contract**

Create `tests/helpers/test-cache.mjs`:

```js
import { defaultCacheDir } from '../../scripts/build.mjs';

export const integrationCacheDir = defaultCacheDir;
```

Append this fast source contract to `tests/image-cache.test.mjs`:

```js
test('buildPage forwards its configured cache directory', async () => {
  const source = await readFile('scripts/build.mjs', 'utf8');
  assert.match(source, /export async function buildPage\(\{[\s\S]*?cacheDir[\s\S]*?\}\s*=\s*\{\}\)/);
  assert.match(source, /convertAsset\(asset, root, \{ cacheDir \}\)/);
});
```

Run:

```bash
node --test --test-name-pattern='buildPage forwards' tests/image-cache.test.mjs
```

Expected: FAIL because `buildPage()` has no options parameter and calls `convertAsset(asset, root)`.

- [ ] **Step 2: Pass the cache directory through `buildPage`**

Expose the production cache path and use it as the function default in `scripts/build.mjs`:

```js
export const defaultCacheDir = resolve(root, '.cache/image-pipeline');

export async function buildPage({
  cacheDir = defaultCacheDir,
} = {}) {
}
```

Inside its existing asset loop, replace the conversion call with this exact line and leave the surrounding template reads, placeholder validation, legacy cleanup and output write unchanged:

```js
const converted = await convertAsset(asset, root, { cacheDir });
```

In `tests/build.test.mjs`, import `integrationCacheDir` and update the canonical artifact test to call:

```js
const report = await buildPage({ cacheDir: integrationCacheDir });
assert.equal(report.length, 10);
```

- [ ] **Step 3: Share one generated HTML value inside validator tests**

At module scope in `tests/build.test.mjs` add:

```js
let generatedHtmlPromise;

function getGeneratedHtml() {
  generatedHtmlPromise ??= buildPage({ cacheDir: integrationCacheDir })
    .then(() => readFile(outputPath, 'utf8'));
  return generatedHtmlPromise;
}
```

In every validator test replace:

```js
await buildPage();
const html = await readFile(outputPath, 'utf8');
```

with:

```js
const html = await getGeneratedHtml();
```

Keep the canonical artifact test as the only test that directly prepares output paths and invokes `buildPage`.

In `tests/content.test.mjs`, import `integrationCacheDir` and call:

```js
await buildPage({ cacheDir: integrationCacheDir });
```

In `tests/image-pipeline.test.mjs`, import the same constant and call:

```js
const result = await convertAsset(asset, process.cwd(), {
  cacheDir: integrationCacheDir,
});
```

- [ ] **Step 4: Verify functional behavior**

Run:

```bash
node --test --test-concurrency=1 tests/image-cache.test.mjs tests/image-pipeline.test.mjs tests/build.test.mjs tests/content.test.mjs
npm run verify
git diff --check
```

Expected: all tests, build and standalone validator PASS; the final HTML still contains ten WebP Data URIs.

- [ ] **Step 5: Measure cold and warm performance**

Run:

```bash
node --input-type=module -e "import {rm} from 'node:fs/promises'; await rm('.cache/image-pipeline', {recursive: true, force: true})"
/usr/bin/time -p npm run build
/usr/bin/time -p npm test
/usr/bin/time -p npm run build
node --input-type=module -e "import {rm} from 'node:fs/promises'; await rm('.cache/image-pipeline', {recursive: true, force: true})"
/usr/bin/time -p npm test
/usr/bin/time -p npm run build
node --test --test-concurrency=1 --test-name-pattern='validator rejects visible implementation copy' tests/build.test.mjs
git status --short
```

Expected on this machine:

- cold build performs real conversions and remains near the existing 13-second conversion floor;
- the immediately following test run and build both reuse that cache and remain below 5 seconds;
- a cold test followed by a build also proves the reverse reuse direction;
- focused warm validator is below 1 second;
- only ignored `.cache` files are created.

Do not encode wall-clock thresholds as automated assertions.

- [ ] **Step 6: Commit test reuse and performance integration**

```bash
git add scripts/build.mjs tests/helpers/test-cache.mjs tests/image-cache.test.mjs tests/build.test.mjs tests/content.test.mjs tests/image-pipeline.test.mjs docs/superpowers/specs/2026-07-13-build-cache-design.md docs/superpowers/plans/2026-07-13-image-cache.md
git commit -m "test: reuse cached page assets"
```

---

### Task 4: Final verification and review

**Files:**
- Verify all files changed by Tasks 1–3.

- [ ] **Step 1: Run fresh complete verification**

```bash
npm run verify
git diff --check
git status --short --branch
```

Expected: full suite passes, build writes `dist/index.html`, validator passes, and no cache files are tracked.

- [ ] **Step 2: Run touched-file diagnostics**

Use `vscode_mcp_server` for:

- `scripts/image-cache.mjs`
- `scripts/image-pipeline.mjs`
- `scripts/build.mjs`
- `tests/image-cache.test.mjs`
- `tests/build.test.mjs`
- `tests/content.test.mjs`
- `tests/image-pipeline.test.mjs`

If unavailable, record the skipped diagnostics and reason.

- [ ] **Step 3: Request independent code review**

Review the complete cache implementation against `docs/superpowers/specs/2026-07-13-build-cache-design.md`. Fix every Critical or Important issue, rerun affected tests, and reuse the same reviewer for re-review.

- [ ] **Step 4: Record final benchmark evidence**

Report cold test time, warm test time, focused validator time, cache file count, and whether any cache entry was tracked by Git.
