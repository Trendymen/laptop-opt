# 页面内容优先级重排实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让首屏一次性说明所有已完成调整，把“之后可以怎么调”和“已经安装的软件”前置，并将设置证据、教程、内存时序档案依次后置。

**Architecture:** 直接重排现有语义 HTML，不引入数据层或框架。Hero 使用六项已完成调整替代重复的 00 基线；现有截图组件、教程组件和内存证据组件继续复用，仅增加少量首屏与附录样式。

**Tech Stack:** 语义化 HTML、原生 CSS、Node.js ESM、node:test、Playwright 浏览器验收

## Global Constraints

- 首屏必须明确出现内存超频、5600 MT/s、16GB × 2、时序已调整并稳定运行。
- 删除独立的“00 当前设置基线”，不得紧邻 Hero 再复制一套基线网格。
- 01 为“之后可以怎么调”，02 为“已经安装的软件”。
- 设置截图、异常恢复和教程位于 01/02 之后。
- 内存与 UMAF 详细档案位于最末尾，始终直接可见，不使用折叠、手风琴、弹窗或点击放大。
- 10 张图片、两条 B 站链接、所有记录值和无损图片质量保持不变。
- 页面保持文档级滚动，无横向溢出和内部纵向滚动。

---

### Task 1: Lock the new information architecture with failing tests

**Files:**
- Modify: `tests/content.test.mjs`
- Modify: `tests/layout-source.test.mjs`
- Modify: `tests/interaction-source.test.mjs`

**Interfaces:**
- Produces: source-level contracts for Hero copy, section order, image uniqueness and always-visible appendix.

- [ ] **Step 1: Add a source-order helper and failing content contract**

Add to `tests/content.test.mjs`:

```js
function assertInOrder(source, markers) {
  let previous = -1;
  for (const marker of markers) {
    const current = source.indexOf(marker);
    assert.ok(current > previous, `out of order or missing: ${marker}`);
    previous = current;
  }
}

test('source prioritizes completed adjustments, actions, tools, evidence and memory appendix', async () => {
  const template = await readFile('src/index.template.html', 'utf8');
  const heroStart = template.indexOf('<section class="hero"');
  const heroEnd = template.indexOf('</section>', heroStart);
  const heroText = visibleText(template.slice(heroStart, heroEnd));

  for (const phrase of [
    '已完成调整',
    'CCD1 已关闭',
    'CPU 睿频已关闭',
    '5.0 GHz',
    'UXTU 全核负压 -20',
    '显卡保持独显直连',
    '16GB × 2 双通道',
    '内存超频已完成',
    '5600 MT/s',
    '内存时序已调整并稳定运行',
  ]) {
    assert.ok(heroText.includes(phrase), `missing hero adjustment: ${phrase}`);
  }

  assert.doesNotMatch(template, /id="baseline"|>00<|当前设置基线/);
  assertInOrder(template, [
    'id="future"',
    'id="tools"',
    'id="settings"',
    'id="recovery"',
    'id="memory-appendix"',
  ]);

  const criticalStart = template.indexOf('<aside class="critical-note"');
  const criticalEnd = template.indexOf('</aside>', criticalStart);
  const criticalText = visibleText(template.slice(criticalStart, criticalEnd));
  assert.doesNotMatch(criticalText, /UMAF|80MB/);
  for (const phrase of ['一次只改一项', '修改前保留当前值截图', '不稳定']) {
    assert.ok(criticalText.includes(phrase), `missing operation principle: ${phrase}`);
  }

  const appendixStart = template.indexOf('id="memory-appendix"');
  const appendix = template.slice(appendixStart);
  for (const assetId of ['memory-stable', 'umaf-spd', 'umaf-non-spd']) {
    assert.equal(
      (appendix.match(new RegExp(`\\{\\{asset:${assetId}\\}\\}`, 'g')) ?? []).length,
      1,
    );
  }

  for (const assetId of [
    'device-hero', 'cpu-frequency', 'control-power', 'gpu-mode',
    'console-power-mode', 'uxtu-undervolt', 'uxtu-recovery',
    'memory-stable', 'umaf-spd', 'umaf-non-spd',
  ]) {
    assert.equal(
      (template.match(new RegExp(`\\{\\{asset:${assetId}\\}\\}`, 'g')) ?? []).length,
      1,
      `expected one placeholder for ${assetId}`,
    );
  }
});
```

