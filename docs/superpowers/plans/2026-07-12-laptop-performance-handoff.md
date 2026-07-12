# Laptop Performance Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-width, screenshot-friendly Chinese device handoff page whose ten source images are converted to lossless WebP, embedded into one standalone HTML file, and paired with accurate recovery guidance.

**Architecture:** Keep authoring files split into one semantic HTML template, one stylesheet, one capture bootstrap, and one interaction script. A Node ESM build pipeline converts each source image to full-resolution lossless WebP, verifies decoded pixels, embeds all assets/CSS/JavaScript as Data URIs or inline blocks, then writes one distributable HTML file. Node built-in tests cover the asset manifest, image fidelity, content semantics, forbidden user-visible implementation copy, and build invariants; Playwright CLI covers real-browser layout, scrolling, console, capture mode, and full-page screenshots.

**Tech Stack:** Node.js 22, npm, Sharp 0.35.3, semantic HTML5, native CSS, native browser JavaScript, Node `node:test`, Playwright CLI.

---

## File map

- `package.json`: npm scripts and pinned Sharp dependency.
- `package-lock.json`: reproducible dependency resolution.
- `.gitignore`: local dependencies, temporary image output, and browser QA artifacts.
- `assets/source/*`: untouched copies of the ten user-provided source images.
- `src/assets.mjs`: canonical source-image manifest, IDs, alt text, and WebP mode.
- `src/index.template.html`: semantic page content and build placeholders.
- `src/styles.css`: complete A-direction visual system, full-width layout, responsive and capture styles.
- `src/capture-bootstrap.js`: first-frame `?capture=1` handling.
- `src/client.js`: reveal sequence and accessible image lightbox.
- `scripts/image-pipeline.mjs`: lossless WebP conversion and decoded-pixel verification.
- `scripts/build.mjs`: asset conversion, template replacement, and standalone HTML generation.
- `scripts/validate-html.mjs`: final output invariants and visible-copy checks.
- `scripts/serve.mjs`: minimal local server for browser QA.
- `tests/assets.test.mjs`: manifest and source-file coverage.
- `tests/image-pipeline.test.mjs`: WebP fidelity and dimensions.
- `tests/build.test.mjs`: one-file build and resource inlining.
- `tests/capture-source.test.mjs`: first-frame capture bootstrap contract.
- `tests/content.test.mjs`: device-specific facts, tutorials, recovery wording, and forbidden copy.
- `tests/layout-source.test.mjs`: font scale, full-width canvas, capture CSS, and no inner scrolling rules.
- `tests/interaction-source.test.mjs`: reduced-motion, reveal, and accessible image-zoom behavior.
- `dist/laptop-performance-handoff.html`: final standalone deliverable.

### Task 1: Project scaffold, source assets, and manifest

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Modify: `.gitignore`
- Create: `assets/source/0083320320e8ffb8.jpg.avif`
- Create: `assets/source/调整定频.jpg`
- Create: `assets/source/控制台设置-自定义模式设置.png`
- Create: `assets/source/控制台设置-显卡模式.png`
- Create: `assets/source/控制台设置电源模式.png`
- Create: `assets/source/UXTU负压(Universal x86 Tuning Utility).png`
- Create: `assets/source/UXTU开机没自启，手动打开也没反应删除配置文件.png`
- Create: `assets/source/内存超频后参数.png`
- Create: `assets/source/UMAF内存时序调整1-DDR SPD Timing.jpg`
- Create: `assets/source/UMAF内存时序调整2-DDR Non-SPD Timing.jpg`
- Create: `tests/assets.test.mjs`
- Create: `src/assets.mjs`

- [ ] **Step 1: Create the npm scaffold**

```json
{
  "name": "laptop-performance-handoff",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "node --test --test-concurrency=1 tests/assets.test.mjs",
    "verify": "npm test && npm run build && node scripts/validate-html.mjs",
    "serve": "node scripts/serve.mjs"
  },
  "dependencies": {
    "sharp": "0.35.3"
  }
}
```

Add these entries to `.gitignore`:

```gitignore
node_modules/
.cache/
output/playwright/
```

- [ ] **Step 2: Install the pinned dependency**

Run: `npm install`

Expected: `package-lock.json` is created and `npm ls sharp` reports `sharp@0.35.3`.

- [ ] **Step 3: Copy the ten source images without modifying the originals**

```powershell
New-Item -ItemType Directory -Force -Path 'assets\source' | Out-Null
Copy-Item -LiteralPath 'C:\Users\lz199\Desktop\0083320320e8ffb8.jpg.avif' -Destination 'assets\source\0083320320e8ffb8.jpg.avif'
Copy-Item -LiteralPath 'C:\Users\lz199\Desktop\调整定频.jpg' -Destination 'assets\source\调整定频.jpg'
Copy-Item -LiteralPath 'C:\Users\lz199\Desktop\控制台设置-自定义模式设置.png' -Destination 'assets\source\控制台设置-自定义模式设置.png'
Copy-Item -LiteralPath 'C:\Users\lz199\Desktop\控制台设置-显卡模式.png' -Destination 'assets\source\控制台设置-显卡模式.png'
Copy-Item -LiteralPath 'C:\Users\lz199\Desktop\控制台设置电源模式.png' -Destination 'assets\source\控制台设置电源模式.png'
Copy-Item -LiteralPath 'C:\Users\lz199\Desktop\UXTU负压(Universal x86 Tuning Utility).png' -Destination 'assets\source\UXTU负压(Universal x86 Tuning Utility).png'
Copy-Item -LiteralPath 'C:\Users\lz199\Desktop\UXTU开机没自启，手动打开也没反应删除配置文件.png' -Destination 'assets\source\UXTU开机没自启，手动打开也没反应删除配置文件.png'
Copy-Item -LiteralPath 'C:\Users\lz199\Desktop\内存超频后参数.png' -Destination 'assets\source\内存超频后参数.png'
Copy-Item -LiteralPath 'C:\Users\lz199\Desktop\UMAF内存时序调整1-DDR SPD Timing.jpg' -Destination 'assets\source\UMAF内存时序调整1-DDR SPD Timing.jpg'
Copy-Item -LiteralPath 'C:\Users\lz199\Desktop\UMAF内存时序调整2-DDR Non-SPD Timing.jpg' -Destination 'assets\source\UMAF内存时序调整2-DDR Non-SPD Timing.jpg'
```

- [ ] **Step 4: Write the failing asset-manifest test**

```js
// tests/assets.test.mjs
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';
import { assets } from '../src/assets.mjs';

const expected = [
  '0083320320e8ffb8.jpg.avif',
  '调整定频.jpg',
  '控制台设置-自定义模式设置.png',
  '控制台设置-显卡模式.png',
  '控制台设置电源模式.png',
  'UXTU负压(Universal x86 Tuning Utility).png',
  'UXTU开机没自启，手动打开也没反应删除配置文件.png',
  '内存超频后参数.png',
  'UMAF内存时序调整1-DDR SPD Timing.jpg',
  'UMAF内存时序调整2-DDR Non-SPD Timing.jpg',
];

test('manifest covers all ten source images exactly once', async () => {
  assert.deepEqual(assets.map((asset) => asset.source), expected);
  assert.equal(new Set(assets.map((asset) => asset.id)).size, 10);
  assert.ok(assets.every((asset) => asset.webPMode === 'lossless'));
  await Promise.all(assets.map((asset) => access(`assets/source/${asset.source}`)));
});
```

- [ ] **Step 5: Run the test and verify RED**

Run: `node --test tests/assets.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/assets.mjs`.

- [ ] **Step 6: Create the canonical manifest**

