import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertExistingTarget,
  createTencentCloudService,
  createDeploymentRequest,
  deployCloudBaseApp,
  readDeploymentEnvironment,
  runFromEnvironment,
  sanitizeErrorMessage,
  waitForBuild,
} from '../scripts/deploy-cloudbase-app.mjs';

const envId = 'env-test-value';
const commitSha = '0123456789abcdef0123456789abcdef01234567';

const expectedRequest = {
  envId,
  serviceName: 'laptop',
  deployType: 'static-hosting',
  buildType: 'GIT',
  staticConfig: {
    framework: 'other',
    nodeJsVersion: '20',
    appPath: '/',
    buildPath: '',
    codeSource: 'github',
    codeRepo: 'Trendymen/laptop-opt',
    codeBranch: 'master',
    staticCmd: {
      installCmd: 'npm ci',
      buildCmd:
        'test "$(git rev-parse HEAD)" = "$EXPECTED_GITHUB_SHA" && npm run verify',
      deployCmd: 'tcb hosting deploy ./dist /',
    },
    staticEnv: {
      variables: [{ key: 'EXPECTED_GITHUB_SHA', value: commitSha }],
    },
  },
};

const validTarget = {
  ServiceName: 'laptop',
  DeployType: 'static-hosting',
  AppPath: '/',
  LatestVersionName: 'laptop-006',
  LatestStatus: 'SUCCESS',
};

test('deployment uses the narrow pinned Tencent Cloud SDK with the audited uuid override', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

  assert.equal(packageJson.dependencies['tencentcloud-sdk-nodejs-tcb'], '4.1.266');
  assert.equal(packageJson.dependencies['@cloudbase/manager-node'], undefined);
  assert.equal(packageJson.overrides['tencentcloud-sdk-nodejs-common'], '4.1.220');
  assert.equal(packageJson.overrides.uuid, '11.1.1');
});

test('GIT deployment request exactly targets the existing laptop application', () => {
  const request = createDeploymentRequest({ envId, commitSha });

  assert.deepEqual(request, expectedRequest);
  const serialized = JSON.stringify(request);
  assert.doesNotMatch(serialized, /cosTimestamp|cosSuffix|zipFileUrl|uploadCode/i);
});

test('GIT deployment request rejects an invalid commit revision', () => {
  assert.throws(
    () => createDeploymentRequest({ envId, commitSha: 'master' }),
    /40-character Git commit SHA/,
  );
});

test('Tencent Cloud adapter sends recursively PascalCased requests to the official TCB API', async () => {
  const calls = [];
  const client = {
    async request(action, params) {
      calls.push([action, params]);
      return { action };
    },
  };
  const service = createTencentCloudService(client);

  await service.describeAppInfo({ envId, serviceName: 'laptop', deployType: 'static-hosting' });
  await service.createApp(expectedRequest);
  await service.describeAppVersion({
    envId,
    serviceName: 'laptop',
    deployType: 'static-hosting',
    buildId: 'build-007',
  });

  assert.deepEqual(calls, [
    [
      'DescribeCloudAppInfo',
      { EnvId: envId, ServiceName: 'laptop', DeployType: 'static-hosting' },
    ],
    [
      'CreateCloudApp',
      {
        EnvId: envId,
        ServiceName: 'laptop',
        DeployType: 'static-hosting',
        BuildType: 'GIT',
        StaticConfig: {
          Framework: 'other',
          NodeJsVersion: '20',
          AppPath: '/',
          BuildPath: '',
          CodeSource: 'github',
          CodeRepo: 'Trendymen/laptop-opt',
          CodeBranch: 'master',
          StaticCmd: {
            InstallCmd: 'npm ci',
            BuildCmd:
              'test "$(git rev-parse HEAD)" = "$EXPECTED_GITHUB_SHA" && npm run verify',
            DeployCmd: 'tcb hosting deploy ./dist /',
          },
          StaticEnv: {
            Variables: [{ Key: 'EXPECTED_GITHUB_SHA', Value: commitSha }],
          },
        },
      },
    ],
    [
      'DescribeCloudAppVersion',
      {
        EnvId: envId,
        ServiceName: 'laptop',
        DeployType: 'static-hosting',
        BuildId: 'build-007',
      },
    ],
  ]);
});