- [ ] **Step 2: Add failing layout and interaction contracts**

In `tests/layout-source.test.mjs`, extend the second test:

```js
assert.match(template, /class="hero-adjustments"/);
assert.match(css, /\.hero-adjustments\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
assert.match(css, /\.hero-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.hero-metrics\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.hero-metrics\s*\{[^}]*grid-template-columns:\s*1fr/);
assert.doesNotMatch(css, /\.baseline-grid/);
```

In `tests/interaction-source.test.mjs`, add:

```js
assert.doesNotMatch(template, /<details\b|<summary\b|hidden|aria-expanded|data-accordion/);
assert.doesNotMatch(client, /aria-expanded|data-accordion|toggleAttribute\(['"]hidden/);
```

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --test tests/content.test.mjs tests/layout-source.test.mjs tests/interaction-source.test.mjs
```

Expected: content test fails because the Hero lacks explicit adjustment copy and old baseline/order remain; layout test fails because `.hero-adjustments` and responsive 3/2/1-column rules do not exist.

- [ ] **Step 4: Commit only after later GREEN**

Do not commit RED tests separately. Keep them unstaged until Tasks 2 and 3 make them pass.

---

### Task 2: Reorder the HTML and preserve all evidence

**Files:**
- Modify: `src/index.template.html`
- Modify: `tests/content.test.mjs`

**Interfaces:**
- Consumes: Task 1 source contracts.
- Produces: `future → tools → settings → recovery → memory-appendix` document order.

- [ ] **Step 1: Replace the Hero metrics and general warning**

Replace the current `.hero-metrics` block with:

```html
<div class="hero-adjustments">
  <p class="adjustments-label">已完成调整</p>
  <dl class="hero-metrics">
    <div><dt>CPU 当前状态</dt><dd>5.0 GHz</dd><p>CCD1 已关闭，CPU 睿频已关闭</p></div>
    <div><dt>UXTU 当前状态</dt><dd>-20</dd><p>UXTU 全核负压 -20</p></div>
    <div><dt>显卡当前状态</dt><dd>独显直连</dd><p>显卡保持独显直连</p></div>
    <div><dt>内存通道</dt><dd>16GB × 2</dd><p>16GB × 2 双通道</p></div>
    <div><dt>内存超频</dt><dd>5600 MT/s</dd><p>内存超频已完成，当前稳定运行</p></div>
    <div><dt>内存时序</dt><dd>已调整</dd><p>内存时序已调整并稳定运行</p></div>
  </dl>
</div>
```

Replace the current UMAF warning bar with:

```html
<aside class="critical-note"><strong>操作原则</strong><span>一次只改一项；修改前保留当前值截图。不稳定时先回到本文记录值，再逐项定位。</span></aside>
```

Delete the complete `<section ... id="baseline">...</section>` block.

- [ ] **Step 2: Rebuild `main` in the approved order**

Move the existing future and tools sections to the start of `main`, renumbering only their headings:

```html
<section class="chapter" id="future" data-reveal>
  <header class="chapter-heading"><span>01</span><div><h2>之后可以怎么调</h2><p>这里只讨论 CPU 定频和散热条件；内存 5600 MT/s 与当前时序不属于待提高项目。</p></div></header>
  <div class="future-grid"><div class="temperature"><small>游戏温度参考</small><strong>85–87°C</strong><p>使用上风压散热器后，最终游戏温度稳定在这个范围可接受。</p></div><ol><li><b>先改善散热：</b>安装并使用上风压散热器。</li><li><b>再调整接电定频：</b>Windows 高性能电源计划中的接通电源 5000 MHz → 5200 MHz；电池 4500 MHz 不改。</li><li><b>一次只改一项：</b>保留截图，在实际游戏和稳定性测试中验证。</li></ol></div>
</section>