```js
// src/assets.mjs
export const assets = [
  { id: 'device-hero', source: '0083320320e8ffb8.jpg.avif', webPMode: 'lossless', preset: 'picture', alt: '机械革命蛟龙 16 Pro 配置宣传图' },
  { id: 'cpu-frequency', source: '调整定频.jpg', webPMode: 'lossless', preset: 'text', alt: 'Windows 高性能电源计划处理器最大频率设置' },
  { id: 'control-power', source: '控制台设置-自定义模式设置.png', webPMode: 'lossless', preset: 'text', alt: '机械革命控制台自定义模式 CPU 功耗限制' },
  { id: 'gpu-mode', source: '控制台设置-显卡模式.png', webPMode: 'lossless', preset: 'text', alt: '机械革命控制台独显直连设置' },
  { id: 'console-power-mode', source: '控制台设置电源模式.png', webPMode: 'lossless', preset: 'text', alt: '机械革命控制台高性能电源模式关闭' },
  { id: 'uxtu-undervolt', source: 'UXTU负压(Universal x86 Tuning Utility).png', webPMode: 'lossless', preset: 'text', alt: 'UXTU 全核负压负 20 设置' },
  { id: 'uxtu-recovery', source: 'UXTU开机没自启，手动打开也没反应删除配置文件.png', webPMode: 'lossless', preset: 'text', alt: 'UXTU 无法启动时需要删除的配置文件夹' },
  { id: 'memory-stable', source: '内存超频后参数.png', webPMode: 'lossless', preset: 'text', alt: 'ZenTimings 显示的当前稳定内存参数' },
  { id: 'umaf-spd', source: 'UMAF内存时序调整1-DDR SPD Timing.jpg', webPMode: 'lossless', preset: 'text', alt: 'UMAF DDR SPD Timing 已记录字段' },
  { id: 'umaf-non-spd', source: 'UMAF内存时序调整2-DDR Non-SPD Timing.jpg', webPMode: 'lossless', preset: 'text', alt: 'UMAF DDR Non-SPD Timing 已记录字段' },
];
```

- [ ] **Step 7: Run the test and verify GREEN**

Run: `node --test tests/assets.test.mjs`

Expected: PASS, 1 test.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json .gitignore assets/source src/assets.mjs tests/assets.test.mjs
git commit -m "chore: scaffold standalone handoff page"
```

### Task 2: Lossless WebP conversion and pixel verification

**Files:**
- Create: `tests/image-pipeline.test.mjs`
- Create: `scripts/image-pipeline.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing image-pipeline test**

```js
// tests/image-pipeline.test.mjs
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/image-pipeline.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/image-pipeline.mjs`.

- [ ] **Step 3: Implement lossless conversion and decoded-pixel comparison**

```js
// scripts/image-pipeline.mjs
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
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `node --test tests/image-pipeline.test.mjs`

Expected: PASS, 3 tests. Conversion can be slow because quality is prioritized over output size.

- [ ] **Step 5: Add the new test to the project suite and run it**

Change the `test` script in `package.json` to:

```json
"test": "node --test --test-concurrency=1 tests/assets.test.mjs tests/image-pipeline.test.mjs"
```

Run: `npm test`

Expected: PASS, 4 tests total.

- [ ] **Step 6: Commit**

```powershell
git add package.json scripts/image-pipeline.mjs tests/image-pipeline.test.mjs
git commit -m "feat: add lossless WebP image pipeline"
```

### Task 3: Standalone build pipeline

**Files:**
- Create: `tests/build.test.mjs`
- Create: `tests/capture-source.test.mjs`
- Create: `src/index.template.html`
- Create: `src/styles.css`
- Create: `src/capture-bootstrap.js`
- Create: `src/client.js`
- Create: `scripts/build.mjs`
- Create: `dist/laptop-performance-handoff.html`
- Modify: `package.json`

- [ ] **Step 1: Write the failing standalone-build and first-frame capture tests**

```js
// tests/build.test.mjs
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import test from 'node:test';
import { buildPage, outputPath } from '../scripts/build.mjs';

