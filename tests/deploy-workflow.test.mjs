import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('CloudBase workflow verifies PRs and only deploys trusted master revisions', async () => {
  const workflow = await readFile('.github/workflows/deploy-cloudbase.yml', 'utf8');

  assert.match(workflow, /^name: Verify and Deploy CloudBase$/m);
  assert.match(workflow, /push:\n\s+branches:\n\s+- master/);
  assert.match(workflow, /pull_request:\n\s+branches:\n\s+- master/);
  assert.match(workflow, /^\s+workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /timeout-minutes: 15/);
  assert.match(workflow, /uses: actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0/);
  assert.match(workflow, /uses: actions\/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e/);
  assert.match(workflow, /node-version: '20'/);
  assert.match(workflow, /cache: npm/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run verify/);
  assert.match(workflow, /npm install --global @cloudbase\/cli@3\.6\.1/);
  const deployGuard = /if: \$\{\{ github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/master' \}\}/g;
  assert.equal((workflow.match(deployGuard) ?? []).length, 3);
  assert.equal((workflow.match(/\$\{\{\s*secrets\./g) ?? []).length, 3);
  for (const name of ['TCB_SECRET_ID', 'TCB_SECRET_KEY', 'TCB_ENV_ID']) {
    assert.match(workflow, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
  assert.match(workflow, /tcb login --apiKeyId "\$TCB_SECRET_ID" --apiKey "\$TCB_SECRET_KEY"/);
  assert.match(workflow, /tcb hosting deploy \.\/dist -e "\$TCB_ENV_ID"/);
  assert.doesNotMatch(workflow, /hosting delete|\.\/dist \/home|\/Users\/|AKID/);
});