test('existing target validation accepts only laptop at the hosting root', () => {
  assert.deepEqual(assertExistingTarget(validTarget), {
    serviceName: 'laptop',
    deployType: 'static-hosting',
    appPath: '/',
    latestVersionName: 'laptop-006',
    latestStatus: 'SUCCESS',
  });
});

for (const { label, target } of [
  { label: 'missing application', target: undefined },
  { label: 'different application', target: { ...validTarget, ServiceName: 'other' } },
  { label: 'different deployment type', target: { ...validTarget, DeployType: 'http-function' } },
  { label: 'nested application path', target: { ...validTarget, AppPath: '/laptop' } },
]) {
  test(`existing target validation rejects ${label}`, () => {
    assert.throws(() => assertExistingTarget(target), /target application mismatch/);
  });
}

test('deployment verifies the target, creates one version, and polls its BuildId', async () => {
  const calls = [];
  const statuses = ['PENDING', 'BUILDING', 'SUCCESS'];
  const logs = [];
  const service = {
    async describeAppInfo(params) {
      calls.push(['describeAppInfo', params]);
      return validTarget;
    },
    async createApp(params) {
      calls.push(['createApp', params]);
      return { BuildId: 'build-007', VersionName: 'laptop-007' };
    },
    async describeAppVersion(params) {
      calls.push(['describeAppVersion', params]);
      return { BuildId: 'build-007', Status: statuses.shift() };
    },
  };

  const result = await deployCloudBaseApp({
    service,
    envId,
    commitSha,
    logger: (entry) => logs.push(entry),
    sleep: async () => {},
    now: () => 0,
  });

  assert.deepEqual(calls[0], [
    'describeAppInfo',
    { envId, serviceName: 'laptop', deployType: 'static-hosting' },
  ]);
  assert.deepEqual(calls[1], ['createApp', expectedRequest]);
  assert.deepEqual(calls.slice(2), [
    [
      'describeAppVersion',
      { envId, serviceName: 'laptop', deployType: 'static-hosting', buildId: 'build-007' },
    ],
    [
      'describeAppVersion',
      { envId, serviceName: 'laptop', deployType: 'static-hosting', buildId: 'build-007' },
    ],
    [
      'describeAppVersion',
      { envId, serviceName: 'laptop', deployType: 'static-hosting', buildId: 'build-007' },
    ],
  ]);
  assert.equal(result.creation.BuildId, 'build-007');
  assert.equal(result.version.Status, 'SUCCESS');
  assert.deepEqual(
    logs.map((entry) => entry.event),
    ['target-verified', 'deployment-created', 'deployment-succeeded'],
  );
});

test('target mismatch prevents createApp from being called', async () => {
  let createCalls = 0;
  const service = {
    async describeAppInfo() {
      return { ...validTarget, AppPath: '/wrong' };
    },
    async createApp() {
      createCalls += 1;
    },
  };

  await assert.rejects(
    deployCloudBaseApp({ service, envId, commitSha }),
    /target application mismatch/,
  );
  assert.equal(createCalls, 0);
});

test('waitForBuild reports a failed build without retrying creation', async () => {
  const service = {
    async describeAppVersion() {
      return { BuildId: 'build-failed', Status: 'FAILED', FailReason: 'build command failed' };
    },
  };

  await assert.rejects(
    waitForBuild({ service, envId, buildId: 'build-failed', sleep: async () => {} }),
    /build-failed.*build command failed/,
  );
});

