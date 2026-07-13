import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildPage, outputPath as htmlPath } from './build.mjs';
import { captureProfiles } from './capture-config.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function startServer(html) {
  const server = createServer((request, response) => {
    if (request.url === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Capture server has no TCP address');
  return { server, url: `http://127.0.0.1:${address.port}/?capture=1` };
}

async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function formatBrowserFailures(profile, failures) {
  return failures.map((failure) => `[${profile.id}] ${failure}`).join('\n');
}

export async function captureScreenshots() {
  await buildPage();
  const html = await readFile(htmlPath);
  const { server, url } = await startServer(html);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const captures = [];
    for (const profile of captureProfiles) {
      const context = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
      });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        const failures = [];
        page.on('console', (message) => {
          if (message.type() === 'error') failures.push(`console: ${message.text()}`);
        });
        page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
        page.on('requestfailed', (request) => {
          failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`.trim());
        });

        await page.goto(url, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => {
          const images = [...document.querySelectorAll('img[src]')];
          return images.length === 10
            && images.every((image) => image.complete && image.naturalWidth > 0);
        });

        const audit = await page.evaluate(() => {
          const images = [...document.querySelectorAll('img[src]')];
          const internalScrollers = [...document.querySelectorAll('body *')].filter((element) => {
            const style = getComputedStyle(element);
            return /(auto|scroll)/.test(style.overflowY)
              && element.scrollHeight > element.clientHeight;
          }).length;
          return {
            captureMode: document.documentElement.dataset.capture === 'true',
            scrollingElement: document.scrollingElement?.tagName ?? null,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            internalScrollers,
            imageCount: images.length,
            loadedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length,
          };
        });

        const auditFailures = Object.entries({
          captureMode: audit.captureMode === true,
          scrollingElement: audit.scrollingElement === 'HTML',
          horizontalOverflow: audit.horizontalOverflow === false,
          internalScrollers: audit.internalScrollers === 0,
          imageCount: audit.imageCount === 10,
          loadedImages: audit.loadedImages === 10,
        }).filter(([, valid]) => !valid).map(([name]) => `${name}: ${JSON.stringify(audit[name])}`);
        failures.push(...auditFailures);
        if (failures.length) throw new Error(formatBrowserFailures(profile, failures));

        const absoluteOutput = resolve(root, profile.output);
        await mkdir(dirname(absoluteOutput), { recursive: true });
        await page.screenshot({ path: absoluteOutput, type: 'png', fullPage: true, animations: 'disabled' });
        captures.push({ profile, outputPath: absoluteOutput, audit });
      } finally {
        await context.close();
      }
    }
    return { serverUrl: url, captures };
  } finally {
    try {
      await browser?.close();
    } finally {
      await closeServer(server);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await captureScreenshots();
  for (const capture of result.captures) console.log(capture.outputPath);
}
