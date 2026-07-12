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
