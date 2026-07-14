import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  runDeployRevisionVerification,
  verifyDeploySource,
} from '../scripts/verify-deploy-revision.mjs';

const expectedSha = '0123456789abcdef0123456789abcdef01234567';
const expectedDigest = 'a'.repeat(64);

test('deploy source verification binds the commit metadata to the exact source digest', () => {
  assert.deepEqual(
    verifyDeploySource(expectedSha.toUpperCase(), expectedDigest, expectedDigest.toUpperCase()),
    { commitSha: expectedSha, sourceDigest: expectedDigest },
  );
});

test('deploy source verification rejects a different workspace snapshot', () => {
  assert.throws(
    () => verifyDeploySource(expectedSha, expectedDigest, 'b'.repeat(64)),
    /source digest mismatch/,
  );
});

test('deploy revision verification rejects an invalid expected revision', () => {
  assert.throws(
    () => verifyDeploySource('master', expectedDigest, expectedDigest),
    /40-character Git commit SHA/,
  );
});

test('deploy source verification rejects an invalid expected source digest', () => {
  assert.throws(
    () => verifyDeploySource(expectedSha, 'not-a-digest', expectedDigest),
    /64-character SHA-256/,
  );
});

test('CloudBase verifies the source, runs one production build, and rechecks the source', async () => {
  const calls = [];
  const logs = [];

  const result = await runDeployRevisionVerification({
    env: {
      EXPECTED_GITHUB_SHA: expectedSha,
      EXPECTED_SOURCE_SHA256: expectedDigest,
    },
    readSourceDigest: async () => {
      calls.push('readSourceDigest');
      return expectedDigest;
    },
    runBuild: async () => {
      calls.push('runBuild');
      return 0;
    },
    logger: (entry) => logs.push(entry),
  });

  assert.deepEqual(result, { commitSha: expectedSha, sourceDigest: expectedDigest });
  assert.deepEqual(calls, ['readSourceDigest', 'runBuild', 'readSourceDigest']);
  assert.deepEqual(logs, [
    {
      event: 'deploy-revision-verified',
      phase: 'before-build',
      commitSha: expectedSha,
      sourceDigest: expectedDigest,
    },
    {
      event: 'deploy-revision-verified',
      phase: 'after-build',
      commitSha: expectedSha,
      sourceDigest: expectedDigest,
    },
  ]);
});

test('source digest mismatch prevents the production build', async () => {
  let buildCalls = 0;
  await assert.rejects(
    runDeployRevisionVerification({
      env: {
        EXPECTED_GITHUB_SHA: expectedSha,
        EXPECTED_SOURCE_SHA256: expectedDigest,
      },
      readSourceDigest: async () => 'b'.repeat(64),
      runBuild: async () => {
        buildCalls += 1;
        return 0;
      },
    }),
    /source digest mismatch/,
  );
  assert.equal(buildCalls, 0);
});

test('CloudBase deployment script builds and validates without recursively running full verify', async () => {
  const source = await readFile('scripts/verify-deploy-revision.mjs', 'utf8');
  assert.doesNotMatch(source, /npm(?:\.cmd)?['"],\s*\['run',\s*'verify'/);
  assert.match(source, /\['run', 'build'\]/);
  assert.match(source, /scripts\/validate-html\.mjs/);
});

test('failed production build makes the CloudBase build fail', async () => {
  await assert.rejects(
    runDeployRevisionVerification({
      env: {
        EXPECTED_GITHUB_SHA: expectedSha,
        EXPECTED_SOURCE_SHA256: expectedDigest,
      },
      readSourceDigest: async () => expectedDigest,
      runBuild: async () => 2,
      logger: () => {},
    }),
    /production build failed with exit code 2/,
  );
});

test('a production build that mutates tracked source fails before deployment', async () => {
  const digests = [expectedDigest, 'b'.repeat(64)];

  await assert.rejects(
    runDeployRevisionVerification({
      env: {
        EXPECTED_GITHUB_SHA: expectedSha,
        EXPECTED_SOURCE_SHA256: expectedDigest,
      },
      readSourceDigest: async () => digests.shift(),
      runBuild: async () => 0,
      logger: () => {},
    }),
    /source digest mismatch/,
  );
});