test('build emits one self-contained HTML file with ten WebP assets', async () => {
  await rm('dist', { recursive: true, force: true });
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  assert.equal((html.match(/data:image\/webp;base64,/g) ?? []).length, 10);
  assert.doesNotMatch(html, /<img[^>]+src=["'](?!data:)/);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /\{\{[^}]+\}\}/);
});
```

```js
// tests/capture-source.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('capture bootstrap marks the root before page rendering', async () => {
  const source = await readFile('src/capture-bootstrap.js', 'utf8');
  assert.match(source, /URLSearchParams/);
  assert.match(source, /dataset\.capture/);
  assert.match(source, /get\(['"]capture['"]\)/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/build.test.mjs tests/capture-source.test.mjs`

Expected: FAIL because `scripts/build.mjs` and `src/capture-bootstrap.js` do not exist yet.

- [ ] **Step 3: Create minimal authoring files with all ten asset placeholders**

```html
<!-- src/index.template.html -->
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%2308080b'/%3E%3Cpath d='M14 40 28 14h9l-6 14h18L34 52h-9l7-16H14z' fill='%23d2ff52'/%3E%3C/svg%3E">
  <title>蛟龙 16 Pro 性能调校参考档案</title>
  <script>{{capture-bootstrap}}</script>
  <style>{{styles}}</style>
</head>
<body>
  <main id="handoff-page">
    <img src="{{asset:device-hero}}" alt="机械革命蛟龙 16 Pro 配置宣传图">
    <img src="{{asset:cpu-frequency}}" alt="Windows 高性能电源计划处理器最大频率设置">
    <img src="{{asset:control-power}}" alt="机械革命控制台自定义模式 CPU 功耗限制">
    <img src="{{asset:gpu-mode}}" alt="机械革命控制台独显直连设置">
    <img src="{{asset:console-power-mode}}" alt="机械革命控制台高性能电源模式关闭">
    <img src="{{asset:uxtu-undervolt}}" alt="UXTU 全核负压负 20 设置">
    <img src="{{asset:uxtu-recovery}}" alt="UXTU 无法启动时需要删除的配置文件夹">
    <img src="{{asset:memory-stable}}" alt="ZenTimings 显示的当前稳定内存参数">
    <img src="{{asset:umaf-spd}}" alt="UMAF DDR SPD Timing 已记录字段">
    <img src="{{asset:umaf-non-spd}}" alt="UMAF DDR Non-SPD Timing 已记录字段">
  </main>
  <script>{{client-script}}</script>
</body>
</html>
```

```css
/* src/styles.css */
html, body { margin: 0; background: #08080b; color: #f6f5f2; }
img { display: block; max-width: 100%; }
```

```js
// src/capture-bootstrap.js
if (new URLSearchParams(location.search).get('capture') === '1') {
  document.documentElement.dataset.capture = 'true';
}
```

```js
// src/client.js
document.documentElement.classList.add('js-ready');
```

- [ ] **Step 4: Implement the builder**

```js
// scripts/build.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assets } from '../src/assets.mjs';
import { convertAsset } from './image-pipeline.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const outputPath = resolve(root, 'dist/laptop-performance-handoff.html');

export async function buildPage() {
  let html = await readFile(resolve(root, 'src/index.template.html'), 'utf8');
  const styles = await readFile(resolve(root, 'src/styles.css'), 'utf8');
  const captureBootstrap = await readFile(resolve(root, 'src/capture-bootstrap.js'), 'utf8');
  const clientScript = await readFile(resolve(root, 'src/client.js'), 'utf8');

  html = html
    .replace('{{styles}}', styles)
    .replace('{{capture-bootstrap}}', captureBootstrap)
    .replace('{{client-script}}', clientScript);

  const report = [];
  for (const asset of assets) {
    const converted = await convertAsset(asset, root);
    html = html.replaceAll(`{{asset:${asset.id}}}`, converted.dataUri);
    report.push(converted);
  }

  if (/\{\{[^}]+\}\}/.test(html)) {
    throw new Error('Unresolved build placeholder remains in HTML');
  }

  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await buildPage();
  console.table(report.map(({ id, width, height, bytes }) => ({ id, width, height, bytes })));
  console.log(outputPath);
}
```

- [ ] **Step 5: Run both tests and verify GREEN**

Run: `node --test tests/build.test.mjs tests/capture-source.test.mjs`

Expected: PASS, 2 tests, and `dist/laptop-performance-handoff.html` exists.

- [ ] **Step 6: Add both tests to the project suite and run it**

Change the `test` script in `package.json` to:

```json
"test": "node --test --test-concurrency=1 tests/assets.test.mjs tests/image-pipeline.test.mjs tests/build.test.mjs tests/capture-source.test.mjs"
```

Run: `npm test`

Expected: PASS, 6 tests total.

- [ ] **Step 7: Commit**

```powershell
git add package.json src scripts/build.mjs tests/build.test.mjs tests/capture-source.test.mjs dist/laptop-performance-handoff.html
git commit -m "feat: build standalone handoff HTML"
```

### Task 4: Accurate handoff content and tutorial links

**Files:**
- Create: `tests/content.test.mjs`
- Modify: `src/index.template.html`
- Modify: `package.json`

- [ ] **Step 1: Write the failing content contract**

```js
// tests/content.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildPage, outputPath } from '../scripts/build.mjs';

function visibleText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

test('rendered copy matches the approved device handoff facts', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const text = visibleText(html);
  const required = [
    '机械革命蛟龙 16 Pro', 'Ryzen 9 8945HX', 'RTX 5070 Ti', '游戏性能与散热平衡',
    'CCD1 已关闭', 'CPU 睿频已关闭', '接通电源 5000 MHz',
    'SPL 65W', 'sPPT 85W', 'fPPT 85W', '控制极限 CPU 温度',
    '独显直连', '高性能电源模式保持关闭', 'All Core Offset -20',
    '16GB × 2 双通道', '5600 MT/s 正常保持',
    'ZenTimings = 当前 Windows 实际运行结果',
    'UMAF = 已记录字段的局部参数入口和回退对照',
    '约 80MB 的 UMAF 分区不可删除', '持续按 F2',
    'BIOS、负压和超频调整可能造成不稳定', '修改前保留当前值截图',
    '接通电源 5000 MHz → 5200 MHz', '85–87°C',
    'MCHOSE HUB', '小飞机（MSI Afterburner）', 'HWiNFO 仅传感器模式',
    'AIDA64', 'TM5', '先询问 AI 再使用',
    '全网最细！保姆级笔记本优化教程之cpu篇，小白也能降压定频，拯救你的cpu！适配于拯救者，鸡哥等绝大多数机型，演示机型8945hx 5070ti蛟龙16pro',
    '蛟龙16pro降温静音焚决（同类型笔记本直接可以抄作业）',
    'BV1yv78zQEnD', '22:35', 'BV1mvFpzoEp6',
  ];
  for (const phrase of required) assert.ok(text.includes(phrase), `missing: ${phrase}`);

  const bilibiliHrefs = [...html.matchAll(/<a\b[^>]*href="(https:\/\/www\.bilibili\.com\/video\/[^"]+)"/g)]
    .map((match) => match[1].replaceAll('&amp;', '&'));
  assert.deepEqual(bilibiliHrefs, [
    'https://www.bilibili.com/video/BV1yv78zQEnD/?share_source=copy_web&vd_source=91e679d463038976da1b6275f56aec3c&t=1355',
    'https://www.bilibili.com/video/BV1mvFpzoEp6/?share_source=copy_web&vd_source=91e679d463038976da1b6275f56aec3c',
  ]);

  const forbidden = ['单文件 HTML', 'Base64', 'Data URI', '图片内联', '离线查看', '交付格式'];
  for (const phrase of forbidden) assert.ok(!text.includes(phrase), `visible implementation copy: ${phrase}`);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/content.test.mjs`

Expected: FAIL on the first missing approved phrase.

- [ ] **Step 3: Replace the template body with the approved semantic page**

Use this exact section order and copy in `src/index.template.html`; retain the existing `<head>` placeholders from Task 3.

```html
<body>
  <div class="page-shell">
    <header class="topbar">
      <strong>MECHREVO / TUNING GUIDE 01</strong>
      <div><span>设备：机械革命蛟龙 16 Pro · Ryzen 9 8945HX · RTX 5070 Ti</span><span>用途：游戏性能与散热平衡</span><b>记录于 2026-07-12 · 当前调校基线已稳定运行</b></div>
    </header>

    <section class="hero" aria-labelledby="page-title">
      <div class="hero-copy" data-reveal>
        <p class="eyebrow">PERFORMANCE TUNING · USER REFERENCE</p>
        <h1 id="page-title">性能调校<br>参考档案</h1>
        <p>记录这台电脑已经完成的硬件与软件调整，并为参数回退、启动异常和后续调校保留可复现依据。</p>
      </div>
      <figure class="hero-media"><img src="{{asset:device-hero}}" alt="机械革命蛟龙 16 Pro 配置宣传图"></figure>
      <dl class="hero-metrics">
        <div><dt>CPU 接电定频</dt><dd>5.0 GHz</dd></div>
        <div><dt>UXTU 全核负压</dt><dd>-20</dd></div>
        <div><dt>当前稳定内存频率</dt><dd>5600 MT/s</dd></div>
        <div><dt>当前内存</dt><dd>16GB × 2</dd></div>
      </dl>
    </section>

    <aside class="critical-note"><strong>先看这里</strong><span>约 80MB 的 UMAF 分区不可删除或格式化；BIOS、负压和超频调整可能造成不稳定。修改前保留当前值截图，不确定参数含义时不要一次修改多项。</span></aside>

    <main>
      <section class="chapter" id="baseline" data-reveal>
        <header class="chapter-heading"><span>00</span><div><h2>当前设置基线</h2><p>这是记录日期的静态参考，不会自动检测设置是否已回退。</p></div></header>
        <dl class="baseline-grid">
          <div><dt>CPU TOPOLOGY</dt><dd>CCD1 已关闭</dd><p>按教程解锁 BIOS / UMAF 后设置。</p></div>
          <div><dt>CPU BOOST</dt><dd>CPU 睿频已关闭</dd><p>在 Windows 高性能电源计划中限制频率。</p></div>
          <div><dt>GPU ROUTE</dt><dd>独显直连</dd><p>机械革命控制台保持启用。</p></div>
          <div><dt>MEMORY</dt><dd>16GB × 2 双通道</dd><p>原装 32GB 单条已经更换。</p></div>
        </dl>
      </section>

      <section class="chapter" id="cpu" data-reveal>
        <header class="chapter-heading"><span>01</span><div><h2>CPU 与散热边界</h2><p>Windows 的高性能电源计划与机械革命控制台的高性能电源模式不是同一个开关。</p></div></header>
        <article class="tutorial" id="tutorial-1"><div class="tutorial-meta"><small>教程 01</small><span>BV1yv78zQEnD · 22:35</span></div><div class="tutorial-copy"><h3>全网最细！保姆级笔记本优化教程之cpu篇，小白也能降压定频，拯救你的cpu！适配于拯救者，鸡哥等绝大多数机型，演示机型8945hx 5070ti蛟龙16pro</h3><p>用于关闭 CCD1、BIOS 解锁、UMAF 安装和进入方式。</p></div><a class="tutorial-link" href="https://www.bilibili.com/video/BV1yv78zQEnD/?share_source=copy_web&amp;vd_source=91e679d463038976da1b6275f56aec3c&amp;t=1355" target="_blank" rel="noreferrer"><strong>打开 B 站教程 ↗</strong><span>bilibili.com/video/BV1yv78zQEnD · 22:35</span></a></article>
        <div class="media-step"><h3>接通电源 5000 MHz</h3><p>Windows 高性能电源计划：电池 4500 MHz，接通电源 5000 MHz。</p><img data-zoom src="{{asset:cpu-frequency}}" alt="Windows 高性能电源计划处理器最大频率设置"></div>
        <article class="tutorial"><div class="tutorial-meta"><small>教程 02</small><span>BV1mvFpzoEp6</span></div><div class="tutorial-copy"><h3>蛟龙16pro降温静音焚决（同类型笔记本直接可以抄作业）</h3><p>用于关闭 CPU 睿频、调出高性能电源计划和理解降温思路。</p></div><a class="tutorial-link" href="https://www.bilibili.com/video/BV1mvFpzoEp6/?share_source=copy_web&amp;vd_source=91e679d463038976da1b6275f56aec3c" target="_blank" rel="noreferrer"><strong>打开 B 站教程 ↗</strong><span>bilibili.com/video/BV1mvFpzoEp6</span></a></article>
        <div class="media-step"><h3>CPU 功耗上限：SPL 65W · sPPT 85W · fPPT 85W</h3><p>机械革命控制台自定义模式限制 CPU 功耗上限，目的为控制极限 CPU 温度。</p><img data-zoom src="{{asset:control-power}}" alt="机械革命控制台自定义模式 CPU 功耗限制"></div>
      </section>

      <section class="chapter" id="gpu" data-reveal>
        <header class="chapter-heading"><span>02</span><div><h2>显卡与电源模式</h2><p>保持独显直连，同时让机械革命控制台的高性能电源模式保持关闭。</p></div></header>
        <div class="media-stack"><figure><img data-zoom src="{{asset:gpu-mode}}" alt="机械革命控制台独显直连设置"><figcaption>显卡模式：独显直连</figcaption></figure><figure><img data-zoom src="{{asset:console-power-mode}}" alt="机械革命控制台高性能电源模式关闭"><figcaption>高性能电源模式保持关闭</figcaption></figure></div>
      </section>

      <section class="chapter" id="uxtu" data-reveal>
        <header class="chapter-heading"><span>03</span><div><h2>UXTU 负压与启动异常</h2><p>-20 是这台电脑的记录值，不是其他设备可以直接照抄的通用值。</p></div></header>
        <div class="media-step"><h3>AMD Curve Optimiser · All Core Offset -20</h3><p>如果出现蓝屏、重启、游戏或应用崩溃，优先恢复默认并重新验证。</p><img data-zoom src="{{asset:uxtu-undervolt}}" alt="UXTU 全核负压负 20 设置"></div>
        <div class="media-step recovery"><h3>UXTU 没自启，手动打开也没反应</h3><p>删除 AppData\Local\JamesCJ60 下截图红圈所示的 Universal x86 Tuning Utility 配置文件夹；不要误删旁边的压缩包。</p><img data-zoom src="{{asset:uxtu-recovery}}" alt="UXTU 无法启动时需要删除的配置文件夹"></div>
      </section>

      <section class="chapter memory-chapter" id="memory" data-reveal>
        <header class="chapter-heading"><span>04</span><div><h2>当前稳定内存结果</h2><p>5600 MT/s 已经调整完成并稳定运行，正常情况下保持不动。</p></div></header>
        <div class="stable-result"><div><small>CURRENT STABLE RESULT</small><h3>5600 MT/s 正常保持</h3><p>原装 32GB 单条已经替换为 16GB × 2 双通道。只有发生稳定性问题时，才考虑降频、放宽或回退已记录参数，并逐项验证。</p><p><strong>ZenTimings = 当前 Windows 实际运行结果</strong></p></div><img data-zoom src="{{asset:memory-stable}}" alt="ZenTimings 显示的当前稳定内存参数"></div>
        <div class="umaf-reference"><header><small>局部回退 / 恢复参考</small><h3>UMAF = 已记录字段的局部参数入口和回退对照</h3><p>两张图只覆盖部分时序与小参数。设置被回退时，只恢复图中明确记录的字段；出现稳定性问题时可逐项放宽，未记录参数不要凭空推断。</p></header><div class="umaf-stack"><figure><img class="umaf-image" data-zoom src="{{asset:umaf-spd}}" alt="UMAF DDR SPD Timing 已记录字段"><figcaption>DDR SPD Timing · 已记录字段</figcaption></figure><figure><img class="umaf-image" data-zoom src="{{asset:umaf-non-spd}}" alt="UMAF DDR Non-SPD Timing 已记录字段"><figcaption>DDR Non-SPD Timing · 已记录字段</figcaption></figure></div><p class="umaf-warning">约 80MB 的 UMAF 分区不可删除。开机或重启时持续按 F2，选择最右边第三项，再进入后续界面的第二项；安装与进入方法参见教程 01。</p></div>
      </section>

      <section class="chapter" id="future" data-reveal>
        <header class="chapter-heading"><span>05</span><div><h2>之后可以怎么调</h2><p>这里只讨论 CPU 定频和散热条件；内存 5600 MT/s 不属于待提高项目。</p></div></header>
        <div class="future-grid"><div class="temperature"><small>游戏温度参考</small><strong>85–87°C</strong><p>使用上风压散热器后，最终游戏温度稳定在这个范围可接受。</p></div><ol><li><b>先改善散热：</b>安装并使用上风压散热器。</li><li><b>再调整接电定频：</b>Windows 高性能电源计划中的接通电源 5000 MHz → 5200 MHz；电池 4500 MHz 不改。</li><li><b>一次只改一项：</b>保留截图，在实际游戏和稳定性测试中验证。</li></ol></div>
      </section>

      <section class="chapter" id="tools" data-reveal>
        <header class="chapter-heading"><span>06</span><div><h2>已经安装的软件</h2><p>监控工具可以直接使用；压力测试和参数判断工具先询问 AI 再使用。</p></div></header>
        <div class="tools-list"><article><small>鼠标驱动</small><h3>MCHOSE HUB</h3><p>新鼠标驱动，桌面已有快捷方式。</p></article><article><small>游戏监控</small><h3>小飞机（MSI Afterburner）</h3><p>查看游戏内温度、频率、占用率和帧率。</p></article><article><small>传感器</small><h3>HWiNFO 仅传感器模式</h3><p>查看温度、功耗、频率和峰值。</p></article><article><small>先询问 AI 再使用</small><h3>AIDA64 · TM5 · ZenTimings</h3><p>先确认用途、测试步骤、停止条件和结果判断，再开始压力测试或参数调整。</p></article></div>
      </section>
    </main>

    <footer><small>REFERENCE RULE / 使用原则</small><h2>一次只改一项。先截图，再测试；不稳定就回到已记录的基线。</h2></footer>
  </div>
  <dialog id="image-dialog"><button type="button" aria-label="关闭大图">关闭</button><img alt=""></dialog>
  <script>{{client-script}}</script>
</body>
```

- [ ] **Step 4: Run the content test and verify GREEN**

Run: `node --test tests/content.test.mjs`

Expected: PASS, 1 test.

- [ ] **Step 5: Add the content contract to the project suite and run it**

Change the `test` script in `package.json` to:

```json
"test": "node --test --test-concurrency=1 tests/assets.test.mjs tests/image-pipeline.test.mjs tests/build.test.mjs tests/capture-source.test.mjs tests/content.test.mjs"
```

Run: `npm test`

Expected: PASS, 7 tests total.

- [ ] **Step 6: Commit**

```powershell
git add package.json src/index.template.html tests/content.test.mjs dist/laptop-performance-handoff.html
git commit -m "feat: add accurate handoff content"
```

### Task 5: Full-width visual system and readable type scale

**Files:**
- Create: `tests/layout-source.test.mjs`
- Modify: `src/styles.css`
- Modify: `package.json`

- [ ] **Step 1: Write the failing layout-source test**

```js
// tests/layout-source.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('stylesheet encodes full-width layout and approved minimum type scale', async () => {
  const css = await readFile('src/styles.css', 'utf8');
  for (const token of [
    '--font-label: 0.75rem',
    '--font-note: 0.875rem',
    '--font-body: 1rem',
    '--font-value: 1.75rem',
    '.page-shell { width: 100%',
    'overflow-x: clip',
    'html[data-capture="true"]',
    '@media (prefers-reduced-motion: reduce)',
  ]) assert.ok(css.includes(token), `missing CSS invariant: ${token}`);
  assert.doesNotMatch(css, /\.page-shell\s*\{[^}]*max-width/);
  assert.doesNotMatch(css, /overflow-y\s*:\s*(auto|scroll)/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/layout-source.test.mjs`

Expected: FAIL on the first missing design token.

- [ ] **Step 3: Replace `src/styles.css` with the complete visual system**

```css
:root {
  color-scheme: dark;
  --bg: #08080b;
  --surface: #101015;
  --line: #303039;
  --text: #f6f5f2;
  --muted: #b2b0ba;
  --violet: #887cff;
  --acid: #d2ff52;
  --danger: #ff8b76;
  --font-label: 0.75rem;
  --font-note: 0.875rem;
  --font-body: 1rem;
  --font-value: 1.75rem;
  --gutter: clamp(1.5rem, 4.5vw, 6rem);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; background: var(--bg); }
body { margin: 0; overflow-x: clip; background: var(--bg); color: var(--text); font-family: "Segoe UI", "Microsoft YaHei", sans-serif; font-size: var(--font-body); line-height: 1.7; }
img { display: block; max-width: 100%; }
a { color: inherit; }
.page-shell { width: 100%; background: var(--bg); }
.topbar { min-height: 4.25rem; display: flex; align-items: center; justify-content: space-between; gap: 2rem; padding: 0 var(--gutter); border-bottom: 1px solid var(--line); font-size: var(--font-note); letter-spacing: .04em; }
.topbar > div { display: flex; flex-wrap: wrap; gap: 1.5rem; color: var(--muted); }
.topbar b { color: var(--acid); }
.hero { display: grid; grid-template-columns: .9fr 1.1fr; }
.hero-copy { height: clamp(32rem, calc(100svh - 12rem), 42rem); padding: 6rem var(--gutter); display: flex; flex-direction: column; justify-content: center; }
.eyebrow, .chapter-heading > span, small { color: var(--violet); font-size: var(--font-label); font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
h1 { max-width: 6em; margin: 3.8rem 0 1.5rem; font-size: clamp(4rem, 6vw, 7.2rem); line-height: 1.02; letter-spacing: -.035em; }
.hero-copy > p:last-child { max-width: 34rem; color: var(--muted); font-size: 1.125rem; }
.hero-media { margin: 0; height: clamp(32rem, calc(100svh - 12rem), 42rem); background: #f0efeb; overflow: hidden; }
.hero-media img { width: 100%; height: 100%; object-fit: cover; }
.hero-metrics { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, 1fr); margin: 0; padding: 0 var(--gutter) 2.5rem; border-top: 1px solid var(--line); background: var(--bg); }
.hero-metrics > div { padding: 1.7rem 1rem 0 0; }
.hero-metrics dt { color: var(--muted); font-size: var(--font-note); }
.hero-metrics dd { margin: .35rem 0 0; color: var(--acid); font-size: var(--font-value); font-weight: 850; }
.critical-note { display: flex; align-items: center; gap: 1.25rem; padding: 1.25rem var(--gutter); background: var(--acid); color: #0a0a0c; font-size: 1rem; }
.critical-note strong { padding-right: 1.25rem; border-right: 1px solid #0a0a0c55; }
.chapter { padding: clamp(5rem, 8vw, 9rem) var(--gutter); border-bottom: 1px solid var(--line); }
.chapter-heading { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: 1.5rem; margin-bottom: 3.5rem; }
.chapter-heading > span { font-size: clamp(3.5rem, 5vw, 6rem); line-height: 1; }
.chapter-heading h2 { margin: 0 0 .8rem; font-size: clamp(2.8rem, 4.5vw, 5rem); line-height: 1; letter-spacing: -.04em; }
.chapter-heading p { max-width: 52rem; margin: 0; color: var(--muted); }
.baseline-grid { display: grid; grid-template-columns: repeat(4, 1fr); margin: 0; border-block: 1px solid var(--line); }
.baseline-grid > div { min-width: 0; padding: 2rem 1.5rem; border-right: 1px solid var(--line); }
.baseline-grid > div:last-child { border-right: 0; }
.baseline-grid dt { color: var(--muted); font-size: var(--font-label); letter-spacing: .12em; }
.baseline-grid dd { margin: .8rem 0 .35rem; font-size: var(--font-value); font-weight: 800; }
.baseline-grid p { margin: 0; color: var(--muted); font-size: var(--font-note); }
.tutorial { display: grid; grid-template-columns: 8.5rem minmax(0, 1fr) minmax(15rem, 18rem); gap: 2rem; align-items: stretch; padding: 2rem 0; border-block: 1px solid #494653; }
.tutorial-meta { padding-top: .25rem; }
.tutorial-meta small, .tutorial-meta span { display: block; }
.tutorial-meta span { margin-top: .45rem; color: var(--muted); font-size: var(--font-label); line-height: 1.5; }
.tutorial-copy h3 { margin: 0 0 .5rem; font-size: 1.15rem; line-height: 1.5; }
.tutorial-copy p { margin: 0; color: var(--muted); font-size: var(--font-note); }
.tutorial-link { min-width: 0; padding: 1.1rem 1.25rem; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; background: var(--acid); color: #0a0a0c; text-decoration: none; transition: transform .18s ease, background .18s ease; }
.tutorial-link strong { font-size: 1rem; }
.tutorial-link span { margin-top: .4rem; max-width: 100%; font-size: var(--font-label); line-height: 1.45; overflow-wrap: anywhere; }
.tutorial-link:hover, .tutorial-link:focus-visible { transform: translateY(-2px); background: #e0ff7d; }
.media-step { margin-top: 4.5rem; }
.media-step h3 { margin: 0 0 .5rem; font-size: 1.8rem; }
.media-step p { max-width: 52rem; margin: 0 0 1.25rem; color: var(--muted); }
.media-step img, .media-stack img { width: 100%; border: 1px solid var(--line); background: var(--surface); cursor: zoom-in; }
.media-stack { display: grid; grid-template-columns: 1fr; gap: 2.5rem; }
figure { margin: 0; }
figcaption { padding-top: .8rem; color: var(--muted); font-size: var(--font-note); }
.stable-result { display: grid; grid-template-columns: 1fr minmax(22rem, .55fr); gap: 3rem; align-items: center; padding: 3rem; border-block: 2px solid var(--acid); background: linear-gradient(135deg, #111119, #0a0a0d); }
.stable-result h3 { margin: 1rem 0; color: var(--acid); font-size: clamp(3rem, 5vw, 6rem); line-height: .95; }
.stable-result p { max-width: 48rem; color: var(--muted); }
.stable-result img { max-height: 44rem; margin: auto; cursor: zoom-in; }
.umaf-reference { margin-top: 5rem; }
.umaf-reference header { max-width: 58rem; }
.umaf-reference h3 { margin: .7rem 0; font-size: 2rem; }
.umaf-reference header p, .umaf-warning { color: var(--muted); }
.umaf-stack { display: grid; grid-template-columns: 1fr; gap: 2.5rem; margin-top: 2rem; }
.umaf-image { width: 100%; height: auto; object-fit: contain; cursor: zoom-in; border: 1px solid var(--line); }
.umaf-warning { margin-top: 2rem; padding: 1.3rem 1.5rem; border-left: 4px solid var(--danger); background: #171216; }
.future-grid { display: grid; grid-template-columns: .75fr 1.25fr; gap: 2rem; }
.temperature { min-height: 23rem; padding: 2.5rem; display: flex; flex-direction: column; justify-content: space-between; background: var(--violet); color: #0a0a0c; }
.temperature small { color: #0a0a0c; }
.temperature strong { font-size: clamp(4rem, 6vw, 7rem); line-height: .9; }
.future-grid ol { margin: 0; padding-left: 1.5rem; }
.future-grid li { padding: 1.4rem 0; border-bottom: 1px solid var(--line); }
.tools-list { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line); }
.tools-list article { min-height: 12rem; padding: 2rem; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.tools-list h3 { margin: 2rem 0 .5rem; font-size: 1.6rem; }
.tools-list p { margin: 0; color: var(--muted); font-size: var(--font-note); }
footer { padding: 6rem var(--gutter) 7rem; background: #f1f0eb; color: #0a0a0c; }
footer small { color: #4f46c7; }
footer h2 { max-width: 68rem; margin: 2rem 0 0; font-size: clamp(3rem, 6vw, 6.5rem); line-height: .98; letter-spacing: -.05em; }
dialog { width: min(92vw, 110rem); max-height: 92vh; padding: 3.5rem 1rem 1rem; border: 0; background: #050507; color: #fff; }
dialog::backdrop { background: #000d; }
dialog button { position: absolute; top: .8rem; right: 1rem; padding: .6rem 1rem; }
dialog img { max-height: 84vh; margin: auto; object-fit: contain; }
[data-reveal] { opacity: 0; transform: translateY(1.5rem); transition: opacity .6s ease, transform .6s ease; }
[data-reveal].is-visible { opacity: 1; transform: none; }
html[data-capture="true"] [data-reveal] { opacity: 1; transform: none; transition: none; }
html[data-capture="true"] *, html[data-capture="true"] *::before, html[data-capture="true"] *::after { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } [data-reveal] { opacity: 1; transform: none; transition: none; } }
@media (max-width: 900px) {
  .topbar > div { display: none; }
  .hero { grid-template-columns: 1fr; }
  .hero-copy { height: auto; padding-block: 5rem; }
  .hero-media { height: auto; }
  .hero-media img { height: auto; object-fit: contain; }
  .hero-metrics, .baseline-grid { grid-template-columns: 1fr 1fr; }
  .chapter-heading { grid-template-columns: 1fr; }
  .tutorial, .stable-result, .future-grid, .tools-list { grid-template-columns: 1fr; }
  .tutorial-link { width: 100%; }
  .stable-result { padding: 2rem 1.5rem; }
}
@media print {
  * { animation: none !important; transition: none !important; box-shadow: none !important; }
  [data-reveal] { opacity: 1 !important; transform: none !important; }
  a { text-decoration: none; }
}
```

- [ ] **Step 4: Run layout and content tests**

Run: `node --test tests/layout-source.test.mjs tests/content.test.mjs`

Expected: PASS, 2 tests.

- [ ] **Step 5: Add the layout contract to the project suite and rebuild**

Change the `test` script in `package.json` to:

```json
"test": "node --test --test-concurrency=1 tests/assets.test.mjs tests/image-pipeline.test.mjs tests/build.test.mjs tests/capture-source.test.mjs tests/content.test.mjs tests/layout-source.test.mjs"
```

Run:

```powershell
npm test
npm run build
```

Expected: PASS, 8 tests total, followed by a successful build.

- [ ] **Step 6: Commit**

```powershell
git add package.json src/styles.css tests/layout-source.test.mjs dist/laptop-performance-handoff.html
git commit -m "feat: add full-width handoff visual system"
```

### Task 6: Motion and accessible image zoom

**Files:**
- Create: `tests/interaction-source.test.mjs`
- Modify: `src/client.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing interaction-source test**

```js
// tests/interaction-source.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('motion and lightbox interactions are accessible', async () => {
  const client = await readFile('src/client.js', 'utf8');
  assert.match(client, /prefers-reduced-motion/);
  assert.match(client, /IntersectionObserver/);
  assert.match(client, /showModal/);
  assert.match(client, /Escape/);
  assert.match(client, /data-zoom/);
  assert.match(client, /preventDefault/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/interaction-source.test.mjs`

Expected: FAIL because `src/client.js` does not contain the required behavior.

- [ ] **Step 3: Implement restrained motion and the lightbox**

```js
// src/client.js
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const captureMode = document.documentElement.dataset.capture === 'true';
const revealItems = [...document.querySelectorAll('[data-reveal]')];

if (captureMode || reducedMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  revealItems.forEach((item) => observer.observe(item));
}

const dialog = document.querySelector('#image-dialog');
const dialogImage = dialog.querySelector('img');
const closeButton = dialog.querySelector('button');

document.querySelectorAll('img[data-zoom]').forEach((image) => {
  image.tabIndex = 0;
  image.setAttribute('role', 'button');
  image.setAttribute('aria-label', `${image.alt}，打开完整大图`);
  const open = () => {
    dialogImage.src = image.currentSrc || image.src;
    dialogImage.alt = image.alt;
    dialog.showModal();
  };
  image.addEventListener('click', open);
  image.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
});

closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dialog.open) dialog.close();
});
```

- [ ] **Step 4: Run the interaction test**

Run: `node --test tests/interaction-source.test.mjs`

Expected: PASS, 1 test.

- [ ] **Step 5: Add the interaction contract to the project suite and rebuild**

Change the `test` script in `package.json` to:

```json
"test": "node --test --test-concurrency=1 tests/assets.test.mjs tests/image-pipeline.test.mjs tests/build.test.mjs tests/capture-source.test.mjs tests/content.test.mjs tests/layout-source.test.mjs tests/interaction-source.test.mjs"
```

Run:

```powershell
npm test
npm run build
```

Expected: PASS, 9 tests total, then a successful build.

- [ ] **Step 6: Commit**

```powershell
git add package.json src/client.js tests/interaction-source.test.mjs dist/laptop-performance-handoff.html
git commit -m "feat: add motion and image zoom"
```

### Task 7: Final validator, offline server, and browser QA

**Files:**
- Create: `scripts/validate-html.mjs`
- Create: `scripts/serve.mjs`
- Modify: `dist/laptop-performance-handoff.html`
- Create: `output/playwright/full-1440.png`
- Create: `output/playwright/full-1920.png`
- Create: `output/playwright/full-mobile.png`
- Create: `output/playwright/memory-stable-full.png`
- Create: `output/playwright/umaf-full.png`

- [ ] **Step 1: Write validator tests before implementation**

Append to `tests/build.test.mjs`:

```js
import { validateHtml } from '../scripts/validate-html.mjs';

test('validator rejects visible implementation copy', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const contaminated = html.replace('</main>', '<p>交付格式：单文件 HTML</p></main>');
  assert.throws(() => validateHtml(contaminated), /visible implementation copy/);
});

test('validator rejects remote CSS resources', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  const contaminated = html.replace('</style>', '.leak{background:url(https://example.com/leak.png)}</style>');
  assert.throws(() => validateHtml(contaminated), /external CSS resource/);
});

test('validator accepts the generated page', async () => {
  await buildPage();
  const html = await readFile(outputPath, 'utf8');
  assert.doesNotThrow(() => validateHtml(html));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/build.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/validate-html.mjs`.

- [ ] **Step 3: Implement final HTML validation**

```js
// scripts/validate-html.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function extractVisibleText(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

export function validateHtml(html) {
  const visible = extractVisibleText(html);
  for (const phrase of ['单文件 HTML', 'Base64', 'Data URI', '图片内联', '离线查看', '交付格式']) {
    assert.ok(!visible.includes(phrase), `visible implementation copy: ${phrase}`);
  }
  assert.equal((html.match(/data:image\/webp;base64,/g) ?? []).length, 10, 'expected ten WebP Data URIs');
  assert.doesNotMatch(html, /<img[^>]+src=["'](?!data:)/, 'external image source');
  assert.doesNotMatch(html, /\b(?:src|poster)=["']https?:\/\//i, 'external media source');
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/, 'external stylesheet');
  assert.doesNotMatch(html, /<script[^>]+src=/, 'external script');
  const styleText = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
  assert.doesNotMatch(styleText, /(?:url\(|@import\s+)[^;)]*https?:\/\//i, 'external CSS resource');
  const httpLinks = [...html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)/g)]
    .map((match) => new URL(match[1].replaceAll('&amp;', '&')));
  assert.equal(httpLinks.length, 2, 'expected exactly two external tutorial links');
  assert.ok(httpLinks.every((url) => url.hostname === 'www.bilibili.com'), 'non-Bilibili external link');
  assert.equal(httpLinks[0].pathname, '/video/BV1yv78zQEnD/');
  assert.equal(httpLinks[0].searchParams.get('t'), '1355');
  assert.equal(httpLinks[1].pathname, '/video/BV1mvFpzoEp6/');
  return true;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const html = await readFile(resolve('dist/laptop-performance-handoff.html'), 'utf8');
  validateHtml(html);
  console.log('Standalone HTML validation passed.');
}
```

- [ ] **Step 4: Implement the local QA server**

```js
// scripts/serve.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const file = resolve('dist/laptop-performance-handoff.html');
const html = await readFile(file);
const port = Number(process.env.PORT || 4173);

createServer((request, response) => {
  if (request.url === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/?capture=1`));
```

- [ ] **Step 5: Run the full automated suite**

Run: `npm run verify`

Expected: all Node tests PASS, ten WebP conversions report original dimensions, and `Standalone HTML validation passed.`

- [ ] **Step 6: Start the server as a tracked background session**

Run: `npm run serve`

Expected: the command remains active and prints `http://127.0.0.1:4173/?capture=1`. Keep its session ID and stop it after QA.

- [ ] **Step 7: Verify 1440px capture mode in Playwright CLI**

Current `@playwright/cli` requires each `run-code` payload to be wrapped as an `async page => { ... }` function. Set `PLAYWRIGHT_MCP_ALLOW_UNRESTRICTED_FILE_ACCESS=true` before the first `open` so the later audited `file://` check is allowed.

```powershell
New-Item -ItemType Directory -Force -Path 'output\playwright' | Out-Null
$env:PLAYWRIGHT_MCP_ALLOW_UNRESTRICTED_FILE_ACCESS = 'true'
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' open 'http://127.0.0.1:4173/?capture=1' --headed
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' resize 1440 900
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' run-code "await page.waitForFunction(() => { const images = [...document.querySelectorAll('img[src]')]; return images.length === 10 && images.every((image) => image.complete && image.naturalWidth > 0); }); await page.screenshot({path: 'output/playwright/full-1440.png', fullPage: true});"
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' run-code "const actual = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((link) => link.href)); const expected = ['https://www.bilibili.com/video/BV1yv78zQEnD/?share_source=copy_web&vd_source=91e679d463038976da1b6275f56aec3c&t=1355', 'https://www.bilibili.com/video/BV1mvFpzoEp6/?share_source=copy_web&vd_source=91e679d463038976da1b6275f56aec3c']; if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify(actual));"
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' run-code "const failures = await page.evaluate(() => { const parse = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number); const luminance = (rgb) => { const c = rgb.map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }; const ratio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }; const background = (element) => { for (let node = element; node; node = node.parentElement) { const values = (getComputedStyle(node).backgroundColor.match(/[\d.]+/g) ?? []).map(Number); if (values.length >= 3 && (values.length === 3 || values[3] > 0)) return values.slice(0, 3); } return [8, 8, 11]; }; const issues = []; for (const [selector, minimum] of [['body', 16], ['.hero-metrics dd', 28], ['.hero-metrics dt', 14], ['.baseline-grid p', 14], ['.tutorial p', 14], ['.tools-list p', 14], ['small', 12]]) { const nodes = [...document.querySelectorAll(selector)]; if (!nodes.length) issues.push(selector + ': missing'); for (const node of nodes) { const style = getComputedStyle(node); const size = parseFloat(style.fontSize); const contrast = ratio(parse(style.color), background(node)); if (size < minimum) issues.push(selector + ': ' + size + 'px'); if (contrast < 4.5) issues.push(selector + ': contrast ' + contrast.toFixed(2)); } } return issues; }); if (failures.length) throw new Error(failures.join('\n'));"
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' console
```

Expected: exactly 10 source-backed images load, both tutorial links exactly match the approved URLs, every measured text size meets the 28/16/14/12px contract, every measured foreground/background pair is at least 4.5:1, console reports 0 errors and 0 warnings, and the screenshot has no clipped text or unrevealed sections.

- [ ] **Step 8: Verify 1920px width and document-level scrolling**

```powershell
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' resize 1920 1080
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' run-code "const result = await page.evaluate(() => ({scrollingElement: document.scrollingElement?.tagName, internalScrollers: [...document.querySelectorAll('*')].filter((element) => { const style = getComputedStyle(element); return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight; }).length, loadedImages: [...document.querySelectorAll('img[src]')].filter((image) => image.complete && image.naturalWidth > 0).length })); if (result.scrollingElement !== 'HTML' || result.internalScrollers !== 0 || result.loadedImages !== 10) throw new Error(JSON.stringify(result)); await page.screenshot({path: 'output/playwright/full-1920.png', fullPage: true});"
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' run-code "const failures = await page.evaluate(() => { const parse = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number); const luminance = (rgb) => { const c = rgb.map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }; const ratio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }; const background = (element) => { for (let node = element; node; node = node.parentElement) { const values = (getComputedStyle(node).backgroundColor.match(/[\d.]+/g) ?? []).map(Number); if (values.length >= 3 && (values.length === 3 || values[3] > 0)) return values.slice(0, 3); } return [8, 8, 11]; }; const issues = []; for (const [selector, minimum] of [['body', 16], ['.hero-metrics dd', 28], ['.hero-metrics dt', 14], ['.baseline-grid p', 14], ['.tutorial p', 14], ['.tools-list p', 14], ['small', 12]]) { const nodes = [...document.querySelectorAll(selector)]; if (!nodes.length) issues.push(selector + ': missing'); for (const node of nodes) { const style = getComputedStyle(node); const size = parseFloat(style.fontSize); const contrast = ratio(parse(style.color), background(node)); if (size < minimum) issues.push(selector + ': ' + size + 'px'); if (contrast < 4.5) issues.push(selector + ': contrast ' + contrast.toFixed(2)); } } return issues; }); if (failures.length) throw new Error(failures.join('\n'));"
```

Expected: `scrollingElement` is `HTML`, `internalScrollers` is `0`, `loadedImages` is `10`, and the same computed type-size/contrast contract passes at 1920px.

- [ ] **Step 9: Verify the responsive layout at a 390px mobile viewport**

```powershell
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' resize 390 844
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' run-code "const result = await page.evaluate(() => { const images = [...document.querySelectorAll('img[src]')]; const fontChecks = [['body', 16], ['.hero-metrics dd', 28], ['.hero-metrics dt', 14], ['.baseline-grid p', 14], ['.tutorial p', 14], ['.tools-list p', 14], ['small', 12]].flatMap(([selector, minimum]) => [...document.querySelectorAll(selector)].filter((element) => parseFloat(getComputedStyle(element).fontSize) < minimum).map((element) => selector + ': ' + getComputedStyle(element).fontSize)); return { scrollingElement: document.scrollingElement?.tagName, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, internalScrollers: [...document.querySelectorAll('*')].filter((element) => { const style = getComputedStyle(element); return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight; }).length, imageCount: images.length, loadedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length, fontChecks }; }); if (result.scrollingElement !== 'HTML' || result.horizontalOverflow || result.internalScrollers !== 0 || result.imageCount !== 10 || result.loadedImages !== 10 || result.fontChecks.length) throw new Error(JSON.stringify(result)); await page.screenshot({path: 'output/playwright/full-mobile.png', fullPage: true});"
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' resize 1440 900
```

Expected: the mobile page has no horizontal overflow or inner scrolling, all 10 images load, the approved minimum type scale still holds, and the full-page mobile screenshot is readable.

- [ ] **Step 10: Verify the HTML works directly from a unique empty folder with networking disabled**

```powershell
$offline = Join-Path $env:TEMP ('laptop-handoff-offline-check-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $offline | Out-Null
Copy-Item -LiteralPath 'dist\laptop-performance-handoff.html' -Destination (Join-Path $offline 'handoff.html') -Force
$offlineUrl = ([System.Uri]::new((Join-Path $offline 'handoff.html'))).AbsoluteUri + '?capture=1'
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' run-code "async page => { await page.context().setOffline(true); await page.goto('$offlineUrl'); const fileHtml = await page.content(); const fileResult = await page.evaluate(() => { const images = [...document.querySelectorAll('img[src]')]; return { count: images.length, loaded: images.filter((image) => image.complete && image.naturalWidth > 0).length, links: document.querySelectorAll('a[href]').length }; }); if (fileResult.count !== 10 || fileResult.loaded !== 10 || fileResult.links !== 2) throw new Error('file: ' + JSON.stringify(fileResult)); await page.goto('about:blank'); await page.setContent(fileHtml, { waitUntil: 'load' }); const offlineResult = await page.evaluate(() => { const images = [...document.querySelectorAll('img[src]')]; return { online: navigator.onLine, count: images.length, loaded: images.filter((image) => image.complete && image.naturalWidth > 0).length, links: document.querySelectorAll('a[href]').length }; }); if (offlineResult.online || offlineResult.count !== 10 || offlineResult.loaded !== 10 || offlineResult.links !== 2) throw new Error('offline: ' + JSON.stringify(offlineResult)); await page.context().setOffline(false); await page.goto('http://127.0.0.1:4173/?capture=1'); }"
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' console
$resolvedOffline = (Resolve-Path -LiteralPath $offline).Path
$resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path.TrimEnd('\')
if (-not $resolvedOffline.StartsWith($resolvedTemp + '\laptop-handoff-offline-check-', [StringComparison]::OrdinalIgnoreCase)) { throw "Unexpected cleanup path: $resolvedOffline" }
Remove-Item -LiteralPath $resolvedOffline -Recurse -Force
```

Expected: the unique copied `file://` page opens with exactly 10/10 images and two links. Chromium reports `navigator.onLine === true` for local-file documents even in an offline context, so the same captured file DOM is also reloaded into `about:blank` while offline; there `navigator.onLine` must be false with 10/10 images and both links intact. Console remains clean and the Bilibili links are not opened.

- [ ] **Step 11: Open the stable-memory and both UMAF images through the real keyboard lightbox flow**

```powershell
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' run-code "const cases = [{ alt: 'ZenTimings 显示的当前稳定内存参数', width: 610, height: 844, shot: 'output/playwright/memory-stable-full.png' }, { alt: 'UMAF DDR SPD Timing 已记录字段', width: 3072, height: 2024, shot: 'output/playwright/umaf-full.png' }, { alt: 'UMAF DDR Non-SPD Timing 已记录字段', width: 3072, height: 1208 }]; for (const item of cases) { const locator = page.getByRole('button', { name: item.alt + '，打开完整大图' }); await locator.focus(); await page.keyboard.press('Space'); await page.waitForFunction(() => { const dialog = document.querySelector('#image-dialog'); const full = dialog?.querySelector('img'); return dialog?.open && full?.complete && full.naturalWidth > 0 && full.naturalHeight > 0; }); const dimensions = await page.locator('#image-dialog img').evaluate((full) => ({ width: full.naturalWidth, height: full.naturalHeight })); if (dimensions.width !== item.width || dimensions.height !== item.height) throw new Error(item.alt + ': ' + JSON.stringify(dimensions)); if (item.shot) await page.screenshot({ path: item.shot }); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#image-dialog')?.open); }"
```

Expected: Space opens each image, the revised UMAF images resolve to 3072 × 2024 and 3072 × 1208, ZenTimings resolves to 610 × 844, screenshots are saved for visual review, and Escape closes the dialog each time.

- [ ] **Step 12: Visually inspect desktop, mobile, and full-size memory screenshots**

Use the local image viewer on:

```text
output/playwright/full-1440.png
output/playwright/full-1920.png
output/playwright/full-mobile.png
output/playwright/memory-stable-full.png
output/playwright/umaf-full.png
```

Acceptance points: no 12px-or-smaller descriptive copy; green text never sits on white imagery; the white hero image ends before the dark metric bar; the mobile hero image shows its full width without cropping; GPU/power and both UMAF evidence pairs are vertically stacked at their original aspect ratios; ZenTimings is visibly the current stable result; UMAF is visibly a partial recovery reference; Bilibili titles and BV numbers are readable; no user-facing build terminology appears.

- [ ] **Step 13: Stop the server and Playwright browser**

Stop the tracked `npm run serve` session and run:

```powershell
& 'E:\Git\bin\bash.exe' '/c/Users/lz199/.codex/skills/playwright/scripts/playwright_cli.sh' close
```

- [ ] **Step 14: Attempt workspace diagnostics**

Use `vscode_mcp_server` on the modified `.mjs`, `.js`, `.css`, and HTML source files. If it is unavailable in the session, record that diagnostics were skipped because the MCP server/tool was not available; do not claim diagnostics passed.

- [ ] **Step 15: Final verification and commit**

Run:

```powershell
npm run verify
git diff --check
git status --short
```

Expected: tests/build/validator pass, `git diff --check` prints nothing, and only intended files are modified.

Commit:

```powershell
git add package.json package-lock.json scripts src tests assets/source dist/laptop-performance-handoff.html
git commit -m "feat: deliver laptop performance handoff page"
```

### Task 8: Revised evidence stacks and uncropped mobile hero

> Late requirement update: execute this task before resuming Task 7 browser QA.

**Files:**
- Modify: `assets/source/UMAF内存时序调整1-DDR SPD Timing.jpg`
- Modify: `assets/source/UMAF内存时序调整2-DDR Non-SPD Timing.jpg`
- Modify: `tests/content.test.mjs`
- Modify: `tests/layout-source.test.mjs`
- Modify: `src/index.template.html`
- Modify: `src/styles.css`
- Modify: `dist/laptop-performance-handoff.html`

- [ ] **Step 1: Write the failing wording and media-layout regression contracts**

In `tests/content.test.mjs`, require the visible phrases `性能调校参考档案`, `当前调校基线已稳定运行`, `当前设置基线`, and `REFERENCE RULE / 使用原则`; add `交接` to the forbidden visible-copy list.

Add `import sharp from 'sharp';` and this test to `tests/layout-source.test.mjs`:

```js
test('evidence images stack vertically at their original ratios and the mobile hero is uncropped', async () => {
  const [css, template] = await Promise.all([
    readFile('src/styles.css', 'utf8'),
    readFile('src/index.template.html', 'utf8'),
  ]);

  assert.match(template, /class="media-stack"/);
  assert.match(template, /class="umaf-stack"/);
  assert.equal((template.match(/class="umaf-image"/g) ?? []).length, 2);
  assert.equal((template.match(/class="tutorial-meta"/g) ?? []).length, 2);
  assert.equal((template.match(/class="tutorial-copy"/g) ?? []).length, 2);
  assert.equal((template.match(/class="tutorial-link"/g) ?? []).length, 2);
  assert.doesNotMatch(template, /media-pair|umaf-grid|umaf-crop/);
  assert.match(css, /\.media-stack\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.umaf-stack\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.umaf-image\s*\{[^}]*height:\s*auto;[^}]*object-fit:\s*contain/);
  assert.match(css, /\.tutorial\s*\{[^}]*grid-template-columns:\s*8\.5rem minmax\(0, 1fr\) minmax\(15rem, 18rem\)/);
  assert.match(css, /\.tutorial-link\s*\{[^}]*display:\s*flex;[^}]*background:\s*var\(--acid\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.hero-media\s*\{\s*height:\s*auto;\s*\}[\s\S]*?\.hero-media img\s*\{[^}]*height:\s*auto;[^}]*object-fit:\s*contain/);

  const [spd, nonSpd] = await Promise.all([
    sharp('assets/source/UMAF内存时序调整1-DDR SPD Timing.jpg').metadata(),
    sharp('assets/source/UMAF内存时序调整2-DDR Non-SPD Timing.jpg').metadata(),
  ]);
  assert.deepEqual([spd.width, spd.height], [3072, 2024]);
  assert.deepEqual([nonSpd.width, nonSpd.height], [3072, 1208]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/content.test.mjs tests/layout-source.test.mjs`

Expected: FAIL because the visible page still uses “交接”, tutorial links use the malformed four-child/three-column structure, evidence uses horizontal pair/grid classes, and the mobile hero uses a fixed-height cover crop.

- [ ] **Step 3: Update the semantic media wrappers**

In `src/index.template.html`:

- Replace all visible “交接”/`HANDOFF` wording with the approved `性能调校参考档案`, `当前调校基线已稳定运行`, `当前设置基线`, `REFERENCE RULE / 使用原则`, `TUNING GUIDE`, and `USER REFERENCE` wording.
- Rebuild each tutorial article as `tutorial-meta` + `tutorial-copy` + `tutorial-link`; the link contains a strong `打开 B 站教程 ↗` label and a secondary visible URL while preserving the exact approved href.
- Rename the GPU/power wrapper from `media-pair` to `media-stack` while preserving GPU first and power mode second.
- Rename the UMAF wrapper from `umaf-grid` to `umaf-stack` while preserving SPD first and Non-SPD second.
- Rename both UMAF image classes from `umaf-crop` to `umaf-image`.

- [ ] **Step 4: Implement full-ratio vertical layout and the mobile hero fix**

In `src/styles.css`:

- Make the tutorial a stable three-column desktop row (`8.5rem`, flexible copy, `15–18rem` action area); style `.tutorial-link` as a full, readable acid-green action block, and stack it at full width on mobile.
- Make `.media-stack` and `.umaf-stack` single-column grids at every viewport.
- Give `.umaf-image` `width: 100%`, `height: auto`, and `object-fit: contain`; remove fixed-height cropping and `object-position`.
- Under `@media (max-width: 900px)`, set `.hero-media` to `height: auto` and `.hero-media img` to `height: auto; object-fit: contain` so the square product image is never horizontally cropped.
- Remove the obsolete stack classes from the responsive grid-flattening selector.

- [ ] **Step 5: Verify GREEN, rebuild, and run the project suite**

Run:

```powershell
node --test tests/content.test.mjs tests/layout-source.test.mjs
npm test
npm run build
git diff --check
```

Expected: the focused test and full suite pass, the revised source images convert pixel-identically at 3072 × 2024 and 3072 × 1208, and the standalone HTML is rebuilt.

- [ ] **Step 6: Commit only the late media revision**

```powershell
git add -- 'assets/source/UMAF内存时序调整1-DDR SPD Timing.jpg' 'assets/source/UMAF内存时序调整2-DDR Non-SPD Timing.jpg' tests/content.test.mjs tests/layout-source.test.mjs src/index.template.html src/styles.css dist/laptop-performance-handoff.html
git commit -m "fix: refine reference wording and evidence layout"
```

---

## Plan self-review

- Spec coverage: all original twelve items, 16GB × 2 replacement, both Bilibili tutorials, image fidelity, standalone delivery, full-width page-level scrolling, readable type scale, capture mode, stable 5600 wording, partial UMAF recovery scope, and forbidden developer-facing copy map to explicit tasks and tests.
- Placeholder scan: no `TBD`, `TODO`, “implement later”, or unspecified error-handling steps remain.
- Type/name consistency: the asset IDs in `src/assets.mjs`, template placeholders, build script, tests, and final validator use the same ten canonical IDs.
- Scope: one static artifact and its deterministic build/verification pipeline; no backend, deployment, live hardware detection, or unrelated tooling.

## Primary implementation references

- Sharp WebP output and lossless options: <https://sharp.pixelplumbing.com/api-output/>
- Sharp installation and supported input formats: <https://sharp.pixelplumbing.com/install/>
