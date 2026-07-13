import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildPage, outputPath } from '../scripts/build.mjs';
import { integrationCacheDir } from './helpers/test-cache.mjs';

function visibleText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

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
    'C36 · 5600',
    '默认 C42 / 5200 MT/s → 当前 C36 / 5600 MT/s',
    '内存时序已调整并稳定运行',
  ]) {
    assert.ok(heroText.includes(phrase), `missing hero adjustment: ${phrase}`);
  }
  assert.doesNotMatch(heroText, /UMAF|80MB|持续按 F2/);

  assert.doesNotMatch(template, /id="baseline"|>00<|当前设置基线/);
  assertInOrder(template, [
    'id="future"',
    'id="tools"',
    'id="settings"',
    'id="recovery"',
    'id="memory-appendix"',
  ]);

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
    '进入：开机或重启时持续按 F2，选择最右边第三项，再进入后续界面的第二项；详细安装与进入方法见第 03 章教程 01。',
  ]) assert.ok(toolsText.includes(phrase), `missing tool role: ${phrase}`);
  assert.ok(toolsText.includes('本机约 80MB 的 UMAF 启动分区不可删除或格式化'));
  assert.ok(toolsText.includes('持续按 F2'));

  const futureStart = template.indexOf('id="future"');
  const futureEnd = template.indexOf('</section>', futureStart);
  const futureText = visibleText(template.slice(futureStart, futureEnd));
  assert.ok(futureText.includes('游戏时 CPU 温度'));
  assert.ok(futureText.includes(
    '使用上风压散热器后，游戏时 CPU 温度稳定在 85–87°C 可接受。',
  ));
  assert.doesNotMatch(
    futureText,
    /使用上风压散热器后，最终游戏温度稳定在这个范围可接受。/,
  );

  const settingsStart = template.indexOf('id="settings"');
  const settingsEnd = template.indexOf('</section>', settingsStart);
  const settingsSource = template.slice(settingsStart, settingsEnd);
  const settingsText = visibleText(settingsSource);
  assertInOrder(settingsSource, [
    'class="settings-summary"',
    'id="tutorial-1"',
    'BV1mvFpzoEp6',
    '{{asset:cpu-frequency}}',
  ]);
  assert.ok(settingsText.includes(
    'UXTU（Universal x86 Tuning Utility）· AMD Curve Optimizer · All Core Offset -20',
  ));
  assert.ok(settingsText.includes('CCD1 已关闭 · BIOS 已解锁 · UMAF 已安装'));
  assert.ok(settingsText.includes('CPU 睿频已关闭 · 高性能电源计划已调出'));
  for (const marker of ['BV1yv78zQEnD', 'BV1mvFpzoEp6']) {
    assert.ok(settingsText.includes(marker), `tutorial must be in settings: ${marker}`);
  }

  const recoveryStart = template.indexOf('id="recovery"');
  const recoveryEnd = template.indexOf('</section>', recoveryStart);
  const recoveryText = visibleText(template.slice(recoveryStart, recoveryEnd));
  assert.ok(recoveryText.includes('UXTU 没自启，手动打开也没反应'));
  assert.doesNotMatch(recoveryText, /BV1yv78zQEnD|BV1mvFpzoEp6|教程 01|教程 02/);

  const completeUmafWarning = '本机约 80MB 的 UMAF 启动分区不可删除或格式化。进入：开机或重启时持续按 F2，选择最右边第三项，再进入后续界面的第二项；详细安装与进入方法见第 03 章教程 01。';
  const normalizedDocumentText = visibleText(template).replaceAll('。 进入：', '。进入：');
  assert.equal(normalizedDocumentText.split(completeUmafWarning).length - 1, 2);
  assert.equal(
    (template.match(/本机约 80MB 的 UMAF 启动分区不可删除或格式化/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(template, /AIDA64 · TM5 · ZenTimings/);

  const criticalStart = template.indexOf('<aside class="critical-note"');
  const criticalEnd = template.indexOf('</aside>', criticalStart);
  const criticalText = visibleText(template.slice(criticalStart, criticalEnd));
  assert.doesNotMatch(criticalText, /UMAF|80MB|持续按 F2/);
  for (const phrase of [
    'BIOS、负压和内存超频调整均可能导致不稳定',
    '一次只改一项',
    '修改前保留当前值截图',
    '不稳定',
  ]) {
    assert.ok(criticalText.includes(phrase), `missing operation principle: ${phrase}`);
  }

  const appendixStart = template.indexOf('id="memory-appendix"');
  const appendix = template.slice(appendixStart);
  const appendixText = visibleText(appendix);
  assert.ok(appendixText.includes(
    '内存从默认 C42 / 5200 MT/s 调整为当前 C36 / 5600 MT/s，并稳定运行。',
  ));
  assert.ok(appendixText.includes(completeUmafWarning));
  assert.ok(appendixText.includes('本机约 80MB 的 UMAF 启动分区不可删除或格式化'));
  assert.ok(appendixText.includes('持续按 F2'));
  assert.doesNotMatch(appendix, /ZenTimings\s*=|UMAF\s*=/);
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

test('rendered copy matches the approved device handoff facts', async () => {
  await buildPage({ cacheDir: integrationCacheDir });
  const html = await readFile(outputPath, 'utf8');
  const text = visibleText(html);
  const required = [
    '机械革命蛟龙 16 Pro', 'Ryzen 9 8945HX', 'RTX 5070 Ti', '游戏性能与散热平衡',
    'CCD1 已关闭', 'CPU 睿频已关闭', '接通电源 5000 MHz',
    'SPL 65W', 'sPPT 85W', 'fPPT 85W', '控制极限 CPU 温度',
    '独显直连', '高性能电源模式保持关闭', 'All Core Offset -20',
    '开机自启', '开机自启自动应用配置',
    '16GB × 2 双通道', '5600 MT/s 正常保持',
    'ZenTimings：核对当前实际生效的内存参数',
    'UMAF：修改这些固件参数的位置，也是按记录值回退的入口',
    '本机约 80MB 的 UMAF 启动分区不可删除或格式化', '持续按 F2',
    '修改前保留当前值截图',
    '接通电源 5000 MHz → 5200 MHz', '85–87°C',
    '游戏时 CPU 温度',
    '使用上风压散热器后，游戏时 CPU 温度稳定在 85–87°C 可接受。',
    'MCHOSE HUB', '小飞机（MSI Afterburner）', 'HWiNFO 仅传感器模式',
    'AIDA64', 'TM5', '先询问 AI 再使用',
    'UXTU（Universal x86 Tuning Utility）',
    '性能调校参考档案', '当前调校基线已稳定运行',
    '已完成调整', '内存超频已完成', '内存时序已调整并稳定运行',
    '当前关键设置、截图与教程', '异常恢复', '内存超频与时序记录',
    'REFERENCE RULE / 使用原则',
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

  const forbidden = ['单文件 HTML', 'Base64', 'Data URI', '图片内联', '离线查看', '交付格式', '交接', '不要误删旁边的压缩包'];
  for (const phrase of forbidden) assert.ok(!text.includes(phrase), `visible implementation copy: ${phrase}`);
});
