import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TARGET = Object.freeze({
  serviceName: 'laptop',
  deployType: 'static-hosting',
  appPath: '/',
});

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5 * 1000;
const WAITING_STATUSES = new Set(['PENDING', 'BUILDING']);

function uppercaseFirst(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function uppercaseObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(uppercaseObjectKeys);
  }

  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [uppercaseFirst(key), uppercaseObjectKeys(item)]),
    );
  }

  return value;
}

export function createTencentCloudService(client) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Tencent Cloud TCB client is not available');
  }

  return {
    describeAppInfo(params) {
      return client.request('DescribeCloudAppInfo', uppercaseObjectKeys(params));
    },
    createApp(params) {
      return client.request('CreateCloudApp', uppercaseObjectKeys(params));
    },
    describeAppVersion(params) {
      return client.request('DescribeCloudAppVersion', uppercaseObjectKeys(params));
    },
  };
}

export function createDeploymentRequest({ envId, commitSha }) {
  if (!String(envId ?? '').trim()) {
    throw new Error('TCB_ENV_ID is not configured');
  }
  if (!/^[0-9a-f]{40}$/i.test(String(commitSha ?? '').trim())) {
    throw new Error('DEPLOY_COMMIT_SHA must be a 40-character Git commit SHA');
  }

  return {
    envId,
    serviceName: TARGET.serviceName,
    deployType: TARGET.deployType,
    buildType: 'GIT',
    staticConfig: {
      framework: 'other',
      nodeJsVersion: '20',
      appPath: TARGET.appPath,
      buildPath: '',
      codeSource: 'github',
      codeRepo: 'Trendymen/laptop-opt',
      codeBranch: 'master',
      staticCmd: {
        installCmd: 'npm ci',
        buildCmd: 'node scripts/verify-deploy-revision.mjs',
        deployCmd: 'tcb hosting deploy ./dist /',
      },
      staticEnv: {
        variables: [{ key: 'EXPECTED_GITHUB_SHA', value: commitSha }],
      },
    },
  };
}

export function assertExistingTarget(info) {
  if (
    !info ||
    info.ServiceName !== TARGET.serviceName ||
    info.DeployType !== TARGET.deployType ||
    info.AppPath !== TARGET.appPath
  ) {
    throw new Error(
      'CloudBase target application mismatch: expected laptop, static-hosting, path /',
    );
  }

  return {
    serviceName: info.ServiceName,
    deployType: info.DeployType,
    appPath: info.AppPath,
    latestVersionName: info.LatestVersionName,
    latestStatus: info.LatestStatus,
  };
}

export async function waitForBuild({
  service,
  envId,
  buildId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  now = Date.now,
  sleep = (duration) => new Promise((resolveSleep) => setTimeout(resolveSleep, duration)),
}) {
  if (!String(buildId ?? '').trim()) {
    throw new Error('CreateCloudApp did not return a BuildId');
  }

  const startedAt = now();

  while (true) {
    const version = await service.describeAppVersion({
      envId,
      serviceName: TARGET.serviceName,
      deployType: TARGET.deployType,
      buildId,
    });
    const responseBuildId = String(version?.BuildId ?? '').trim();
    if (responseBuildId !== buildId) {
      throw new Error(
        `CloudBase BuildId mismatch: expected ${buildId}, received ${responseBuildId || '(empty)'}`,
      );
    }
    const status = String(version?.Status ?? '');

    if (status === 'SUCCESS') {
      return version;
    }

    if (status === 'FAILED') {
      const reason = String(version?.FailReason ?? '').trim();
      throw new Error(
        `CloudBase build ${buildId} failed${reason ? `: ${reason}` : ''}`,
      );
    }

    if (!WAITING_STATUSES.has(status)) {
      throw new Error(`unknown CloudBase build status for ${buildId}: ${status || '(empty)'}`);
    }

    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) {
      throw new Error(`CloudBase deployment timed out while waiting for ${buildId}`);
    }

    await sleep(Math.min(pollIntervalMs, timeoutMs - elapsed));
  }
}

export async function deployCloudBaseApp({
  service,
  envId,
  commitSha,
  logger = () => {},
  timeoutMs,
  pollIntervalMs,
  now,
  sleep,
}) {
  const targetInfo = await service.describeAppInfo({
    envId,
    serviceName: TARGET.serviceName,
    deployType: TARGET.deployType,
  });
  const target = assertExistingTarget(targetInfo);
  logger({ event: 'target-verified', ...target });

  const creation = await service.createApp(createDeploymentRequest({ envId, commitSha }));
  const buildId = String(creation?.BuildId ?? '').trim();
  if (!buildId) {
    throw new Error('CreateCloudApp did not return a BuildId');
  }

  logger({
    event: 'deployment-created',
    serviceName: TARGET.serviceName,
    versionName: creation?.VersionName,
    buildId,
    commitSha,
  });

  const version = await waitForBuild({
    service,
    envId,
    buildId,
    timeoutMs,
    pollIntervalMs,
    now,
    sleep,
  });

  logger({
    event: 'deployment-succeeded',
    serviceName: TARGET.serviceName,
    versionName: creation?.VersionName,
    buildId,
    status: version.Status,
    commitSha,
  });

  return { target, creation, version };
}

export function readDeploymentEnvironment(env = process.env) {
  const names = [
    'TCB_SECRET_ID',
    'TCB_SECRET_KEY',
    'TCB_ENV_ID',
    'DEPLOY_COMMIT_SHA',
  ];
  const values = {};

  for (const name of names) {
    const value = String(env[name] ?? '').trim();
    if (!value) {
      throw new Error(`${name} is not configured`);
    }
    values[name] = value;
  }

  return {
    secretId: values.TCB_SECRET_ID,
    secretKey: values.TCB_SECRET_KEY,
    envId: values.TCB_ENV_ID,
    commitSha: values.DEPLOY_COMMIT_SHA,
  };
}

export function sanitizeErrorMessage(error, env = process.env) {
  let message = error instanceof Error ? error.message : String(error);
  const sensitiveValues = [env.TCB_SECRET_ID, env.TCB_SECRET_KEY, env.TCB_ENV_ID]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const value of sensitiveValues) {
    message = message.split(value).join('[REDACTED]');
  }

  return message || 'Unknown CloudBase deployment error';
}

async function createOfficialTcbService({ secretId, secretKey }) {
  const sdk = await import('tencentcloud-sdk-nodejs-tcb');
  const tcb = sdk.tcb ?? sdk.default?.tcb;
  const Client = tcb?.v20180608?.Client;

  if (typeof Client !== 'function') {
    throw new Error('Official Tencent Cloud TCB SDK client is unavailable');
  }

  const client = new Client({
    credential: { secretId, secretKey },
    region: 'ap-shanghai',
  });
  return createTencentCloudService(client);
}

export async function runFromEnvironment({
  env = process.env,
  createService = createOfficialTcbService,
  logger = (entry) => console.log(JSON.stringify(entry)),
  timeoutMs,
  pollIntervalMs,
  now,
  sleep,
} = {}) {
  const { secretId, secretKey, envId, commitSha } = readDeploymentEnvironment(env);
  const service = await createService({ secretId, secretKey, envId });

  return deployCloudBaseApp({
    service,
    envId,
    commitSha,
    logger,
    timeoutMs,
    pollIntervalMs,
    now,
    sleep,
  });
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;

if (entryUrl === import.meta.url) {
  try {
    await runFromEnvironment();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'deployment-failed',
        message: sanitizeErrorMessage(error),
      }),
    );
    process.exitCode = 1;
  }
}
