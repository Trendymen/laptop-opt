import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
    .filter(([, selector]) => /\.hero-(?:adjustments|metrics)(?![-\w])/.test(selector))
    .map(([, selector, declarations]) => `${selector.trim()} {${declarations}}`)
    .join('\n');
}

function assertStaticHeroInteraction(client, template, css) {
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

  const forbiddenClientApis = [
    /\.hidden\s*=/,
    /\.toggleAttribute\s*\(\s*["']hidden["']/,
    /\.setAttribute\s*\(\s*["'](?:hidden|aria-hidden)["']/,
    /\.classList\.(?:add|toggle|replace)\s*\([^)]*["'](?:(?:is|u)-)?(?:hidden|collapsed)["']/,
  ];
  for (const forbidden of forbiddenClientApis) assert.doesNotMatch(client, forbidden);

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

test('motion remains accessible while evidence and completed adjustments stay static and unfolded', async () => {
  const [client, template, css] = await Promise.all([
    readFile('src/client.js', 'utf8'),
    readFile('src/index.template.html', 'utf8'),
    readFile('src/styles.css', 'utf8'),
  ]);
  assert.match(client, /document\.documentElement\.classList\.add\('js-ready'\)/);
  assert.match(client, /prefers-reduced-motion/);
  assert.match(client, /dataset\.capture === 'true'/);
  assert.match(client, /IntersectionObserver/);
  assert.match(client, /classList\.add\('is-visible'\)/);
  assertStaticHeroInteraction(client, template, css);
  assert.doesNotMatch(template, /data-zoom|image-dialog/);
  assert.doesNotMatch(css, /cursor:\s*zoom-in/);
});

test('hero interaction contract rejects hiding mutations without banning unrelated events', async () => {
  const [client, template, css] = await Promise.all([
    readFile('src/client.js', 'utf8'),
    readFile('src/index.template.html', 'utf8'),
    readFile('src/styles.css', 'utf8'),
  ]);
  const hiddenAdjustments = template.replace('class="hero-adjustments"', 'class="hero-adjustments" hidden');
  const checkboxAdjustments = template.replace('<p class="adjustments-label">', '<input type="checkbox"><p class="adjustments-label">');
  const hiddenClient = `${client}\nhero.hidden = true;`;
  const hiddenClassClient = `${client}\nhero.classList.toggle('is-hidden');`;
  const collapsedCss = `${css}\n.hero-adjustments { max-height: 0; }`;
  const checkboxCss = `${css}\n.hero-adjustments:has(input[type="checkbox"]:checked) .hero-metrics { display: none; }`;
  const benignClient = `${client}\nevent.preventDefault();\nhero.classList.toggle('active');\nconst attributeName = 'aria-expanded';`;

  assert.throws(() => assertStaticHeroInteraction(client, hiddenAdjustments, css));
  assert.throws(() => assertStaticHeroInteraction(client, checkboxAdjustments, css));
  assert.throws(() => assertStaticHeroInteraction(hiddenClient, template, css));
  assert.throws(() => assertStaticHeroInteraction(hiddenClassClient, template, css));
  assert.throws(() => assertStaticHeroInteraction(client, template, collapsedCss));
  assert.throws(() => assertStaticHeroInteraction(client, template, checkboxCss));
  assert.doesNotThrow(() => assertStaticHeroInteraction(benignClient, template, css));
});
