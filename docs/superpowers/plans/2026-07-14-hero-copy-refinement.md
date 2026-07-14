# Hero Copy Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精简顶栏右侧和首屏硬件状态文案，加入作者署名，并准确说明关闭 CCD1 后减少的核心、线程、L3 与实际取舍。

**Architecture:** 保留现有顶栏、Hero 和五张状态卡的 HTML/CSS 结构，只修改 `src/index.template.html` 的可见文案。`tests/content.test.mjs` 继续作为内容契约，先锁定精简后的精确文本，再通过现有构建、双端截图脚本和 GitHub Actions 验证生成物。

**Tech Stack:** HTML 模板、CSS、Node.js `node:test`、Playwright 截图脚本、CloudBase GitHub Actions。

## Global Constraints

- 顶栏右侧恰好保留 `蛟龙 16 Pro · 8945HX · 5070 Ti`、`2026-07-12`、`作者：刘卓`。
- 不改变顶栏、Hero 或五张状态卡的 DOM 结构和响应式列数。
- CPU 卡保留 `5.0 GHz`，并说明 `16 核 32 线程 → 8 核 16 线程`、`可用 L3 64MB → 32MB`、减少跨 CCD 调度和发热，以及多核性能下降的代价。
- 继续明确 CPU 睿频已关闭。
- 其余四张状态卡删除标题和正文之间的重复措辞，但保留 UXTU -20、独显直连、内存条来源、海力士 M-die、双通道、5200 C42 到 5600 C36 的事实。
- 不改正文教程、截图、附录参数、CSS 或构建逻辑。

---

### Task 1: 收紧顶栏与首屏状态文案

**Files:**
- Modify: `tests/content.test.mjs:24-65`
- Modify: `src/index.template.html:14-34`

**Interfaces:**
- Consumes: 现有 `.topbar`、`.hero-copy`、`.hero-metrics` DOM 结构与 `visibleText()` 测试辅助函数。
- Produces: 精简后的顶栏、作者署名、五张首屏状态卡以及保持不变的响应式布局。

- [ ] **Step 1: 写失败的内容契约**

  在 `source prioritizes completed adjustments, actions, tools, evidence and memory appendix` 测试中，读取模板后加入顶栏契约：

  ```js
  const topbar = template.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1];
  assert.ok(topbar, 'missing topbar');
  assert.match(
    topbar,
    /<div><span>蛟龙 16 Pro · 8945HX · 5070 Ti<\/span><span>2026-07-12<\/span><b>作者：刘卓<\/b><\/div>/,
  );
  assert.doesNotMatch(topbar, /设备：|用途：|当前调校基线已稳定运行|Ryzen 9|RTX /);
  ```

  将 Hero 介绍和五张卡的精确契约更新为：

  ```js
  assert.match(
    heroSource,
    /<p>记录本机已完成的调校，供参数回退、异常恢复和后续调整参考。<\/p>/,
  );
  assert.match(
    heroMetrics,
    /<div><dt>CPU 当前状态<\/dt><dd>5\.0 GHz<\/dd><p>CCD1 已关闭：16 核 32 线程 → 8 核 16 线程；可用 L3 64MB → 32MB。减少跨 CCD 调度和发热，代价是多核性能下降；CPU 睿频已关闭。<\/p><\/div>/,
  );
  assert.match(
    heroMetrics,
    /<div><dt>UXTU 当前状态<\/dt><dd>-20<\/dd><p>全核负压 -20<\/p><\/div>/,
  );
  assert.match(
    heroMetrics,
    /<div><dt>显卡当前状态<\/dt><dd>独显直连<\/dd><p>独显直连<\/p><\/div>/,
  );
  assert.match(
    heroMetrics,
    /<div><dt>内存通道<\/dt><dd>16GB × 2<\/dd><p>英睿达镁光 32GB 单条 → 十铨 16GB × 2（海力士 M-die）双通道。<\/p><\/div>/,
  );
  assert.match(
    heroMetrics,
    /<div class="hero-metric--memory"><dt>内存超频与时序<\/dt><dd>5600 MT\/s · C36<\/dd><p>默认 5200 C42 → 当前 5600 C36，已稳定运行。<\/p><\/div>/,
  );
  ```

  同步把 Hero 必备短语数组中的旧长句替换为上述新句。

