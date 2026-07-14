import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';

const workflowPath = '.github/workflows/deploy-cloudbase.yml';
const deployGuard = "${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/master' }}";
const expectedStepNames = [
  'Checkout repository',
  'Set up Node.js',
  'Install dependencies',
  'Verify and build',
  'Deploy CloudBase application from Git',
];

function collectSecretExpressionPaths(value, path = [], paths = []) {
  if (typeof value === 'string') {
    const expressions = value.match(/\$\{\{[\s\S]*?\}\}/g) ?? [];
    if (expressions.some((expression) => /\bsecrets\s*(?:\.|\[)/.test(expression))) {
      paths.push(path.join('.'));
    }
    return paths;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSecretExpressionPaths(item, [...path, index], paths));
    return paths;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      collectSecretExpressionPaths(item, [...path, key], paths);
    }
  }

  return paths;
}

function assertWorkflowContract(workflowSource) {
  const workflow = parse(workflowSource);
  const job = workflow.jobs['verify-and-deploy'];
  const steps = job.steps;

  assert.equal(workflow.name, 'Verify and Deploy CloudBase');
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.push, { branches: ['master'] });
  assert.deepEqual(workflow.on.pull_request, { branches: ['master'] });
  assert.equal(workflow.on.workflow_dispatch, null);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.concurrency, {
    group: 'cloudbase-${{ github.workflow }}-${{ github.ref }}',
    'cancel-in-progress': false,
  });
  assert.deepEqual(Object.keys(workflow.jobs), ['verify-and-deploy']);
  assert.equal(job['timeout-minutes'], 20);
  assert.deepEqual(job.env, { CI: true });
  assert.deepEqual(steps.map((step) => step.name), expectedStepNames);
  assert.deepEqual(steps.slice(0, 4).map((step) => step.if), [undefined, undefined, undefined, undefined]);
  assert.equal(steps[4].if, deployGuard);
  assert.deepEqual(steps[4].env, {
    TCB_SECRET_ID: '${{ secrets.TCB_SECRET_ID }}',
    TCB_SECRET_KEY: '${{ secrets.TCB_SECRET_KEY }}',
    TCB_ENV_ID: '${{ secrets.TCB_ENV_ID }}',
    DEPLOY_COMMIT_SHA: '${{ github.sha }}',
  });
  assert.equal(steps[4]['working-directory'], undefined);
  assert.deepEqual(collectSecretExpressionPaths(workflow).sort(), [
    'jobs.verify-and-deploy.steps.4.env.TCB_ENV_ID',
    'jobs.verify-and-deploy.steps.4.env.TCB_SECRET_ID',
    'jobs.verify-and-deploy.steps.4.env.TCB_SECRET_KEY',
  ]);

  assert.equal(steps[0].uses, 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0');
  assert.equal(steps[1].uses, 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e');
  assert.deepEqual(steps[1].with, { 'node-version': '20', cache: 'npm' });
  assert.equal(steps[2].run, 'npm ci');
  assert.equal(steps[3].run, 'npm run verify');
  const expectedDeployRun = [
    'set -euo pipefail',
    ': "${TCB_SECRET_ID:?TCB_SECRET_ID is not configured}"',
    ': "${TCB_SECRET_KEY:?TCB_SECRET_KEY is not configured}"',
    ': "${TCB_ENV_ID:?TCB_ENV_ID is not configured}"',
    ': "${DEPLOY_COMMIT_SHA:?DEPLOY_COMMIT_SHA is not configured}"',
    'node scripts/deploy-cloudbase-app.mjs',
  ].join('\n');
  assert.equal(steps[4].run.trimEnd(), expectedDeployRun);

  assert.doesNotMatch(
    workflowSource,
    /@cloudbase\/cli|\btcb\s+(?:login|app\s+deploy|hosting\s+deploy)|uploadCode|cosTimestamp|zipFileUrl|pull_request_target|\/Users\/|AKID/,
  );
  assert.doesNotMatch(workflowSource, /\btcb\s+(?:hosting|app)\s+delete\b/);
}

test('CloudBase workflow verifies PRs and deploys trusted master revisions through the GIT API', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  assertWorkflowContract(workflow);
});

test('CloudBase workflow contract rejects additional trigger events', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace(
    '  workflow_dispatch:\n',
    "  workflow_dispatch:\n  schedule:\n    - cron: '0 0 * * *'\n",
  );

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects job-level deployment secrets', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace(
    '    env:\n      CI: true\n',
    '    env:\n      CI: true\n      TCB_SECRET_ID: ${{ secrets.TCB_SECRET_ID }}\n',
  );

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

for (const { label, expression } of [
  { label: 'single-quoted bracket secret access', expression: "${{ secrets['TCB_SECRET_ID'] }}" },
  { label: 'double-quoted bracket secret access', expression: '${{ secrets["TCB_SECRET_ID"] }}' },
  { label: 'dynamic bracket secret access', expression: '${{ secrets[github.ref_name] }}' },
]) {
  test(`CloudBase workflow contract rejects ${label}`, async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const mutated = workflow.replace(
      '  group: cloudbase-${{ github.workflow }}-${{ github.ref }}\n',
      `  group: cloudbase-\${{ github.workflow }}-\${{ github.ref }}-${expression}\n`,
    );

    assert.notEqual(mutated, workflow);
    assert.doesNotThrow(() => parse(mutated));
    assert.throws(() => assertWorkflowContract(mutated));
  });
}

test('CloudBase workflow contract rejects cancellation after a remote build may have started', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace('  cancel-in-progress: false\n', '  cancel-in-progress: true\n');

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects an unguarded deploy step', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace(
    `      - name: Deploy CloudBase application from Git\n        if: ${deployGuard}\n`,
    '      - name: Deploy CloudBase application from Git\n',
  );

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects a different deployment script', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace(
    'node scripts/deploy-cloudbase-app.mjs',
    'node scripts/deploy-something-else.mjs',
  );

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects a missing commit revision guard', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace(
    '          DEPLOY_COMMIT_SHA: ${{ github.sha }}\n',
    '',
  );

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

for (const command of [
  'npm install --global @cloudbase/cli@3.6.1',
  'tcb login --apiKeyId "$TCB_SECRET_ID" --apiKey "$TCB_SECRET_KEY"',
  'tcb app deploy laptop',
  'tcb hosting deploy ./dist /',
  'tcb app delete laptop',
]) {
  test(`CloudBase workflow contract rejects legacy or destructive command: ${command}`, async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const mutated = workflow.replace(
      '          node scripts/deploy-cloudbase-app.mjs\n',
      `          ${command}\n          node scripts/deploy-cloudbase-app.mjs\n`,
    );

    assert.notEqual(mutated, workflow);
    assert.doesNotThrow(() => parse(mutated));
    assert.throws(() => assertWorkflowContract(mutated));
  });
}
