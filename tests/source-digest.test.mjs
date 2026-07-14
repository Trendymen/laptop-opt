import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  computeSourceDigest,
  computeTrackedSourceDigest,
  computeWorkspaceSourceDigest,
  listWorkspaceSourceFiles,
} from '../scripts/source-digest.mjs';

const expectedCommitSha = '0123456789abcdef0123456789abcdef01234567';

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'laptop-source-digest-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await writeFile(join(root, 'src', '中文.txt'), '内容\n');
  return root;
}

test('source digest is deterministic across path order and changes with file content', async (t) => {
  const root = await createFixture(t);
  const paths = ['src/中文.txt', 'package.json', 'src/index.js'];

  const first = await computeSourceDigest(paths, { cwd: root });
  const reordered = await computeSourceDigest([...paths].reverse(), { cwd: root });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(reordered, first);

  await writeFile(join(root, 'src', 'index.js'), 'export const value = 2;\n');
  assert.notEqual(await computeSourceDigest(paths, { cwd: root }), first);
});

test('workspace digest excludes only known build and tool state', async (t) => {
  const root = await createFixture(t);
  for (const directory of ['.git', 'node_modules', 'dist', '.cache', '.superpowers', '.playwright-cli']) {
    await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, directory, 'ignored.txt'), directory);
  }
  await writeFile(join(root, '.DS_Store'), 'ignored');
  await writeFile(join(root, 'src', '.DS_Store'), 'ignored');

  const expectedPaths = ['package.json', 'src/index.js', 'src/中文.txt'];
  assert.deepEqual(await listWorkspaceSourceFiles({ cwd: root }), expectedPaths);
  assert.equal(
    await computeWorkspaceSourceDigest({ cwd: root }),
    await computeSourceDigest(expectedPaths, { cwd: root }),
  );
});

test('tracked and workspace digests use the same canonical file format', async (t) => {
  const root = await createFixture(t);
  const trackedOutput = Buffer.from('src/中文.txt\0src/index.js\0package.json\0');
  const runGit = (_command, args) => {
    if (args[0] === 'rev-parse') {
      return Buffer.from(`${expectedCommitSha}\n`);
    }
    if (args[0] === 'diff') {
      return Buffer.alloc(0);
    }
    return trackedOutput;
  };

  assert.equal(
    await computeTrackedSourceDigest({
      cwd: root,
      expectedCommitSha,
      runGit,
    }),
    await computeWorkspaceSourceDigest({ cwd: root }),
  );

  await writeFile(join(root, 'unexpected.txt'), 'not present in the Git checkout manifest\n');
  assert.notEqual(
    await computeTrackedSourceDigest({ cwd: root, expectedCommitSha, runGit }),
    await computeWorkspaceSourceDigest({ cwd: root }),
  );
});

test('tracked source digest rejects a worktree changed after checkout', async (t) => {
  const root = await createFixture(t);

  await assert.rejects(
    computeTrackedSourceDigest({
      cwd: root,
      expectedCommitSha,
      runGit: (_command, args) => {
        if (args[0] === 'rev-parse') {
          return Buffer.from(`${expectedCommitSha}\n`);
        }
        if (args[0] === 'diff') {
          throw new Error('git diff exit 1');
        }
        return Buffer.from('package.json\0src/index.js\0src/中文.txt\0');
      },
    }),
    /tracked source files changed after checkout/,
  );
});

test('tracked source digest rejects a checkout for a different commit', async (t) => {
  const root = await createFixture(t);

  await assert.rejects(
    computeTrackedSourceDigest({
      cwd: root,
      expectedCommitSha,
      runGit: (_command, args) => {
        if (args[0] === 'rev-parse') {
          return Buffer.from(`${'f'.repeat(40)}\n`);
        }
        return Buffer.alloc(0);
      },
    }),
    /checkout revision mismatch/,
  );
});

test('tracked source digest rejects a committed production artifact', async (t) => {
  const root = await createFixture(t);

  await assert.rejects(
    computeTrackedSourceDigest({
      cwd: root,
      expectedCommitSha,
      runGit: (_command, args) => {
        if (args[0] === 'rev-parse') {
          return Buffer.from(`${expectedCommitSha}\n`);
        }
        if (args[0] === 'diff') {
          return Buffer.alloc(0);
        }
        return Buffer.from('dist/index.html\0package.json\0src/index.js\0src/中文.txt\0');
      },
    }),
    /tracked source path is excluded from workspace hashing: dist\/index\.html/,
  );
});
