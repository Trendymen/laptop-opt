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
