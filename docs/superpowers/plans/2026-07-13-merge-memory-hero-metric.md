# Merge Memory Hero Metric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Hero 中重复的“内存超频”和“内存时序”合并为一张完整表达频率与时序的状态卡。

**Architecture:** 保持现有 `hero-metrics` 三列、两列、单列响应式网格，只给合并后的内存卡增加独立修饰类。该卡在桌面与平板横跨两列，在 600px 以下回到单列，不影响页尾完整内存记录。

**Tech Stack:** 语义化 HTML、原生 CSS、Node.js `node:test`、现有 Node ESM 构建与 Playwright 截图链路。

## Global Constraints

- Hero 只保留一张“内存超频与时序”卡。
- 主值固定为 `5600 MT/s · C36`。
- 调整记录固定为“默认 5200 MT/s / C42 → 当前 5600 MT/s / C36；内存超频和时序收紧已完成，并稳定运行。”
- “内存通道”卡正文固定为“原装 32GB 镁光单条已更换为十铨 16GB × 2（M-die）双内存条，组成 32GB 双通道。”
- 详细附录继续保留完整频率、时序、ZenTimings 和 UMAF 回退信息。
- 不改变其他四项已完成调整的数值和含义。

---

### Task 1: 合并 Hero 内存状态卡

**Files:**
- Modify: `tests/content.test.mjs`
- Modify: `tests/layout-source.test.mjs`
- Modify: `src/index.template.html`
- Modify: `src/styles.css`
- Modify: `dist/index.html`

**Interfaces:**
- Consumes: `src/index.template.html` 中的 `.hero-metrics` 定义列表与 `src/styles.css` 的响应式网格。
- Produces: 唯一 `.hero-metric--memory` 卡片，以及由 `scripts/build.mjs` 生成的 `dist/index.html`。

- [ ] **Step 1: 写失败测试**

  在内容测试中断言 Hero 恰有五张指标卡，且仅有一张标题为“内存超频与时序”的卡；主值和说明使用全新合并文案。“内存通道”卡必须记录镁光 32GB 单条更换为十铨 16GB × 2（M-die）及组成 32GB 双通道。在布局测试中断言 `.hero-metric--memory` 默认 `grid-column: span 2`，600px 以下为 `grid-column: auto`。

- [ ] **Step 2: 运行测试并确认 RED**

  Run: `node --test tests/content.test.mjs tests/layout-source.test.mjs`

  Expected: FAIL，旧模板仍有六张卡及两张独立内存卡。

- [ ] **Step 3: 写最小实现**

  删除两张旧内存卡，替换为：

  ```html
  <div class="hero-metric--memory"><dt>内存超频与时序</dt><dd>5600 MT/s · C36</dd><p>默认 5200 MT/s / C42 → 当前 5600 MT/s / C36；内存超频和时序收紧已完成，并稳定运行。</p></div>
  ```

  CSS 增加：

  ```css
  .hero-metric--memory { grid-column: span 2; }
  @media (max-width: 600px) {
    .hero-metric--memory { grid-column: auto; }
  }
  ```

- [ ] **Step 4: 运行测试并确认 GREEN**

  Run: `node --test tests/content.test.mjs tests/layout-source.test.mjs`

  Expected: PASS，相关测试无失败。

- [ ] **Step 5: 重建、截图和完整验证**

  Run: `npm run verify`

  Expected: 全部测试通过，`dist/index.html` 构建并通过 standalone validator。

  Run: `npm run capture:verify`

  Expected: PC 2x、移动端 3x 截图与禁用 JavaScript 浏览器回归通过。

- [ ] **Step 6: 提交**

  ```bash
  git add docs/superpowers/specs/2026-07-13-umaf-zentimings-content-design.md docs/superpowers/plans/2026-07-13-merge-memory-hero-metric.md tests/content.test.mjs tests/layout-source.test.mjs src/index.template.html src/styles.css dist/index.html output/playwright/pc-1440-2x.png output/playwright/mobile-390-3x.png
  git commit -m "style: merge memory hero metrics"
  ```
