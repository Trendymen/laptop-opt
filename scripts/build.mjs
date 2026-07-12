import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assets } from '../src/assets.mjs';
import { convertAsset } from './image-pipeline.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const outputPath = resolve(root, 'dist/laptop-performance-handoff.html');

export async function buildPage() {
  let html = await readFile(resolve(root, 'src/index.template.html'), 'utf8');
  const styles = await readFile(resolve(root, 'src/styles.css'), 'utf8');
  const captureBootstrap = await readFile(resolve(root, 'src/capture-bootstrap.js'), 'utf8');
  const clientScript = await readFile(resolve(root, 'src/client.js'), 'utf8');

  html = html
    .replace('{{styles}}', styles)
    .replace('{{capture-bootstrap}}', captureBootstrap)
    .replace('{{client-script}}', clientScript);

  const report = [];
  for (const asset of assets) {
    const converted = await convertAsset(asset, root);
    html = html.replaceAll(`{{asset:${asset.id}}}`, converted.dataUri);
    report.push(converted);
  }

  if (/\{\{[^}]+\}\}/.test(html)) {
    throw new Error('Unresolved build placeholder remains in HTML');
  }

  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await buildPage();
  console.table(report.map(({ id, width, height, bytes }) => ({ id, width, height, bytes })));
  console.log(outputPath);
}
