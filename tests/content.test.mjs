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
  const topbar = template.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1];
  assert.ok(topbar, 'missing topbar');
  assert.match(
    topbar,
    /<div><span>蛟龙 16 Pro · 8945HX · 5070 Ti<\/span><span>2026-07-12<\/span><b>作者：刘卓<\/b><\/div>/,
  );
  assert.doesNotMatch(topbar, /设备：|用途：|当前调校基线已稳定运行|Ryzen 9|RTX /);
  const heroStart = template.indexOf('<section class="hero"');
  const heroEnd = template.indexOf('</section>', heroStart);
  const heroSource = template.slice(heroStart, heroEnd);
  const heroText = visibleText(heroSource);
  const heroMetrics = heroSource.match(/<dl class="hero-metrics">([\s\S]*?)<\/dl>/)?.[1];
  assert.ok(heroMetrics, 'missing hero metrics');
  const heroMetricHeadings = [...heroMetrics.matchAll(/<dt>([^<]+)<\/dt>/g)]
    .map((match) => match[1]);
  assert.equal(heroMetricHeadings.length, 5, 'Hero must contain exactly five metric cards');
  assert.equal(
    heroMetricHeadings.filter((heading) => heading === '内存超频与时序').length,
    1,
    'Hero must contain exactly one merged memory tuning card',
  );
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
    /<div><dt>显卡当前状态<\/dt><dd>独显直连<\/dd><p>不经过核显输出。<\/p><\/div>/,
  );
  assert.match(
    heroMetrics,
    /<div><dt>内存通道<\/dt><dd>16GB × 2<\/dd><p>英睿达镁光 32GB 单条 → 十铨 16GB × 2（海力士 M-die）双通道。<\/p><\/div>/,
  );
  assert.match(
    heroMetrics,
    /<div class="hero-metric--memory"><dt>内存超频与时序<\/dt><dd>5600 MT\/s · C36<\/dd><p>默认 5200 C42 → 当前 5600 C36，已稳定运行。<\/p><\/div>/,
  );

  for (const phrase of [
    '已完成调整',
    '记录本机已完成的调校，供参数回退、异常恢复和后续调整参考。',
    'CCD1 已关闭：16 核 32 线程 → 8 核 16 线程；可用 L3 64MB → 32MB。减少跨 CCD 调度和发热，代价是多核性能下降；CPU 睿频已关闭。',
    '5.0 GHz',
    '全核负压 -20',
    '不经过核显输出。',
    '英睿达镁光 32GB 单条 → 十铨 16GB × 2（海力士 M-die）双通道。',
    '内存超频与时序',
    '5600 MT/s · C36',
    '默认 5200 C42 → 当前 5600 C36，已稳定运行。',
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
    'BV1h2NCzBE6u',
    '{{asset:cpu-frequency}}',
  ]);
  assert.ok(settingsText.includes(
    'UXTU（Universal x86 Tuning Utility）· AMD Curve Optimizer · All Core Offset -20',
  ));
  assert.ok(settingsText.includes('CCD1 已关闭 · BIOS 已解锁 · UMAF 已安装'));
  assert.ok(settingsText.includes('CPU 睿频已关闭 · 高性能电源计划已调出'));
  for (const marker of ['BV1yv78zQEnD', 'BV1mvFpzoEp6', 'BV1h2NCzBE6u']) {
    assert.ok(settingsText.includes(marker), `tutorial must be in settings: ${marker}`);
  }
  const tutorialThree = [...settingsSource.matchAll(/<article class="tutorial"[^>]*>([\s\S]*?)<\/article>/g)]
    .map((match) => match[1])
    .find((article) => article.includes('BV1h2NCzBE6u'));
  assert.ok(tutorialThree, 'tutorial 03 must exist');
  assert.equal(
    tutorialThree.match(/<h3>([^<]+)<\/h3>/)?.[1],
    '笔记本优化教程之内存篇，保姆级超详细教程，一个视频给你从底层逻辑讲透内存超频！小白看完也能学会AMD超频必看，适用于一切hx系列的au！演示机型：蛟龙16pro',
  );

  const recoveryStart = template.indexOf('id="recovery"');
  const recoveryEnd = template.indexOf('</section>', recoveryStart);
  const recoverySource = template.slice(recoveryStart, recoveryEnd);
  const recoveryText = visibleText(recoverySource);
  assert.ok(recoveryText.includes('UXTU 没自启，手动打开也没反应'));
  assertInOrder(recoverySource, [
    'UXTU 没自启，手动打开也没反应',
    '回到最初优化调校',
    '完全恢复默认',
  ]);
  for (const phrase of [
    '关闭 CCD1、完成 BIOS 解锁、安装并进入 UMAF',
    '参考第 03 章教程 01',
    '关闭 CPU 睿频、调出高性能电源计划',
    '参考第 03 章教程 02',
    '第 01 章的调校说明和第 03 章里的现有截图',
    '内存频率和时序控制',
    '参考附录里的参数',
    '关闭 UXTU 开机自启',
    '任务栏图标上右键退出 UXTU',
    '取消当前全核负压',
    '注册表设置重新开启 CPU 睿频',
    '电源计划里把定频改为 0',
    '不再使用自定义功耗模式',
    '静音模式或狂暴模式',
    '非游戏场景使用平衡模式',
    '把 CCD1 重新打开',
    '恢复 16 核 32 线程',
    '内存超频设为 Disabled',
    '5200 MT/s / C42',
    '参考第 03 章教程 03',
  ]) assert.ok(recoveryText.includes(phrase), `missing recovery path: ${phrase}`);
  const recoveryPaths = [...recoverySource.matchAll(/<article class="recovery-path(?: [^"]+)?">([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]);
  assert.equal(recoveryPaths.length, 2);
  assert.deepEqual(
    recoveryPaths.map((path) => ({
      heading: path.match(/<h3>([^<]+)<\/h3>/)?.[1],
      items: [...path.matchAll(/<li>([\s\S]*?)<\/li>/g)]
        .map((match) => visibleText(match[1]).replace(/：\s+/g, '：').trim()),
    })),
    [
      {
        heading: '回到最初优化调校',
        items: [
          '固件前置：关闭 CCD1、完成 BIOS 解锁、安装并进入 UMAF；参考第 03 章教程 01。',
          'CPU 与功耗：关闭 CPU 睿频、调出高性能电源计划并调整功耗限制；参考第 03 章教程 02，以及第 01 章的调校说明和第 03 章里的现有截图。',
          '内存：内存频率和时序控制参考附录里的参数。',
        ],
      },
      {
        heading: '完全恢复默认',
        items: [
          '关闭 UXTU 开机自启；再在任务栏图标上右键退出 UXTU，取消当前全核负压。',
          '参考第 03 章教程 02 里的注册表设置重新开启 CPU 睿频；在电源计划里把定频改为 0。',
          '机械革命控制台里不再使用自定义功耗模式；游戏时改用静音模式或狂暴模式，非游戏场景使用平衡模式。',
          '参考第 03 章教程 01 进入 UMAF，把 CCD1 重新打开，恢复 16 核 32 线程。',
          '在 UMAF 里把内存超频设为 Disabled，恢复 5200 MT/s / C42 的默认内存设置；参考第 03 章教程 03。',
        ],
      },
    ],
  );
  assert.doesNotMatch(recoverySource, /<a\b/);

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
  const normalizedAppendixText = appendixText.replaceAll('： ', '：');
  assert.ok(appendixText.includes(
    '内存从默认 C42 / 5200 MT/s 调整为当前 C36 / 5600 MT/s，并稳定运行。',
  ));
  for (const phrase of [
    'UMAF：填写回退值的固件入口',
    '图片用于找位置，下面的列表用于回退填写',
    '回退十六进制值',
    '以 ZenTimings 当前稳定十进制值为基准换算',
    'tWR 例外：ZenTimings 显示 66，通常换算为 42；回退时仍填写 40',
    '其余 Auto 字段保持 Auto',
  ]) assert.ok(normalizedAppendixText.includes(phrase), `missing rollback copy: ${phrase}`);
  const timingTables = [...appendix.matchAll(/<table class="timing-values">([\s\S]*?)<\/table>/g)]
    .map((match) => match[1]);
  assert.equal(timingTables.length, 2);
  const expectedTimingTables = [
    {
      caption: 'DDR SPD Timing',
      rows: [
        ['01', 'tCL', '24'], ['02', 'tRCD', '26'], ['03', 'tRP', '26'],
        ['04', 'tRAS', '4A'], ['05', 'tRC', '70'], ['06', 'tWR', '40'],
        ['07', 'tRFC1', '230'], ['08', 'tRFC2', '17C'], ['09', 'tRFCsb', '12C'],
        ['10', 'tRTP', '0C'], ['11', 'tRRDL', '0A'], ['12', 'tRRDS', '08'],
        ['13', 'tFAW', '20'], ['14', 'tWTRL', '12'], ['15', 'tWTRS', '06'],
      ],
    },
    {
      caption: 'DDR Non-SPD Timing',
      rows: [
        ['01', 'tRDRDSCL', '06'], ['02', 'tWRWRSCL', '0A'],
        ['03', 'tWRRD', '06'], ['04', 'tRDWR', '10'],
      ],
    },
  ];
  for (const [index, expected] of expectedTimingTables.entries()) {
    const table = timingTables[index];
    assert.ok(table.includes(`<caption>${expected.caption}</caption>`));
    assert.deepEqual(
      [...table.matchAll(/<tr><td>(\d{2})<\/td><th scope="row">([^<]+)<\/th><td><code>([^<]+)<\/code><\/td><\/tr>/g)]
        .map((match) => match.slice(1)),
      expected.rows,
    );
  }
  assert.doesNotMatch(
    appendixText,
    /UMAF：修改这些固件参数的位置，也是按记录值回退的入口/,
  );
  const timingNoteStart = appendix.indexOf('<aside class="timing-value-note"');
  const timingNoteEnd = appendix.indexOf('</aside>', timingNoteStart);
  const timingNote = appendix.slice(timingNoteStart, timingNoteEnd);
  const timingNoteParagraphs = [...timingNote.matchAll(/<p>([\s\S]*?)<\/p>/g)];
  assert.ok(timingNoteParagraphs.length > 0, 'timing note must contain paragraphs');
  assert.ok(visibleText(timingNoteParagraphs.at(-1)[1]).includes(
    '填写并重启后，再用 ZenTimings 核对实际生效值',
  ));
  assert.doesNotMatch(appendixText, /\b0[xX][0-9A-F]+\b/);
  assert.doesNotMatch(
    appendixText,
    /回退时按 UMAF 截图填写固件字段|不要为了让两张图数字相等而反推或擅改/,
  );
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
    '蛟龙 16 Pro', '8945HX', '5070 Ti', '2026-07-12', '作者：刘卓',
    'CCD1 已关闭', 'CPU 睿频已关闭', '接通电源 5000 MHz',
    'SPL 65W', 'sPPT 85W', 'fPPT 85W', '控制极限 CPU 温度',
    '独显直连', '高性能电源模式保持关闭', 'All Core Offset -20',
    '开机自启', '开机自启自动应用配置',
    '16GB × 2 双通道', '5600 MT/s 正常保持',
    'ZenTimings：核对当前实际生效的内存参数',
    'UMAF：填写回退值的固件入口',
    '本机约 80MB 的 UMAF 启动分区不可删除或格式化', '持续按 F2',
    '修改前保留当前值截图',
    '接通电源 5000 MHz → 5200 MHz', '85–87°C',
    '游戏时 CPU 温度',
    '使用上风压散热器后，游戏时 CPU 温度稳定在 85–87°C 可接受。',
    'MCHOSE HUB', '小飞机（MSI Afterburner）', 'HWiNFO 仅传感器模式',
    'AIDA64', 'TM5', '先询问 AI 再使用',
    'UXTU（Universal x86 Tuning Utility）',
    '性能调校参考档案',
    '已完成调整', '内存超频已完成', '内存时序已调整并稳定运行',
    '当前关键设置、截图与教程', '异常恢复', '内存超频与时序记录',
    'REFERENCE RULE / 使用原则',
    '全网最细！保姆级笔记本优化教程之cpu篇，小白也能降压定频，拯救你的cpu！适配于拯救者，鸡哥等绝大多数机型，演示机型8945hx 5070ti蛟龙16pro',
    '蛟龙16pro降温静音焚决（同类型笔记本直接可以抄作业）',
    '笔记本优化教程之内存篇，保姆级超详细教程，一个视频给你从底层逻辑讲透内存超频！小白看完也能学会AMD超频必看，适用于一切hx系列的au！演示机型：蛟龙16pro',
    'BV1yv78zQEnD', '22:35', 'BV1mvFpzoEp6', 'BV1h2NCzBE6u',
    '回到最初优化调校', '完全恢复默认',
    '关闭 UXTU 开机自启', '恢复 16 核 32 线程', '5200 MT/s / C42',
  ];
  for (const phrase of required) assert.ok(text.includes(phrase), `missing: ${phrase}`);

  const bilibiliHrefs = [...html.matchAll(/<a\b[^>]*href="(https:\/\/www\.bilibili\.com\/video\/[^"]+)"/g)]
    .map((match) => match[1].replaceAll('&amp;', '&'));
  assert.deepEqual(bilibiliHrefs, [
    'https://www.bilibili.com/video/BV1yv78zQEnD/?share_source=copy_web&vd_source=91e679d463038976da1b6275f56aec3c&t=1355',
    'https://www.bilibili.com/video/BV1mvFpzoEp6/?share_source=copy_web&vd_source=91e679d463038976da1b6275f56aec3c',
    'https://www.bilibili.com/video/BV1h2NCzBE6u/?share_source=copy_web&vd_source=91e679d463038976da1b6275f56aec3c',
  ]);

  const forbidden = ['单文件 HTML', 'Base64', 'Data URI', '图片内联', '离线查看', '交付格式', '交接', '不要误删旁边的压缩包'];
  for (const phrase of forbidden) assert.ok(!text.includes(phrase), `visible implementation copy: ${phrase}`);
});
