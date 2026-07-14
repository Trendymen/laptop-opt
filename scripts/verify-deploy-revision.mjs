import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { computeWorkspaceSourceDigest } from './source-digest.mjs';

function normalizeCommitSha(value, label) {
  const commitSha = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error(`${label} must be a 40-character Git commit SHA`);
  }
  return commitSha;
}

function normalizeSourceDigest(value, label) {
  const sourceDigest = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sourceDigest)) {
    throw new Error(`${label} must be a 64-character SHA-256`);
  }
  return sourceDigest;
}

export function verifyDeploySource(expectedSha, expectedDigest, actualDigest) {
  const commitSha = normalizeCommitSha(expectedSha, 'EXPECTED_GITHUB_SHA');
  const expected = normalizeSourceDigest(expectedDigest, 'EXPECTED_SOURCE_SHA256');
  const actual = normalizeSourceDigest(actualDigest, 'CloudBase source digest');

  if (actual !== expected) {
    throw new Error(`CloudBase source digest mismatch: expected ${expected}, received ${actual}`);
  }

  return { commitSha, sourceDigest: actual };
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function runProductionBuild() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const buildExitCode = runCommand(npmCommand, ['run', 'build']);
  if (buildExitCode !== 0) {
    return buildExitCode;
  }

  return runCommand(process.execPath, ['scripts/validate-html.mjs']);
}

export async function runDeployRevisionVerification({
  env = process.env,
  readSourceDigest = computeWorkspaceSourceDigest,
  runBuild = runProductionBuild,
  logger = (entry) => console.log(JSON.stringify(entry)),
} = {}) {
  const expectedSha = normalizeCommitSha(
    env.EXPECTED_GITHUB_SHA,
    'EXPECTED_GITHUB_SHA',
  );
  const expectedDigest = normalizeSourceDigest(
    env.EXPECTED_SOURCE_SHA256,
    'EXPECTED_SOURCE_SHA256',
  );
  const beforeBuildDigest = await readSourceDigest();
  const { commitSha, sourceDigest } = verifyDeploySource(
    expectedSha,
    expectedDigest,
    beforeBuildDigest,
  );

  logger({
    event: 'deploy-revision-verified',
    phase: 'before-build',
    commitSha,
    sourceDigest,
  });

  const exitCode = await runBuild();
  if (exitCode !== 0) {
    throw new Error(`CloudBase production build failed with exit code ${exitCode}`);
  }

  const afterBuildDigest = await readSourceDigest();
  verifyDeploySource(expectedSha, expectedDigest, afterBuildDigest);

  logger({
    event: 'deploy-revision-verified',
    phase: 'after-build',
    commitSha,
    sourceDigest,
  });

  return { commitSha, sourceDigest };
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;

if (entryUrl === import.meta.url) {
  try {
    await runDeployRevisionVerification();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'deploy-revision-verification-failed',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
