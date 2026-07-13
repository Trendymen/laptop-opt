import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SCHEMA_VERSION = 1;
const DATA_URI_PREFIX = 'data:image/webp;base64,';

function addPart(hash, label, value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  hash.update(`${label}\0${buffer.length}\0`);
  hash.update(buffer);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function createCacheKey({ source, asset, pipelineSource, versions }) {
  const hash = createHash('sha256');
  addPart(hash, 'schema', String(SCHEMA_VERSION));
  addPart(hash, 'source-bytes', source);
  addPart(hash, 'manifest', JSON.stringify({
    id: asset.id,
    source: asset.source,
    preset: asset.preset ?? null,
    webPMode: asset.webPMode ?? null,
  }));
  addPart(hash, 'pipeline-source', pipelineSource);
  addPart(hash, 'versions', JSON.stringify({
    sharp: versions.sharp,
    vips: versions.vips,
  }));
  return hash.digest('hex');
}

export function cachePathFor(cacheDir, key) {
  return resolve(cacheDir, `${key}.json`);
}

function validateEntry(entry, key, asset) {
  if (entry?.schemaVersion !== SCHEMA_VERSION || entry.key !== key) return null;
  const result = entry.result;
  if (!result || result.id !== asset.id || result.source !== asset.source) return null;
  if (![result.sourceWidth, result.sourceHeight, result.width, result.height].every(isPositiveInteger)) return null;
  if (result.sourceWidth !== result.width || result.sourceHeight !== result.height) return null;
  if (result.mimeType !== 'image/webp' || result.pixelIdentical !== true) return null;
  if (typeof result.dataUri !== 'string' || !result.dataUri.startsWith(DATA_URI_PREFIX)) return null;

  const webp = Buffer.from(result.dataUri.slice(DATA_URI_PREFIX.length), 'base64');
  if (webp.length !== result.bytes || sha256(webp) !== entry.webpSha256) return null;
  return result;
}

export async function readCacheEntry(cacheDir, key, asset) {
  const path = cachePathFor(cacheDir, key);
  try {
    const entry = JSON.parse(await readFile(path, 'utf8'));
    const result = validateEntry(entry, key, asset);
    if (result) return result;
    await rm(path, { force: true });
    return null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      await rm(path, { force: true });
      return null;
    }
    throw error;
  }
}

export async function writeCacheEntryAtomic(cacheDir, key, result) {
  await mkdir(cacheDir, { recursive: true });
  const finalPath = cachePathFor(cacheDir, key);
  const temporaryPath = resolve(cacheDir, `.${key}.${process.pid}.${randomUUID()}.tmp`);
  const webp = Buffer.from(result.dataUri.slice(DATA_URI_PREFIX.length), 'base64');
  const entry = {
    schemaVersion: SCHEMA_VERSION,
    key,
    webpSha256: sha256(webp),
    result,
  };

  try {
    await writeFile(temporaryPath, JSON.stringify(entry), { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, finalPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
