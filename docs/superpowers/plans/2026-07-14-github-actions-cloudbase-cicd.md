# GitHub Actions CloudBase CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为公开仓库增加 PR 验证和 `master` 自动发布到 CloudBase 静态托管根目录的 GitHub Actions。

**Architecture:** 一个 workflow job 先执行现有 `npm run verify`。部署步骤由事件和分支条件保护，Secrets 仅注入登录与部署 step；PR 永远只执行不带凭据的 CI。

**Tech Stack:** GitHub Actions、Node.js 20、Node `node:test`、CloudBase CLI 3.6.1、GitHub CLI。

## Global Constraints

- 仓库为 `Trendymen/laptop-opt`，默认分支为 `master`。
- PR 到 `master` 只运行 `npm run verify`，不得读取 Secrets 或部署。
- `master` push 和 `master` 上的 `workflow_dispatch` 在验证成功后部署。
- CloudBase CLI 固定为 `@cloudbase/cli@3.6.1`。
- 部署命令固定为 `tcb hosting deploy ./dist -e "$TCB_ENV_ID"`，目标为静态托管根目录。
- repository secrets 名称固定为 `TCB_SECRET_ID`、`TCB_SECRET_KEY`、`TCB_ENV_ID`。
- Secret 值不得进入 Git、测试输出、工作流命令文本或 job 级环境。
- workflow 权限固定为 `contents: read`，禁止 `pull_request_target`。
- 不删除远端文件，不修改页面内容和截图产物。

---

### Task 1: 添加工作流安全契约和 GitHub Actions workflow