- [ ] **Step 2: 运行 focused test 并确认 RED**

  Run: `node --test tests/content.test.mjs`

  Expected: FAIL，首先报告缺少精简顶栏或 `作者：刘卓`，证明测试仍读到旧模板。

- [ ] **Step 3: 最小修改模板文案**

  将顶栏右侧替换为：

  ```html
  <div><span>蛟龙 16 Pro · 8945HX · 5070 Ti</span><span>2026-07-12</span><b>作者：刘卓</b></div>
  ```

  将 Hero 介绍替换为：

  ```html
  <p>记录本机已完成的调校，供参数回退、异常恢复和后续调整参考。</p>
  ```

  将五张状态卡替换为：

  ```html
  <div><dt>CPU 当前状态</dt><dd>5.0 GHz</dd><p>CCD1 已关闭：16 核 32 线程 → 8 核 16 线程；可用 L3 64MB → 32MB。减少跨 CCD 调度和发热，代价是多核性能下降；CPU 睿频已关闭。</p></div>
  <div><dt>UXTU 当前状态</dt><dd>-20</dd><p>全核负压 -20</p></div>
  <div><dt>显卡当前状态</dt><dd>独显直连</dd><p>独显直连</p></div>
  <div><dt>内存通道</dt><dd>16GB × 2</dd><p>英睿达镁光 32GB 单条 → 十铨 16GB × 2（海力士 M-die）双通道。</p></div>
  <div class="hero-metric--memory"><dt>内存超频与时序</dt><dd>5600 MT/s · C36</dd><p>默认 5200 C42 → 当前 5600 C36，已稳定运行。</p></div>
  ```

- [ ] **Step 4: 运行 focused GREEN**

  Run: `node --test tests/content.test.mjs`

  Expected: PASS，内容测试全部通过。

- [ ] **Step 5: 运行完整构建与双端视觉验收**

  Run: `npm run verify`

  Expected: 所有测试通过，`dist/index.html` 构建成功，standalone validator 通过。

  Run: `npm run capture`

  Expected: 生成 `output/playwright/pc-1440-2x.png` 和 `output/playwright/mobile-390-3x.png`，浏览器审计无横向溢出、无内部滚动容器、十张图片全部加载。

  使用图片查看工具核对：顶栏作者可见、桌面顶栏未拥挤、CPU 卡没有截断、移动端五张卡按单列完整显示。

- [ ] **Step 6: 复核并提交**

  Run: `git diff --check`

  Expected: 无输出，退出码 0。

  Run: `git status --short`

  Expected: 只包含 `src/index.template.html`、`tests/content.test.mjs` 和本计划文件。

  ```bash
  git add src/index.template.html tests/content.test.mjs docs/superpowers/plans/2026-07-14-hero-copy-refinement.md
  git commit -m "content: refine hero hardware summary"
  ```

- [ ] **Step 7: 推送并确认自动部署**

  Run: `git push origin master`

  Run: `RUN_ID="$(gh run list --repo Trendymen/laptop-opt --workflow deploy-cloudbase.yml --branch master --limit 5 --json databaseId,headSha --jq --arg sha "$(git rev-parse HEAD)" '.[] | select(.headSha == $sha) | .databaseId' | head -1)"`

  Run: `gh run watch "$RUN_ID" --repo Trendymen/laptop-opt --exit-status`

  Expected: verify、build、CloudBase 登录与静态托管部署全部成功；公网 `index.html` 与本地 `dist/index.html` SHA-256 一致。
