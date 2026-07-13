import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

function extractElementByClass(source, tagName, className) {
  const openingPattern = new RegExp(`<${tagName}\\b(?=[^>]*\\bclass\\s*=\\s*["'](?:[^"']*\\s)?${className}(?:\\s[^"']*)?["'])[^>]*>`, 'i');
  const openingMatch = openingPattern.exec(source);
  assert.ok(openingMatch, `missing ${tagName}.${className}`);

  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tagPattern.lastIndex = openingMatch.index;
  let depth = 0;
  for (const match of source.matchAll(tagPattern)) {
    if (match.index < openingMatch.index) continue;
    if (match[0].startsWith('</')) depth -= 1;
    else if (!match[0].endsWith('/>')) depth += 1;
    if (depth === 0) return source.slice(openingMatch.index, match.index + match[0].length);
  }
  assert.fail(`missing closing tag for ${tagName}.${className}`);
}

function extractHeroCssRules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => /\.hero(?![-\w])|\.hero-(?:adjustments|metrics)(?![-\w])/.test(selector))
    .map(([, selector, declarations]) => `${selector.trim()} {${declarations}}`)
    .join('\n');
}

function assertNoInvisibleRevealFallback(css) {
  assert.doesNotMatch(
    css,
    /(?:^|})\s*\[data-reveal\]\s*\{[^}]*\bopacity\s*:\s*0(?:\.0*)?\b/m,
  );
}

function assertStaticHeroInteraction(template, css) {
  const hero = extractElementByClass(template, 'section', 'hero');
  const adjustments = extractElementByClass(hero, 'div', 'hero-adjustments');
  const forbiddenMarkup = [
    /<\/?(?:details|summary|dialog)\b/i,
    /<input\b[^>]*\btype\s*=\s*["']?checkbox\b/i,
    /\shidden\b/i,
    /\saria-(?:hidden|expanded)\b/i,
    /\sdata-accordion\b/i,
  ];
  for (const range of [hero, adjustments]) {
    for (const forbidden of forbiddenMarkup) assert.doesNotMatch(range, forbidden);
  }

  const heroCss = extractHeroCssRules(css);
  assert.notEqual(heroCss, '', 'missing hero adjustments/metrics CSS rules');
  for (const forbidden of [
    /\bdisplay\s*:\s*none\b/i,
    /\bvisibility\s*:\s*hidden\b/i,
    /\bmax-height\s*:\s*0(?:[a-z%]+)?\s*(?:!important\s*)?(?:;|$)/i,
    /\bcheckbox\b/i,
    /:checked\b/i,
  ]) assert.doesNotMatch(heroCss, forbidden);
}

test('viewport reveal is CSS-only with a visible fallback', async () => {
  const [template, css, buildSource] = await Promise.all([
    readFile('src/index.template.html', 'utf8'),
    readFile('src/styles.css', 'utf8'),
    readFile('scripts/build.mjs', 'utf8'),
  ]);

  assert.equal((template.match(/\bdata-reveal\b/g) ?? []).length, 6);
  assert.doesNotMatch(template, /\{\{client-script\}\}/);
  assert.doesNotMatch(css, /\.is-visible\b/);
  assertNoInvisibleRevealFallback(css);
  assert.throws(() => assertNoInvisibleRevealFallback(
    `${css}\n[data-reveal] { transform: translateY(1rem); opacity: 0; }`,
  ));
  assert.match(css, /@supports\s*\(animation-timeline:\s*view\(\)\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*no-preference\)/);
  assert.match(css, /\[data-reveal\]\s*\{[^}]*animation:[^}]*animation-timeline:\s*view\(\);[^}]*animation-range:/);
  assert.match(css, /@keyframes\s+css-reveal[\s\S]*?from\s*\{[^}]*opacity:\s*\.7/);
  assert.doesNotMatch(buildSource, /clientScript|client\.js|client-script/);
  assert.match(template, /<script>\{\{capture-bootstrap\}\}<\/script>/);
  await assert.rejects(access('src/client.js'), { code: 'ENOENT' });
});

test('content stays static and unfolded while CSS keeps reduced-motion support', async () => {
  const [template, css] = await Promise.all([
    readFile('src/index.template.html', 'utf8'),
    readFile('src/styles.css', 'utf8'),
  ]);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assertStaticHeroInteraction(template, css);
  assert.doesNotMatch(template, /data-zoom|image-dialog/);
  assert.doesNotMatch(css, /cursor:\s*zoom-in/);
});

test('hero interaction contract rejects hiding markup and CSS mutations', async () => {
  const [template, css] = await Promise.all([
    readFile('src/index.template.html', 'utf8'),
    readFile('src/styles.css', 'utf8'),
  ]);
  const hiddenAdjustments = template.replace('class="hero-adjustments"', 'class="hero-adjustments" hidden');
  const checkboxAdjustments = template.replace('<p class="adjustments-label">', '<input type="checkbox"><p class="adjustments-label">');
  const collapsedCss = `${css}\n.hero-adjustments { max-height: 0; }`;
  const checkboxCss = `${css}\n.hero-adjustments:has(input[type="checkbox"]:checked) .hero-metrics { display: none; }`;

  assert.throws(() => assertStaticHeroInteraction(hiddenAdjustments, css));
  assert.throws(() => assertStaticHeroInteraction(checkboxAdjustments, css));
  assert.throws(() => assertStaticHeroInteraction(template, collapsedCss));
  assert.throws(() => assertStaticHeroInteraction(template, checkboxCss));
});

test('hero interaction contract rejects hiding the exact hero CSS parent', async () => {
  const [template, css] = await Promise.all([
    readFile('src/index.template.html', 'utf8'),
    readFile('src/styles.css', 'utf8'),
  ]);

  assert.throws(() => assertStaticHeroInteraction(template, `${css}\n.hero { display: none; }`));
  assert.doesNotThrow(() => assertStaticHeroInteraction(template, `${css}\n.hero-media { display: none; }`));
});
