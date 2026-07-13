# UMAF, ZenTimings, and UXTU Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correctly explain UXTU, ZenTimings, and UMAF in section 02 and the memory appendix, while moving the machine-specific UMAF partition warning into the software section.

**Architecture:** Keep the existing document order and component system. Strengthen source content contracts first, then replace the seven software cards, the UXTU evidence title, and the two vague appendix labels without changing any image, link, or interaction.

**Tech Stack:** Semantic HTML, native CSS, Node.js ESM, node:test.

## Global Constraints

- Section 02 contains distinct UXTU, ZenTimings, AIDA64 · TM5, and UMAF cards.
- `UXTU` is expanded as `Universal x86 Tuning Utility` in both section 02 and the section 03 negative-offset screenshot title.
- ZenTimings is described as read-only inspection and recording of applied memory parameters, not a timing editor or stability test.
- UMAF is described as a high-risk AMD PBS/CBS/Overclocking firmware configuration entry, not merely a recovery reference.
- The machine-specific `约 80MB` UMAF startup partition warning and F2 entry path appear in both section 02 and the final UMAF appendix, but not in the Hero.
- The section 03 title includes `UXTU（Universal x86 Tuning Utility）· AMD Curve Optimizer · All Core Offset -20`.
- Section 03 is titled `当前关键设置、截图与教程`, states both completed prerequisite lines before its screenshots, and contains both existing Bilibili tutorials.
- Within section 03 the source order is settings summary, tutorial 01, tutorial 02, then the first `cpu-frequency` screenshot.
- Section 04 is titled `异常恢复` and contains only the UXTU recovery instructions and image.
- The two vague equals-sign labels are removed; all 10 images and both tutorial URLs remain unchanged.
- The section 01 temperature card says `游戏时 CPU 温度` and `使用上风压散热器后，游戏时 CPU 温度稳定在 85–87°C 可接受。`.
- The section 02 UMAF `.tool-warning` has `1.5rem` bottom spacing before the following F2 entry paragraph.
- The Hero memory-timing card displays `C36 · 5600` and `默认 C42 / 5200 MT/s → 当前 C36 / 5600 MT/s；已完成超频和时序收紧，内存时序已调整并稳定运行。`.
- The final ZenTimings stable-result copy includes `内存从默认 C42 / 5200 MT/s 调整为当前 C36 / 5600 MT/s，并稳定运行。`.

---

### Task 1: Correct tool roles and evidence labels

**Files:**
- Modify: `tests/content.test.mjs`
- Modify: `src/index.template.html`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing `visibleText()` helper and ordered section IDs.
- Produces: scoped content contracts for `#tools`, `#settings`, and `#memory-appendix`.

- [ ] **Step 1: Write the failing scoped content test**

Extend the existing priority test in `tests/content.test.mjs` with:

```js
  const toolsStart = template.indexOf('id="tools"');
  const toolsEnd = template.indexOf('</section>', toolsStart);
  const toolsText = visibleText(template.slice(toolsStart, toolsEnd));
  for (const phrase of [
    'UXTU（Universal x86 Tuning Utility）',
    'Windows 下的处理器 / GPU 调校工具',
    'ZenTimings',
    '只读核对当前实际生效的内存参数',
    '不能用它修改时序，也不能替代稳定性测试',
    'AIDA64 · TM5',
    'UMAF',
    'AMD PBS / CBS / Overclocking',
    '真实固件参数',
    '本机约 80MB 的 UMAF 启动分区不可删除或格式化',
    '错误设置可能导致无法启动',
    '开机或重启时持续按 F2',
    '详细安装与进入方法见第 03 章教程 01',
  ]) assert.ok(toolsText.includes(phrase), `missing tool role: ${phrase}`);

  const settingsStart = template.indexOf('id="settings"');
  const settingsEnd = template.indexOf('</section>', settingsStart);
  const settingsText = visibleText(template.slice(settingsStart, settingsEnd));
  assert.ok(settingsText.includes(
    'UXTU（Universal x86 Tuning Utility）· AMD Curve Optimizer · All Core Offset -20',
  ));
  assert.ok(settingsText.includes('CCD1 已关闭 · BIOS 已解锁 · UMAF 已安装'));
  assert.ok(settingsText.includes('CPU 睿频已关闭 · 高性能电源计划已调出'));
  for (const marker of ['BV1yv78zQEnD', 'BV1mvFpzoEp6']) {
    assert.ok(settingsText.includes(marker), `tutorial must be in settings: ${marker}`);
  }
  assertInOrder(template.slice(settingsStart, settingsEnd), [
    'class="settings-summary"',
    'id="tutorial-1"',
    'BV1mvFpzoEp6',
    '{{asset:cpu-frequency}}',
  ]);

  const recoveryStart = template.indexOf('id="recovery"');
  const recoveryEnd = template.indexOf('</section>', recoveryStart);
  const recoveryText = visibleText(template.slice(recoveryStart, recoveryEnd));
  assert.ok(recoveryText.includes('UXTU 没自启，手动打开也没反应'));
  assert.doesNotMatch(recoveryText, /BV1yv78zQEnD|BV1mvFpzoEp6|教程 01|教程 02/);

  assert.equal(
    (template.match(/约 80MB 的 UMAF 启动分区不可删除或格式化/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(criticalText, /UMAF|80MB/);
  assert.match(appendix, /约 80MB 的 UMAF 启动分区不可删除或格式化/);
  assert.match(appendix, /持续按 F2/);
  assert.doesNotMatch(appendix, /ZenTimings\s*=|UMAF\s*=/);
  assert.ok(appendix.includes(
    '内存从默认 C42 / 5200 MT/s 调整为当前 C36 / 5600 MT/s，并稳定运行。',
  ));
  assert.doesNotMatch(template, /AIDA64 · TM5 · ZenTimings/);
  assert.ok(template.includes('游戏时 CPU 温度'));
  assert.ok(template.includes('使用上风压散热器后，游戏时 CPU 温度稳定在 85–87°C 可接受。'));
  assert.doesNotMatch(template, /最终游戏温度/);
  assert.ok(template.includes('C36 · 5600'));
  assert.ok(template.includes(
    '默认 C42 / 5200 MT/s → 当前 C36 / 5600 MT/s；已完成超频和时序收紧，内存时序已调整并稳定运行。',
  ));
```

Update the rendered `required` phrases by removing both old equals-sign labels and adding:

```js
'ZenTimings：核对当前实际生效的内存参数',
'UMAF：修改这些固件参数的位置，也是按记录值回退的入口',
'UXTU（Universal x86 Tuning Utility）',
'当前关键设置、截图与教程',
'异常恢复',
```