<section class="chapter" id="tools" data-reveal>
  <header class="chapter-heading"><span>02</span><div><h2>已经安装的软件</h2><p>监控工具可以直接使用；压力测试和参数判断工具先询问 AI 再使用。</p></div></header>
  <div class="tools-list"><article><small>鼠标驱动</small><h3>MCHOSE HUB</h3><p>新鼠标驱动，桌面已有快捷方式。</p></article><article><small>游戏监控</small><h3>小飞机（MSI Afterburner）</h3><p>查看游戏内温度、频率、占用率和帧率。</p></article><article><small>传感器</small><h3>HWiNFO 仅传感器模式</h3><p>查看温度、功耗、频率和峰值。</p></article><article><small>先询问 AI 再使用</small><h3>AIDA64 · TM5 · ZenTimings</h3><p>先确认用途、测试步骤、停止条件和结果判断，再开始压力测试或参数调整。</p></article></div>
</section>
```

Create section 03 from the existing CPU, GPU and UXTU evidence blocks, without tutorials or recovery:

```html
<section class="chapter" id="settings" data-reveal>
  <header class="chapter-heading"><span>03</span><div><h2>当前关键设置与截图</h2><p>以下截图用于确认设置位置和恢复当前记录值，不是其他设备可以直接照抄的通用参数。</p></div></header>
  <div class="media-step"><h3>接通电源 5000 MHz</h3><p>Windows 高性能电源计划：电池 4500 MHz，接通电源 5000 MHz。</p><img src="{{asset:cpu-frequency}}" alt="Windows 高性能电源计划处理器最大频率设置"></div>
  <div class="media-step"><h3>CPU 功耗上限：SPL 65W · sPPT 85W · fPPT 85W</h3><p>机械革命控制台自定义模式限制 CPU 功耗上限，目的为控制极限 CPU 温度。</p><img src="{{asset:control-power}}" alt="机械革命控制台自定义模式 CPU 功耗限制"></div>
  <div class="media-stack"><figure><img src="{{asset:gpu-mode}}" alt="机械革命控制台独显直连设置"><figcaption>显卡模式：独显直连</figcaption></figure><figure><img src="{{asset:console-power-mode}}" alt="机械革命控制台高性能电源模式关闭"><figcaption>高性能电源模式保持关闭</figcaption></figure></div>
  <div class="media-step"><h3>AMD Curve Optimiser · All Core Offset -20</h3><p>如果出现蓝屏、重启、游戏或应用崩溃，优先恢复默认并重新验证。</p><img src="{{asset:uxtu-undervolt}}" alt="UXTU 全核负压负 20 设置"></div>
</section>
```

Create section 04 with recovery followed by both unchanged tutorial links:

```html
<section class="chapter" id="recovery" data-reveal>
  <header class="chapter-heading"><span>04</span><div><h2>异常恢复与教程</h2><p>先按当前记录恢复；需要进入 BIOS / UMAF 或重新理解设置步骤时，再查看教程。</p></div></header>
  <div class="media-step recovery"><h3>UXTU 没自启，手动打开也没反应</h3><p>删除 AppData\Local\JamesCJ60 下截图红圈所示的 Universal x86 Tuning Utility 配置文件夹。删除后重新打开 UXTU，并开启“开机自启”和“开机自启自动应用配置”。</p><img src="{{asset:uxtu-recovery}}" alt="UXTU 无法启动时需要删除的配置文件夹"></div>
  <article class="tutorial" id="tutorial-1"><div class="tutorial-meta"><small>教程 01 · BV1yv78zQEnD · 22:35</small></div><div class="tutorial-copy"><h3>全网最细！保姆级笔记本优化教程之cpu篇，小白也能降压定频，拯救你的cpu！适配于拯救者，鸡哥等绝大多数机型，演示机型8945hx 5070ti蛟龙16pro</h3><p>用于关闭 CCD1、BIOS 解锁、UMAF 安装和进入方式。</p></div><a class="tutorial-link" href="https://www.bilibili.com/video/BV1yv78zQEnD/?share_source=copy_web&amp;vd_source=91e679d463038976da1b6275f56aec3c&amp;t=1355" target="_blank" rel="noreferrer"><strong>打开 B 站教程 ↗</strong><span>www.bilibili.com/video/BV1yv78zQEnD</span></a></article>
  <article class="tutorial"><div class="tutorial-meta"><small>教程 02 · BV1mvFpzoEp6</small></div><div class="tutorial-copy"><h3>蛟龙16pro降温静音焚决（同类型笔记本直接可以抄作业）</h3><p>用于关闭 CPU 睿频、调出高性能电源计划和理解降温思路。</p></div><a class="tutorial-link" href="https://www.bilibili.com/video/BV1mvFpzoEp6/?share_source=copy_web&amp;vd_source=91e679d463038976da1b6275f56aec3c" target="_blank" rel="noreferrer"><strong>打开 B 站教程 ↗</strong><span>www.bilibili.com/video/BV1mvFpzoEp6</span></a></article>
