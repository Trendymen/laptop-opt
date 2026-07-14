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
  'Install CloudBase CLI',
  'Log in to CloudBase',
  'Deploy CloudBase application',
];

function collectSecretExpressionPaths(value, path = [], paths = []) {
  if (typeof value === 'string') {
    if (/\$\{\{\s*secrets\./.test(value)) paths.push(path.join('.'));
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
  assert.deepEqual(Object.keys(workflow.jobs), ['verify-and-deploy']);
  assert.equal(job['timeout-minutes'], 15);
  assert.deepEqual(job.env, { CI: true });
  assert.deepEqual(steps.map((step) => step.name), expectedStepNames);
  assert.deepEqual(steps.slice(0, 4).map((step) => step.if), [undefined, undefined, undefined, undefined]);
  assert.deepEqual(steps.slice(4).map((step) => step.if), [deployGuard, deployGuard, deployGuard]);
  assert.deepEqual(steps[5].env, {
    TCB_SECRET_ID: '${{ secrets.TCB_SECRET_ID }}',
    TCB_SECRET_KEY: '${{ secrets.TCB_SECRET_KEY }}',
  });
  assert.deepEqual(steps[6].env, {
    TCB_ENV_ID: '${{ secrets.TCB_ENV_ID }}',
  });
  assert.deepEqual(collectSecretExpressionPaths(workflow).sort(), [
    'jobs.verify-and-deploy.steps.5.env.TCB_SECRET_ID',
    'jobs.verify-and-deploy.steps.5.env.TCB_SECRET_KEY',
    'jobs.verify-and-deploy.steps.6.env.TCB_ENV_ID',
  ]);

  assert.equal(steps[0].uses, 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0');
  assert.equal(steps[1].uses, 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e');
  assert.deepEqual(steps[1].with, { 'node-version': '20', cache: 'npm' });
  assert.equal(steps[2].run, 'npm ci');
  assert.equal(steps[3].run, 'npm run verify');
  assert.equal(steps[4].run, 'npm install --global @cloudbase/cli@3.6.1');
  assert.match(steps[5].run, /tcb login --apiKeyId "\$TCB_SECRET_ID" --apiKey "\$TCB_SECRET_KEY"/);
  const expectedDeployRun = [
    'set -euo pipefail',
    ': "${TCB_ENV_ID:?TCB_ENV_ID is not configured}"',
    'tcb app info laptop --env-id "$TCB_ENV_ID" --json',
    'tcb app deploy laptop \\',
    '  --env-id "$TCB_ENV_ID" \\',
    '  --framework static \\',
    '  --install-command "" \\',
    '  --build-command "" \\',
    '  --output-dir ./dist \\',
    '  --deploy-path / \\',
    '  --force \\',
    '  --yes \\',
    '  --json',
  ].join('\n');
  assert.equal(steps[6].run.trimEnd(), expectedDeployRun);
  assert.doesNotMatch(
    workflowSource,
    /pull_request_target|tcb hosting deploy|hosting delete|app delete|\.\/dist \/home|\/Users\/|AKID/,
  );
}

test('CloudBase workflow verifies PRs and only deploys trusted master revisions', async () => {
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
  const mutated = workflow
    .replace(
      '    env:\n      CI: true\n',
      '    env:\n      CI: true\n      TCB_SECRET_ID: ${{ secrets.TCB_SECRET_ID }}\n      TCB_SECRET_KEY: ${{ secrets.TCB_SECRET_KEY }}\n',
    )
    .replace(
      '        env:\n          TCB_SECRET_ID: ${{ secrets.TCB_SECRET_ID }}\n          TCB_SECRET_KEY: ${{ secrets.TCB_SECRET_KEY }}\n',
      '',
    );

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects an unguarded deploy step', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const guard = "${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/master' }}";
  const mutated = workflow.replace(
    `      - name: Deploy CloudBase application\n        if: ${guard}\n`,
    `      - name: Guard-count decoy\n        if: ${guard}\n        run: true\n\n      - name: Deploy CloudBase application\n`,
  );

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects deployment without the existing-app check', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace('tcb app info laptop --env-id "$TCB_ENV_ID" --json\n', '');

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects an inferred application name', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace('tcb app deploy laptop \\\n', 'tcb app deploy \\\n');

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects a nested deploy path', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace('--deploy-path / \\\n', '--deploy-path /laptop \\\n');

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects a different output directory', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace('--output-dir ./dist \\\n', '--output-dir ./dist-backup \\\n');

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects a missing line continuation', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace('--framework static \\\n', '--framework static\n');

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});