Remove the superseded required phrases `当前关键设置与截图` and `异常恢复与教程`, and replace the old warning phrase `约 80MB 的 UMAF 分区不可删除` with `本机约 80MB 的 UMAF 启动分区不可删除或格式化`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/content.test.mjs
```

Expected: FAIL because section 02 lacks UXTU/UMAF cards, ZenTimings is grouped with stress tools, section 03 omits the tool name, and the partition warning remains in the appendix.

- [ ] **Step 3: Replace section 02 with seven role-specific cards**

In `src/index.template.html`, keep the first three cards and replace the final combined card with these four cards:

```html
<article><small>Windows 调校 · 当前在用</small><h3>UXTU（Universal x86 Tuning Utility）</h3><p>Windows 下的处理器 / GPU 调校工具。本机用它应用 AMD Curve Optimizer 全核负压 -20；如果配置未自动应用，按第 04 章恢复开机自启和自动应用配置。</p></article>
<article><small>内存参数核对 · 只读</small><h3>ZenTimings</h3><p>只读核对当前实际生效的内存参数，包括主要时序、MCLK / UCLK / FCLK 与平台可读取的相关电压；用于重启后确认参数并保留截图。不能用它修改时序，也不能替代稳定性测试。</p></article>
<article><small>压力测试 · 先询问 AI</small><h3>AIDA64 · TM5</h3><p>用于压力测试和结果判断。开始前先确认测试步骤、停止条件和结果判断。</p></article>
<article class="tool-risk"><small>固件设置 · 高风险</small><h3>UMAF</h3><p>用于进入 AMD PBS / CBS / Overclocking 隐藏菜单，修改内存频率、时序等真实固件参数；错误设置可能导致无法启动。</p><p class="tool-warning">本机约 80MB 的 UMAF 启动分区不可删除或格式化。</p><p>进入：开机或重启时持续按 F2，选择最右边第三项，再进入后续界面的第二项；详细安装与进入方法见第 03 章教程 01。</p></article>
```

- [ ] **Step 4: Move both tutorials into section 03 and add the completed-settings summary**

Change the section headings to:

```html
<h2>当前关键设置、截图与教程</h2>
<h2>异常恢复</h2>
```

Insert this block immediately after the section 03 heading and before its first screenshot:

```html
<article class="settings-summary"><small>已完成前置设置</small><h3>CCD1 已关闭 · BIOS 已解锁 · UMAF 已安装</h3><h3>CPU 睿频已关闭 · 高性能电源计划已调出</h3><p>这些是当前机器已经完成的前置状态，不需要重复操作。需要重新安装、重新进入或回看步骤时，再看本章后面的教程 01 / 02。</p></article>
```

Move both existing `<article class="tutorial">` elements unchanged from section 04 to immediately after `.settings-summary` and before the first `cpu-frequency` `.media-step` in section 03. Keep tutorial 01 before tutorial 02 and preserve both exact titles, BV numbers, descriptions, timestamps, URLs, `target`, and `rel` attributes. Section 04 must then contain only its heading and the existing UXTU recovery `.media-step`.

Replace the section 03 heading and paragraph with:

```html
<h3>UXTU（Universal x86 Tuning Utility）· AMD Curve Optimizer · All Core Offset -20</h3>
<p>这是本机当前通过 UXTU 应用的全核负压记录。如果出现蓝屏、重启、游戏或应用崩溃，优先恢复默认并重新验证。</p>
```

- [ ] **Step 5: Rewrite the appendix roles**

Replace the ZenTimings appendix copy with:

```html
<p><strong>ZenTimings：核对当前实际生效的内存参数</strong></p>
<p>这张只读记录用于确认重启后 5600 MT/s、当前时序和控制器相关参数是否实际生效；ZenTimings 不负责修改参数，也不替代稳定性测试。</p>
```

Replace the UMAF appendix header, then retain an updated warning paragraph in its original position:

```html
<h3>UMAF：修改这些固件参数的位置，也是按记录值回退的入口</h3>
<p>两张图记录本机在 DDR SPD Timing 与 DDR Non-SPD Timing 中已经调整的字段。设置被回退时，只恢复图中明确记录的字段；未记录参数不要凭空推断。</p>
<p class="umaf-warning">本机约 80MB 的 UMAF 启动分区不可删除或格式化。进入：开机或重启时持续按 F2，选择最右边第三项，再进入后续界面的第二项；详细安装与进入方法见第 03 章教程 01。</p>
```

- [ ] **Step 6: Style the firmware summary and UMAF software warning**

In `src/styles.css`, replace the old appendix warning selectors with:

```css
.umaf-reference header p, .umaf-warning { color: var(--muted); }
.umaf-warning { margin-top: 2rem; padding: 1.3rem 1.5rem; border-left: 4px solid var(--danger); background: #171216; }
.settings-summary { margin-bottom: 4.5rem; padding: 1.75rem 2rem; border-left: 4px solid var(--acid); background: var(--surface); }
.settings-summary h3 { margin: .75rem 0 .5rem; font-size: 1.8rem; }
.settings-summary p { max-width: 52rem; margin: 0; color: var(--muted); }
.tool-risk { border-left: 4px solid var(--danger); }
.tools-list .tool-warning { margin: 1.25rem 0 1.5rem; padding: 1rem; color: var(--text); background: #26161b; }
```

Add a focused `tests/layout-source.test.mjs` contract before changing the CSS:

```js
assert.match(
  css,
  /\.tools-list \.tool-warning\s*\{[^}]*margin:\s*1\.25rem 0 1\.5rem/,
);
```

- [ ] **Step 7: Verify GREEN and preserve all source assets**

Run:

```bash
node --test tests/content.test.mjs tests/layout-source.test.mjs
npm test
git diff --check
```

Expected: 38 tests PASS after the later capture profile test is present, or the current suite count plus all new content assertions before that task; every asset placeholder remains unique and both tutorial URLs remain exact.

- [ ] **Step 8: Commit**

```bash
git add src/index.template.html src/styles.css tests/content.test.mjs
git commit -m "content: explain installed tuning tools"
```
