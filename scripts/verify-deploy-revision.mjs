import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function normalizeCommitSha(value, label) {
  const commitSha = String(value ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error(`${label} must be a 40-character Git commit SHA`);
  }
  return commitSha;
}

export function verifyDeployRevision(expectedSha, actualSha) {
  const expected = normalizeCommitSha(expectedSha, 'EXPECTED_GITHUB_SHA');
  const actual = normalizeCommitSha(actualSha, 'cloned Git HEAD');

  if (actual !== expected) {
    throw new Error(`CloudBase revision mismatch: expected ${expected}, received ${actual}`);
  }

  return actual;
}

function readCurrentGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function runProjectVerification() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['run', 'verify'], {
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

export async function runDeployRevisionVerification({
  env = process.env,
  readGitSha = readCurrentGitSha,
  runVerify = runProjectVerification,
  logger = (entry) => console.log(JSON.stringify(entry)),
} = {}) {
  const expectedSha = normalizeCommitSha(
    env.EXPECTED_GITHUB_SHA,
    'EXPECTED_GITHUB_SHA',
  );
  const actualSha = await readGitSha();
  const commitSha = verifyDeployRevision(expectedSha, actualSha);

  logger({ event: 'deploy-revision-verified', commitSha });

  const exitCode = await runVerify();
  if (exitCode !== 0) {
    throw new Error(`CloudBase project verification failed with exit code ${exitCode}`);
  }

  return { commitSha };
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