</section>
```

Create the final always-visible appendix from the existing memory section:

```html
<section class="chapter memory-chapter" id="memory-appendix" data-reveal>
  <header class="chapter-heading"><span>附录</span><div><h2>内存超频与时序记录</h2><p>内存超频和时序已经调整完成；本节只用于确认当前结果和按已记录字段回退。</p></div></header>
  <div class="stable-result"><div><small>CURRENT STABLE RESULT</small><h3>5600 MT/s 正常保持</h3><p>原装 32GB 单条已经替换为 16GB × 2 双通道。内存超频已完成，内存时序已调整并稳定运行；不把本节作为继续提高频率的建议。</p><p><strong>ZenTimings = 当前 Windows 实际运行结果</strong></p></div><img src="{{asset:memory-stable}}" alt="ZenTimings 显示的当前稳定内存参数"></div>
  <div class="umaf-reference"><header><small>局部回退 / 恢复参考</small><h3>UMAF = 已记录字段的局部参数入口和回退对照</h3><p>两张图只覆盖部分时序与小参数。设置被回退时，只恢复图中明确记录的字段；未记录参数不要凭空推断。</p></header><div class="umaf-stack"><figure><img class="umaf-image" src="{{asset:umaf-spd}}" alt="UMAF DDR SPD Timing 已记录字段"><figcaption>DDR SPD Timing · 已记录字段</figcaption></figure><figure><img class="umaf-image" src="{{asset:umaf-non-spd}}" alt="UMAF DDR Non-SPD Timing 已记录字段"><figcaption>DDR Non-SPD Timing · 已记录字段</figcaption></figure></div><p class="umaf-warning">约 80MB 的 UMAF 分区不可删除或格式化。开机或重启时持续按 F2，选择最右边第三项，再进入后续界面的第二项；安装与进入方法参见教程 01。</p></div>
