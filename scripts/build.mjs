import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assets } from '../src/assets.mjs';
import { convertAsset } from './image-pipeline.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const legacyOutputPath = resolve(root, 'dist/laptop-performance-handoff.html');
export const outputPath = resolve(root, 'dist/index.html');
export const defaultCacheDir = resolve(root, '.cache/image-pipeline');

export async function buildPage({
  cacheDir = defaultCacheDir,
} = {}) {
  let html = await readFile(resolve(root, 'src/index.template.html'), 'utf8');
  const styles = await readFile(resolve(root, 'src/styles.css'), 'utf8');
  const captureBootstrap = await readFile(resolve(root, 'src/capture-bootstrap.js'), 'utf8');

  html = html
    .replace('{{styles}}', styles)
    .replace('{{capture-bootstrap}}', captureBootstrap);

  const report = [];
  for (const asset of assets) {
    const converted = await convertAsset(asset, root, { cacheDir });
    html = html.replaceAll(`{{asset:${asset.id}}}`, converted.dataUri);
    report.push(converted);
  }

  if (/\{\{[^}]+\}\}/.test(html)) {
    throw new Error('Unresolved build placeholder remains in HTML');
  }

  await rm(legacyOutputPath, { force: true });
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await buildPage();
  console.table(report.map(({ id, width, height, bytes }) => ({ id, width, height, bytes })));
  console.log(outputPath);
}