**Files:**
- Create: `tests/deploy-workflow.test.mjs`
- Create: `.github/workflows/deploy-cloudbase.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: `npm run verify` 与其生成的 `dist/index.html`。
- Produces: `Verify and Deploy CloudBase` workflow；PR 只验证，可信 `master` 运行验证后部署。

- [ ] **Step 1: 写失败测试并接入默认测试命令**

  创建 `tests/deploy-workflow.test.mjs`：

  ```js
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
    assert.match(workflow, /uses: actions\/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5/);
    assert.match(workflow, /uses: actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
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
  ```

  将 `tests/deploy-workflow.test.mjs` 加到 `package.json` 的 `test` 命令末尾。

- [ ] **Step 2: 运行测试并确认 RED**

  Run: `node --test tests/deploy-workflow.test.mjs`

  Expected: FAIL，错误为 `.github/workflows/deploy-cloudbase.yml` 不存在。

- [ ] **Step 3: 创建最小 workflow**

  创建 `.github/workflows/deploy-cloudbase.yml`：

  ```yaml
  name: Verify and Deploy CloudBase

  on:
    push:
      branches:
        - master
    pull_request:
      branches:
        - master
    workflow_dispatch:

  permissions:
    contents: read

  concurrency:
    group: cloudbase-${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: true

  jobs:
    verify-and-deploy:
      runs-on: ubuntu-latest
      timeout-minutes: 15
      env:
        CI: true
      steps:
        - name: Checkout repository
          uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1

        - name: Set up Node.js
          uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
          with:
            node-version: '20'
            cache: npm

        - name: Install dependencies
          run: npm ci

        - name: Verify and build
          run: npm run verify

        - name: Install CloudBase CLI
          if: ${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/master' }}
          run: npm install --global @cloudbase/cli@3.6.1

        - name: Log in to CloudBase
          if: ${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/master' }}
          env:
            TCB_SECRET_ID: ${{ secrets.TCB_SECRET_ID }}
            TCB_SECRET_KEY: ${{ secrets.TCB_SECRET_KEY }}
          run: |
            set -euo pipefail
            : "${TCB_SECRET_ID:?TCB_SECRET_ID is not configured}"
            : "${TCB_SECRET_KEY:?TCB_SECRET_KEY is not configured}"
            tcb login --apiKeyId "$TCB_SECRET_ID" --apiKey "$TCB_SECRET_KEY"

        - name: Deploy to CloudBase static hosting
          if: ${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/master' }}
          env:
            TCB_ENV_ID: ${{ secrets.TCB_ENV_ID }}
          run: |
            set -euo pipefail
            : "${TCB_ENV_ID:?TCB_ENV_ID is not configured}"
            tcb hosting deploy ./dist -e "$TCB_ENV_ID"
  ```

- [ ] **Step 4: 运行 focused GREEN 和完整验证**

  Run: `node --test tests/deploy-workflow.test.mjs`

  Expected: PASS，1/1。

  Run: `npm run verify`

  Expected: 所有测试、构建和 standalone validator 通过。

- [ ] **Step 5: 提交 workflow**

  ```bash
  git add .github/workflows/deploy-cloudbase.yml tests/deploy-workflow.test.mjs package.json
  git diff --cached --check
  git commit -m "ci: deploy master to CloudBase"
  ```

### Task 2: 配置 Secrets、推送并验证首次自动部署

**Files:**
- Read only: `/Users/liuzhuo/Desktop/keys`
- External state: GitHub repository secrets and Actions run

**Interfaces:**
- Consumes: Task 1 的 workflow 与本地三项凭据。
- Produces: `Trendymen/laptop-opt` 的三项 repository secrets 和成功的首次 `master` 部署运行。

- [ ] **Step 1: 安全写入三项 repository secrets**

  使用 Node ESM 读取 `KEY=VALUE` 或 `KEY: VALUE`，再把每个 value 通过 stdin 传给 `gh secret set`；脚本只输出 Secret 名称和退出状态，不输出 value：

  ```js
  import { readFileSync } from 'node:fs';
  import { spawnSync } from 'node:child_process';

  const source = readFileSync('/Users/liuzhuo/Desktop/keys', 'utf8');
  const names = ['TCB_SECRET_ID', 'TCB_SECRET_KEY', 'TCB_ENV_ID'];
  for (const name of names) {
    const match = source.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*[:=]\\s*['\"]?([^'\"\\r\\n]+)['\"]?\\s*$`, 'm'));
    if (!match?.[1]?.trim()) throw new Error(`Missing ${name}`);
    const result = spawnSync('gh', ['secret', 'set', name, '--repo', 'Trendymen/laptop-opt'], {
      input: match[1].trim(),
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(`Failed to set ${name}`);
    console.log(`${name}: configured`);
  }
  ```

  Run: `gh secret list --repo Trendymen/laptop-opt --app actions`

  Expected: 只显示 `TCB_SECRET_ID`、`TCB_SECRET_KEY`、`TCB_ENV_ID` 名称和更新时间。

- [ ] **Step 2: 同步并推送 `master`**

  Run: `git fetch origin`

  Run: `git rev-list --left-right --count origin/master...HEAD`

  Expected: 远端独有提交数为 `0`。

  Run: `git push origin master`

  Expected: 推送成功，并由本次 push 触发 `Verify and Deploy CloudBase`。

- [ ] **Step 3: 等待首次 Actions 运行**

  Run: `gh run list --repo Trendymen/laptop-opt --workflow deploy-cloudbase.yml --branch master --limit 1 --json databaseId,status,conclusion,url,headSha`

  Run: `RUN_ID="$(gh run list --repo Trendymen/laptop-opt --workflow deploy-cloudbase.yml --branch master --limit 1 --json databaseId --jq '.[0].databaseId')"`

  Run: `gh run watch "$RUN_ID" --repo Trendymen/laptop-opt --exit-status`

  Expected: verify/build、CLI 安装、CloudBase 登录和部署步骤全部成功。

- [ ] **Step 4: 验证远端状态和本地清洁**

  Run: `gh run view "$RUN_ID" --repo Trendymen/laptop-opt --json conclusion,url,headSha,jobs`

  Expected: `conclusion` 为 `success`，`headSha` 为当前 HEAD。

  Run: `git status --porcelain=v1`

  Expected: 无输出。

  Run: `git rev-list --left-right --count origin/master...HEAD`

  Expected: `0 0`。
