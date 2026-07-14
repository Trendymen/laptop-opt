import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runDeployRevisionVerification,
  verifyDeployRevision,
} from '../scripts/verify-deploy-revision.mjs';

const expectedSha = '0123456789abcdef0123456789abcdef01234567';

test('deploy revision verification accepts the exact cloned commit', () => {
  assert.equal(verifyDeployRevision(expectedSha, expectedSha.toUpperCase()), expectedSha);
});

test('deploy revision verification rejects a moved branch revision', () => {
  assert.throws(
    () => verifyDeployRevision(expectedSha, 'fedcba9876543210fedcba9876543210fedcba98'),
    /revision mismatch/,
  );
});

test('deploy revision verification rejects an invalid expected revision', () => {
  assert.throws(() => verifyDeployRevision('master', expectedSha), /40-character Git commit SHA/);
});

test('verified deployment runs the full project verification without shell composition', async () => {
  const calls = [];
  const logs = [];

  const result = await runDeployRevisionVerification({
    env: { EXPECTED_GITHUB_SHA: expectedSha },
    readGitSha: async () => {
      calls.push('readGitSha');
      return expectedSha;
    },
    runVerify: async () => {
      calls.push('runVerify');
      return 0;
    },
    logger: (entry) => logs.push(entry),
  });

  assert.equal(result.commitSha, expectedSha);
  assert.deepEqual(calls, ['readGitSha', 'runVerify']);
  assert.deepEqual(logs, [{ event: 'deploy-revision-verified', commitSha: expectedSha }]);
});

test('revision mismatch prevents the full verification command', async () => {
  let verifyCalls = 0;

  await assert.rejects(
    runDeployRevisionVerification({
      env: { EXPECTED_GITHUB_SHA: expectedSha },
      readGitSha: async () => 'fedcba9876543210fedcba9876543210fedcba98',
      runVerify: async () => {
        verifyCalls += 1;
        return 0;
      },
    }),
    /revision mismatch/,
  );
  assert.equal(verifyCalls, 0);
});

test('failed project verification makes the cloud build fail', async () => {
  await assert.rejects(
    runDeployRevisionVerification({
      env: { EXPECTED_GITHUB_SHA: expectedSha },
      readGitSha: async () => expectedSha,
      runVerify: async () => 2,
      logger: () => {},
    }),
    /project verification failed with exit code 2/,
  );
});