</section>
```

- [ ] **Step 3: Update the existing rendered-copy contract**

In the existing `required` array in `tests/content.test.mjs`:

- remove `'当前设置基线'`;
- add `'已完成调整'`, `'内存超频已完成'`, `'内存时序已调整并稳定运行'`, `'当前关键设置与截图'`, `'异常恢复与教程'`, and `'内存超频与时序记录'`;
- keep every existing hardware value, recovery phrase, tutorial title, BV number and UMAF warning.

No forbidden-copy rule or approved tutorial URL may be removed.

- [ ] **Step 4: Run content tests and commit GREEN HTML**

```bash
node --test tests/content.test.mjs
git diff --check
```

Expected: both content tests PASS, all ten asset placeholders occur once, and exact Bilibili URLs remain unchanged.

Commit:

```bash
git add src/index.template.html tests/content.test.mjs
git commit -m "feat: prioritize completed adjustments and next steps"
```

---

### Task 3: Implement responsive six-item Hero styling

**Files:**
- Modify: `src/styles.css`
- Modify: `tests/layout-source.test.mjs`
- Modify: `tests/interaction-source.test.mjs`

**Interfaces:**
- Consumes: Task 2 `.hero-adjustments` and six-item `.hero-metrics`.
- Produces: desktop 3×2, tablet 2×3 and mobile 1×6 layouts.

- [ ] **Step 1: Replace Hero and baseline CSS**

Replace the current `.hero-metrics` block and remove all `.baseline-grid` rules:

```css
.hero-adjustments { grid-column: 1 / -1; padding: 1.5rem var(--gutter) 2.5rem; border-top: 1px solid var(--line); background: var(--bg); }
.adjustments-label { margin: 0 0 .8rem; color: var(--violet); font-size: var(--font-label); font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
.hero-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
.hero-metrics > div { min-width: 0; padding: 1.4rem 1.25rem; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.hero-metrics dt { color: var(--muted); font-size: var(--font-note); }
.hero-metrics dd { margin: .35rem 0 0; color: var(--acid); font-size: var(--font-value); font-weight: 850; }
.hero-metrics p { margin: .45rem 0 0; color: var(--muted); font-size: var(--font-note); }
```

In the existing 900px media query use:

```css
  .hero-metrics { grid-template-columns: 1fr 1fr; }
```

Add after it:

```css
@media (max-width: 600px) {
  .hero-metrics { grid-template-columns: 1fr; }
}
```

Do not change evidence image sizing, document scrolling, minimum font variables or capture/reduced-motion styles.

- [ ] **Step 2: Run layout and interaction tests**

```bash
node --test tests/layout-source.test.mjs tests/interaction-source.test.mjs
```

Expected: all source-level layout and no-folding/no-dialog contracts PASS.

- [ ] **Step 3: Commit responsive styling**

```bash
git add src/styles.css tests/layout-source.test.mjs tests/interaction-source.test.mjs
git commit -m "style: adapt hero for completed adjustments"
```

---

### Task 4: Build, browser QA and final review

**Files:**
- Modify: `dist/index.html` (generated)
- Create or update: `output/playwright/content-priority-1440.png`
- Create or update: `output/playwright/content-priority-390.png`

- [ ] **Step 1: Run complete source and build verification**

```bash
npm run verify
git diff --check
```

Expected: all Node tests pass, build emits `dist/index.html`, standalone validator passes.

- [ ] **Step 2: Run the local server**

```bash
npm run serve
```

Keep the returned exec session id and terminate it after browser QA.

- [ ] **Step 3: Invoke the Playwright skill and inspect three isolated viewports**

At execution time, invoke the available `playwright` skill and open:

```text
http://127.0.0.1:4173/?capture=1
```

Check 1440×900, 1920×1080 and 390×844. In each viewport evaluate:

```js
() => ({
  horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  internalScrollers: [...document.querySelectorAll('*')].filter((element) => {
    const style = getComputedStyle(element);
    return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
  }).length,
  images: [...document.images].map((image) => ({
    complete: image.complete,
    width: image.naturalWidth,
  })),
  headings: [...document.querySelectorAll('.chapter-heading h2')].map((heading) => heading.textContent.trim()),
  baselinePresent: document.body.textContent.includes('当前设置基线'),
  foldedControls: document.querySelectorAll('details, summary, dialog, [aria-expanded], [data-accordion]').length,
})
```

Expected:

- `horizontalOverflow === false`
- `internalScrollers === 0`
- exactly 10 images, all complete with positive natural width
- headings ordered as 之后可以怎么调、已经安装的软件、当前关键设置与截图、异常恢复与教程、内存超频与时序记录
- `baselinePresent === false`
- `foldedControls === 0`

Save full-page screenshots for 1440 and 390 viewports.

- [ ] **Step 4: Stop the server and inspect final scope**

Terminate the server session, then run:

```bash
git status --short
git diff --stat
git diff --check
```

Expected: only intended source/tests, regenerated `dist/index.html`, and planned Playwright screenshots are changed.

- [ ] **Step 5: Run touched-file diagnostics and independent review**

Use `vscode_mcp_server` diagnostics on changed HTML, CSS and test files. If unavailable, report the skipped step and reason.

Request independent review against `docs/superpowers/specs/2026-07-13-content-priority-redesign.md`. Fix every Critical or Important issue and reuse the same reviewer for re-review.

- [ ] **Step 6: Commit generated output and QA artifacts**

```bash
git add src/index.template.html src/styles.css tests/content.test.mjs tests/layout-source.test.mjs tests/interaction-source.test.mjs dist/index.html output/playwright/content-priority-1440.png output/playwright/content-priority-390.png
git commit -m "feat: reorder laptop handoff content"
```
