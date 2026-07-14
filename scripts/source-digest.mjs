import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.cache',
  '.playwright-cli',
  '.superpowers',
  'dist',
  'node_modules',
]);

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeRelativePath(value) {
  const path = String(value ?? '').replaceAll('\\', '/');
  const segments = path.split('/');
  if (
    !path ||
    path.startsWith('/') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`invalid source path: ${path || '(empty)'}`);
  }
  return path;
}

function isIgnoredSourcePath(path) {
  const segments = path.split('/');
  return segments.some((segment) => IGNORED_DIRECTORY_NAMES.has(segment)) ||
    segments.at(-1) === '.DS_Store';
}

function defaultRunGit(_command, args, options) {
  return execFileSync('git', args, options);
}

function normalizeCommitSha(value, label) {
  const commitSha = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error(`${label} must be a 40-character Git commit SHA`);
  }
  return commitSha;
}

export function listTrackedSourceFiles({ cwd = process.cwd(), runGit = defaultRunGit } = {}) {
  const output = runGit('git', ['ls-files', '-z'], {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const paths = Buffer.from(output)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(normalizeRelativePath);

  const excluded = paths.find(isIgnoredSourcePath);
  if (excluded) {
    throw new Error(`tracked source path is excluded from workspace hashing: ${excluded}`);
  }
  return paths.sort(comparePaths);
}

export async function listWorkspaceSourceFiles({ cwd = process.cwd() } = {}) {
  const paths = [];

  async function visit(relativeDirectory) {
    const absoluteDirectory = relativeDirectory ? resolve(cwd, relativeDirectory) : cwd;
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => comparePaths(left.name, right.name));

    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const normalizedPath = normalizeRelativePath(relativePath);
      if (isIgnoredSourcePath(normalizedPath)) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(normalizedPath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        paths.push(normalizedPath);
      } else {
        throw new Error(`unsupported source entry: ${normalizedPath}`);
      }
    }
  }

  await visit('');
  return paths.sort(comparePaths);
}

export async function computeSourceDigest(
  filePaths,
  { cwd = process.cwd(), readFileImpl = readFile } = {},
) {
  const normalizedPaths = [...new Set(filePaths.map(normalizeRelativePath))].sort(comparePaths);
  if (normalizedPaths.length !== filePaths.length) {
    throw new Error('source file list contains duplicate paths');
  }
  if (normalizedPaths.length === 0) {
    throw new Error('source file list is empty');
  }

  const digest = createHash('sha256');
  for (const path of normalizedPaths) {
    const content = await readFileImpl(join(cwd, ...path.split('/')));
    const pathBytes = Buffer.from(path, 'utf8');
    digest.update(`${pathBytes.length}:`);
    digest.update(pathBytes);
    digest.update(`:${content.length}:`);
    digest.update(content);
    digest.update('\0');
  }
  return digest.digest('hex');
}

export async function computeTrackedSourceDigest(options = {}) {
  const {
    cwd = process.cwd(),
    expectedCommitSha,
    runGit = defaultRunGit,
  } = options;
  const expected = normalizeCommitSha(expectedCommitSha, 'expected checkout revision');
  const actual = normalizeCommitSha(
    Buffer.from(runGit('git', ['rev-parse', 'HEAD'], {
      cwd,
      stdio: ['ignore', 'pipe', 'inherit'],
    })).toString('utf8'),
    'actual checkout revision',
  );
  if (actual !== expected) {
    throw new Error(`checkout revision mismatch: expected ${expected}, received ${actual}`);
  }
  try {
    runGit('git', ['diff', '--quiet', 'HEAD', '--'], {
      cwd,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    throw new Error('tracked source files changed after checkout');
  }
  const paths = listTrackedSourceFiles(options);
  return computeSourceDigest(paths, options);
}

export async function computeWorkspaceSourceDigest(options = {}) {
  const paths = await listWorkspaceSourceFiles(options);
  return computeSourceDigest(paths, options);
}
