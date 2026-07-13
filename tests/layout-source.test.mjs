import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';

function extractBalancedBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing block marker: ${marker}`);
  const openingBrace = source.indexOf('{', markerIndex + marker.length);
  assert.notEqual(openingBrace, -1, `missing opening brace after: ${marker}`);

  let depth = 0;
  let quote = '';
  let inComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (inComment) {
      if (character === '*' && nextCharacter === '/') {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && nextCharacter === '*') {
      inComment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          markerIndex,
          endIndex: index + 1,
          body: source.slice(openingBrace + 1, index),
        };
      }
    }
  }
  assert.fail(`missing closing brace after: ${marker}`);
}

function extractHeroMetricsMarkup(template) {
  const match = template.match(/<dl\b(?=[^>]*\bclass\s*=\s*["'](?:[^"']*\s)?hero-metrics(?:\s[^"']*)?["'])[^>]*>([\s\S]*?)<\/dl\s*>/i);
  assert.ok(match, 'missing hero-metrics definition list');
  return match[1];
}

function assertSixMetricItems(template) {
  const metrics = extractHeroMetricsMarkup(template);
  const metricItemSource = String.raw`<div\b[^>]*>\s*<dt\b[^>]*>[\s\S]*?<\/dt>\s*<dd\b[^>]*>[\s\S]*?<\/dd>\s*<p\b[^>]*>[\s\S]*?<\/p>\s*<\/div>`;
  const items = metrics.match(new RegExp(metricItemSource, 'gi')) ?? [];
  assert.equal(items.length, 6, 'hero-metrics must contain exactly six complete items');
  const residual = metrics
    .replace(new RegExp(metricItemSource, 'gi'), '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  assert.equal(residual, '', 'hero-metrics must not contain residual direct content');
}

function collectHeroMetricColumnValues(css) {
  const values = [];
  for (const rule of css.matchAll(/\.hero-metrics(?![-\w])\s*\{([^{}]*)\}/g)) {
    for (const declaration of rule[1].matchAll(/\bgrid-template-columns\s*:\s*([^;]+)\s*;?/g)) {
      values.push(declaration[1].trim().replace(/\s+/g, ' '));
    }
  }
  return values;
}

function assertResponsiveHeroBreakpoints(css) {
  const tabletMarker = '@media (max-width: 900px)';
  const mobileMarker = '@media (max-width: 600px)';
  const tablet = extractBalancedBlock(css, tabletMarker);
  const mobile = extractBalancedBlock(css, mobileMarker);
  assert.ok(tablet.markerIndex < mobile.markerIndex, '900px media block must precede the 600px media block');

  const tabletMetrics = extractBalancedBlock(tablet.body, '.hero-metrics');
  const mobileMetrics = extractBalancedBlock(mobile.body, '.hero-metrics');
  assert.match(tabletMetrics.body, /\bgrid-template-columns\s*:\s*1fr 1fr\s*;/);
  assert.match(mobileMetrics.body, /\bgrid-template-columns\s*:\s*1fr\s*;/);
  assert.deepEqual(
    collectHeroMetricColumnValues(css),
    ['repeat(3, minmax(0, 1fr))', '1fr 1fr', '1fr'],
    'hero-metrics must define exactly the desktop, tablet and mobile column sequence',
  );
  assert.doesNotMatch(
    css.slice(mobile.endIndex),
    /[^{}]*\.hero-metrics(?![-\w])[^{}]*\{[^{}]*\bgrid-template-columns\s*:/,
    'hero-metrics columns must not be overridden after the 600px media block',
  );
}

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

test('completed hero adjustments use six responsive metrics without a baseline grid', async () => {
  const [css, template] = await Promise.all([
    readFile('src/styles.css', 'utf8'),
    readFile('src/index.template.html', 'utf8'),
  ]);
  assertSixMetricItems(template);
  assert.match(css, /\.hero-adjustments\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*padding:\s*1\.5rem var\(--gutter\) 2\.5rem;[^}]*border-top:\s*1px solid var\(--line\);[^}]*background:\s*var\(--bg\);/);
  assert.match(css, /\.hero-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[^}]*border-left:\s*1px solid var\(--line\);/);
  assert.match(css, /\.hero-metrics\s*>\s*div\s*\{[^}]*min-width:\s*0;[^}]*border-right:\s*1px solid var\(--line\);[^}]*border-bottom:\s*1px solid var\(--line\);/);
  assert.match(css, /\.hero-metrics p\s*\{[^}]*color:\s*var\(--muted\);[^}]*font-size:\s*var\(--font-note\);/);
  assertResponsiveHeroBreakpoints(css);
  assert.doesNotMatch(css, /\.baseline-grid/);
});

test('hero source contracts reject review mutations without depending on compact markup', async () => {
  const [css, template] = await Promise.all([
    readFile('src/styles.css', 'utf8'),
    readFile('src/index.template.html', 'utf8'),
  ]);
  const tabletStart = css.indexOf('@media (max-width: 900px)');
  const mobileStart = css.indexOf('@media (max-width: 600px)');
  const printStart = css.indexOf('@media print');
  const swappedBreakpoints = css.slice(0, tabletStart)
    + css.slice(mobileStart, printStart)
    + css.slice(tabletStart, mobileStart)
    + css.slice(printStart);
  const spaciousMetrics = template
    .replaceAll('<div><dt>', '<div data-slot="metric">\n            <dt>')
    .replaceAll('</dt><dd>', '</dt>\n            <dd data-value>')
    .replaceAll('</dd><p>', '</dd>\n            <p data-note>')
    .replaceAll('</p></div>', '</p>\n          </div>');
  const seventhMetric = template.replace('</dl>', '<div><dt>额外项</dt><dd>1</dd><p>额外说明</p></div></dl>');
  const laterOverride = css.replace('@media print', '.hero-metrics { grid-template-columns: repeat(9, 1fr); }\n@media print');

  assert.throws(() => assertResponsiveHeroBreakpoints(swappedBreakpoints));
  assert.throws(() => assertResponsiveHeroBreakpoints(laterOverride));
  assert.doesNotThrow(() => assertSixMetricItems(spaciousMetrics));
  assert.throws(() => assertSixMetricItems(seventhMetric));
});

test('hero columns reject a global override between tablet and mobile media blocks', async () => {
  const css = await readFile('src/styles.css', 'utf8');
  const betweenOverride = css.replace(
    '@media (max-width: 600px)',
    '.hero-metrics { grid-template-columns: repeat(9, 1fr); }\n@media (max-width: 600px)',
  );

  assert.throws(() => assertResponsiveHeroBreakpoints(betweenOverride));
});

test('hero columns reject a second declaration inside the mobile media block', async () => {
  const css = await readFile('src/styles.css', 'utf8');
  const insideMobileOverride = css.replace(
    '  .hero-metrics { grid-template-columns: 1fr; }\n}',
    '  .hero-metrics { grid-template-columns: 1fr; }\n  .hero-metrics { grid-template-columns: 1fr 1fr; }\n}',
  );

  assert.throws(() => assertResponsiveHeroBreakpoints(insideMobileOverride));
});

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