test('waitForBuild fails closed on an unknown status', async () => {
  const service = {
    async describeAppVersion() {
      return { BuildId: 'build-unknown', Status: 'QUEUED_ELSEWHERE' };
    },
  };

  await assert.rejects(
    waitForBuild({ service, envId, buildId: 'build-unknown', sleep: async () => {} }),
    /unknown CloudBase build status/,
  );
});

test('waitForBuild rejects a response for a different BuildId', async () => {
  const service = {
    async describeAppVersion() {
      return { BuildId: 'build-other', Status: 'SUCCESS' };
    },
  };

  await assert.rejects(
    waitForBuild({ service, envId, buildId: 'build-expected', sleep: async () => {} }),
    /BuildId mismatch.*build-expected.*build-other/,
  );
});

test('waitForBuild times out with a fake clock and no real delay', async () => {
  let clock = 0;
  const service = {
    async describeAppVersion() {
      return { BuildId: 'build-slow', Status: 'BUILDING' };
    },
  };

  await assert.rejects(
    waitForBuild({
      service,
      envId,
      buildId: 'build-slow',
      timeoutMs: 10,
      pollIntervalMs: 5,
      now: () => clock,
      sleep: async (duration) => {
        clock += duration;
      },
    }),
    /timed out.*build-slow/,
  );
});

test('deployment environment requires all credentials and the triggering commit', () => {
  const complete = {
    TCB_SECRET_ID: 'secret-id-value',
    TCB_SECRET_KEY: 'secret-key-value',
    TCB_ENV_ID: envId,
    DEPLOY_COMMIT_SHA: commitSha,
  };

  assert.deepEqual(readDeploymentEnvironment(complete), {
    secretId: 'secret-id-value',
    secretKey: 'secret-key-value',
    envId,
    commitSha,
  });

  for (const name of Object.keys(complete)) {
    assert.throws(
      () => readDeploymentEnvironment({ ...complete, [name]: ' ' }),
      new RegExp(`${name} is not configured`),
    );
  }
});

test('runFromEnvironment initializes the SDK only after validation and never logs secrets', async () => {
  const rawEnvironment = {
    TCB_SECRET_ID: 'secret-id-value',
    TCB_SECRET_KEY: 'secret-key-value',
    TCB_ENV_ID: envId,
    DEPLOY_COMMIT_SHA: commitSha,
  };
  const initialized = [];
  const logs = [];
  const service = {
    async describeAppInfo() {
      return validTarget;
    },
    async createApp() {
      return { BuildId: 'build-007', VersionName: 'laptop-007' };
    },
    async describeAppVersion() {
      return { BuildId: 'build-007', Status: 'SUCCESS' };
    },
  };

  await runFromEnvironment({
    env: rawEnvironment,
    createService: async (credentials) => {
      initialized.push(credentials);
      return service;
    },
    logger: (entry) => logs.push(entry),
  });

  assert.deepEqual(initialized, [
    { secretId: 'secret-id-value', secretKey: 'secret-key-value', envId },
  ]);
  const serializedLogs = JSON.stringify(logs);
  for (const value of Object.values(rawEnvironment).slice(0, 3)) {
    assert.doesNotMatch(serializedLogs, new RegExp(value));
  }
});

test('runFromEnvironment does not initialize the SDK when configuration is missing', async () => {
  let initializeCalls = 0;

  await assert.rejects(
    runFromEnvironment({
      env: {},
      createService: async () => {
        initializeCalls += 1;
      },
    }),
    /TCB_SECRET_ID is not configured/,
  );
  assert.equal(initializeCalls, 0);
});

test('error sanitization redacts every configured credential', () => {
  const env = {
    TCB_SECRET_ID: 'secret-id-value',
    TCB_SECRET_KEY: 'secret-key-value',
    TCB_ENV_ID: envId,
  };
  const message = sanitizeErrorMessage(
    new Error(`request failed: ${env.TCB_SECRET_ID} ${env.TCB_SECRET_KEY} ${env.TCB_ENV_ID}`),
    env,
  );

  assert.equal(message, 'request failed: [REDACTED] [REDACTED] [REDACTED]');
});
