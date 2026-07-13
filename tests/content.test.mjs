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
    'ZenTimings = 当前 Windows 实际运行结果',
    'UMAF = 已记录字段的局部参数入口和回退对照',
    '约 80MB 的 UMAF 分区不可删除', '持续按 F2',
    '修改前保留当前值截图',
    '接通电源 5000 MHz → 5200 MHz', '85–87°C',
    'MCHOSE HUB', '小飞机（MSI Afterburner）', 'HWiNFO 仅传感器模式',
    'AIDA64', 'TM5', '先询问 AI 再使用',
    '性能调校参考档案', '当前调校基线已稳定运行',
    '已完成调整', '内存超频已完成', '内存时序已调整并稳定运行',
    '当前关键设置与截图', '异常恢复与教程', '内存超频与时序记录',
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
