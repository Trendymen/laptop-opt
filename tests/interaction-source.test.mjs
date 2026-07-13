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
    .filter(([, selector]) => /\.hero(?![-\w])|\.hero-(?:adjustments|metrics)(?![-\w])/.test(selector))
    .map(([, selector, declarations]) => `${selector.trim()} {${declarations}}`)
    .join('\n');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectHeroClientTargets(client) {
  const heroSelectors = new Set(['.hero', '.hero-adjustments', '.hero-metrics']);
  const variables = new Set();
  const calls = new Set();
  const queryPattern = /[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\.\s*querySelector(?:All)?\s*\(\s*(["'])([^"']+)\1\s*\)/g;
  for (const match of client.matchAll(queryPattern)) {
    if (!heroSelectors.has(match[2].trim())) continue;
    calls.add(match[0]);
    const prefix = client.slice(Math.max(0, match.index - 160), match.index);
    const assignment = prefix.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\[\s*\.\.\.\s*)?$/);
    if (assignment) variables.add(assignment[1]);
  }
  return { variables, calls };
}

function assertHeroClientRemainsVisible(client) {
  const { variables, calls } = collectHeroClientTargets(client);
  const targetPatterns = [
    ...[...variables].map((name) => `(?<![\\w$.])${escapeRegExp(name)}`),
    ...[...calls].map(escapeRegExp),
  ];
  const hidingOperations = [
    String.raw`\.\s*hidden\s*=`,
    String.raw`\.\s*style\s*\.\s*display\s*=\s*["']none["']`,
    String.raw`\.\s*style\s*\.\s*visibility\s*=\s*["']hidden["']`,
    String.raw`\.\s*toggleAttribute\s*\(\s*["']hidden["']`,
    String.raw`\.\s*setAttribute\s*\(\s*["']aria-hidden["']`,
    String.raw`\.\s*classList\s*\.\s*(?:add|toggle|replace)\s*\([^)]*["'](?:(?:is|u)-)?(?:hidden|collapsed)["']`,
  ];
  for (const target of targetPatterns) {
    for (const operation of hidingOperations) {
      assert.doesNotMatch(client, new RegExp(`${target}\\s*${operation}`));
    }
  }
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

  assertHeroClientRemainsVisible(client);

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
  const hiddenClient = `${client}\nconst adjustments = document.querySelector('.hero-adjustments');\nadjustments.hidden = true;`;
  const hiddenClassClient = `${client}\nconst metrics = document.querySelectorAll('.hero-metrics');\nmetrics.classList.toggle('is-hidden');`;
  const directHiddenClient = `${client}\ndocument.querySelector('.hero').toggleAttribute('hidden');`;
  const collapsedCss = `${css}\n.hero-adjustments { max-height: 0; }`;
  const checkboxCss = `${css}\n.hero-adjustments:has(input[type="checkbox"]:checked) .hero-metrics { display: none; }`;
  const benignClient = `${client}\nconst hero = document.querySelector('.hero');\nevent.preventDefault();\nhero.classList.toggle('active');\nconst attributeName = 'aria-expanded';`;

  assert.throws(() => assertStaticHeroInteraction(client, hiddenAdjustments, css));
  assert.throws(() => assertStaticHeroInteraction(client, checkboxAdjustments, css));
  assert.throws(() => assertStaticHeroInteraction(hiddenClient, template, css));
  assert.throws(() => assertStaticHeroInteraction(hiddenClassClient, template, css));
  assert.throws(() => assertStaticHeroInteraction(directHiddenClient, template, css));
  assert.throws(() => assertStaticHeroInteraction(client, template, collapsedCss));
  assert.throws(() => assertStaticHeroInteraction(client, template, checkboxCss));
  assert.doesNotThrow(() => assertStaticHeroInteraction(benignClient, template, css));
});

test('hero interaction contract rejects hiding the exact hero CSS parent', async () => {
  const [client, template, css] = await Promise.all([
    readFile('src/client.js', 'utf8'),
    readFile('src/index.template.html', 'utf8'),
    readFile('src/styles.css', 'utf8'),
  ]);

  assert.throws(() => assertStaticHeroInteraction(client, template, `${css}\n.hero { display: none; }`));
  assert.doesNotThrow(() => assertStaticHeroInteraction(client, template, `${css}\n.hero-media { display: none; }`));
});

test('hero interaction contract follows a selected hero variable', async () => {
  const [client, template, css] = await Promise.all([
    readFile('src/client.js', 'utf8'),
    readFile('src/index.template.html', 'utf8'),
    readFile('src/styles.css', 'utf8'),
  ]);
  const selectedHero = `${client}\nconst hero = document.querySelector('.hero');\n`;
  for (const hidingOperation of [
    'hero.hidden = true;',
    "hero.style.display = 'none';",
    "hero.style.visibility = 'hidden';",
    "hero.toggleAttribute('hidden');",
    "hero.setAttribute('aria-hidden', 'true');",
    "hero.classList.add('hidden');",
  ]) {
    assert.throws(() => assertStaticHeroInteraction(`${selectedHero}${hidingOperation}`, template, css));
  }
});

test('hero interaction contract allows unrelated nodes to use hidden', async () => {
  const [client, template, css] = await Promise.all([
    readFile('src/client.js', 'utf8'),
    readFile('src/index.template.html', 'utf8'),
    readFile('src/styles.css', 'utf8'),
  ]);

  assert.doesNotThrow(() => assertStaticHeroInteraction(`${client}\nmodal.hidden = true;`, template, css));
});
