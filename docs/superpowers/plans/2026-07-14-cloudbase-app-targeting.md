# CloudBase Application Targeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 GitHub Actions 从环境级静态文件上传改为显式更新控制台现有应用 `laptop`，并用应用版本变化证明 CI/CD 目标正确。

**Architecture:** 保留现有验证、登录、Secrets 和分支 guard，只替换最后的部署语义。部署前通过 `tcb app info laptop` 做 update-only 存在性保护，再用 `tcb app deploy laptop` 将已验证的 `dist/` 作为纯静态产物挂载到 `/`。

**Tech Stack:** GitHub Actions、CloudBase CLI 3.6.1、YAML、Node.js `node:test`、`yaml` 2.9.0、GitHub CLI。

## Global Constraints

- 目标应用名称固定为 `laptop`，不得从 `package.json` 自动推断。
- 目标应用路径固定为 `/`，不得使用默认 `/laptop`。
- 目标环境只从 GitHub Secret `TCB_ENV_ID` 读取。
- CloudBase 侧不得重复安装依赖或构建；必须复用 `npm run verify` 生成的 `./dist`。
- 部署前必须确认现有 `laptop` 应用存在，禁止意外创建第二个应用。
- 不执行 `hosting delete`、`app delete` 或任何清空远端文件的命令。
- PR 只验证；只有非 PR 的 `master` revision 才允许登录和部署。
- 不修改页面模板、样式、图片、截图或页面内容测试。

---

### Task 1: 将 workflow 切换到现有 `laptop` 应用

**Files:**
- Modify: `tests/deploy-workflow.test.mjs`
- Modify: `.github/workflows/deploy-cloudbase.yml`

**Interfaces:**
- Consumes: GitHub Secrets `TCB_SECRET_ID`、`TCB_SECRET_KEY`、`TCB_ENV_ID`；`npm run verify` 生成的 `./dist`。
- Produces: 只更新已存在 `laptop` 应用、路径 `/` 的受约束 GitHub Actions workflow。

- [ ] **Step 1: 先修改 workflow 契约测试**

在 `tests/deploy-workflow.test.mjs` 中把最后一个步骤名改为 `Deploy CloudBase application`，并用以下断言替换原 `tcb hosting deploy` 断言：

```js
  const deployRun = steps[6].run;
  const infoCommand = 'tcb app info laptop --env-id "$TCB_ENV_ID" --json';
  const deployCommand = 'tcb app deploy laptop';
  const infoCommandIndex = deployRun.indexOf(infoCommand);
  const deployCommandIndex = deployRun.indexOf(deployCommand);

  assert.ok(infoCommandIndex >= 0, 'deployment must verify the existing laptop app');
  assert.ok(
    deployCommandIndex > infoCommandIndex,
    'application existence check must run before deployment',
  );
  const deployArgs = deployRun.slice(deployCommandIndex);
  assert.match(deployArgs, /tcb app deploy laptop \\/);
  assert.match(deployArgs, /--env-id "\$TCB_ENV_ID"/);
  assert.match(deployArgs, /--framework static/);
  assert.match(deployArgs, /--install-command ""/);
  assert.match(deployArgs, /--build-command ""/);
  assert.match(deployArgs, /--output-dir \.\/dist/);
  assert.match(deployArgs, /--deploy-path \//);
  assert.match(deployArgs, /--force/);
  assert.match(deployArgs, /--yes/);
  assert.match(deployArgs, /--json/);
  assert.doesNotMatch(
    workflowSource,
    /pull_request_target|tcb hosting deploy|hosting delete|app delete|\.\/dist \/home|\/Users\/|AKID/,
  );
```

更新 unguarded-deploy mutation，使其匹配新步骤名：

```js
  const mutated = workflow.replace(
    `      - name: Deploy CloudBase application\n        if: ${guard}\n`,
    `      - name: Guard-count decoy\n        if: ${guard}\n        run: true\n\n      - name: Deploy CloudBase application\n`,
  );
```

再增加两个 mutation test，证明契约会拒绝丢失应用存在性检查或显式应用名：

```js
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
```

- [ ] **Step 2: 运行聚焦测试并确认 RED**

Run:

```bash
node --test tests/deploy-workflow.test.mjs
```

Expected: FAIL；当前 workflow 仍名为 `Deploy to CloudBase static hosting` 且仍执行 `tcb hosting deploy`，因此新应用级契约不满足。

- [ ] **Step 3: 最小修改 GitHub Actions workflow**

将 `.github/workflows/deploy-cloudbase.yml` 的最后一个步骤替换为：

```yaml
      - name: Deploy CloudBase application
        if: ${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/master' }}
        env:
          TCB_ENV_ID: ${{ secrets.TCB_ENV_ID }}
        run: |
          set -euo pipefail
          : "${TCB_ENV_ID:?TCB_ENV_ID is not configured}"
          tcb app info laptop --env-id "$TCB_ENV_ID" --json
          tcb app deploy laptop \
            --env-id "$TCB_ENV_ID" \
            --framework static \
            --install-command "" \
            --build-command "" \
            --output-dir ./dist \
            --deploy-path / \
            --force \
            --yes \
            --json
```

- [ ] **Step 4: 验证 GREEN 与完整回归**

Run:

```bash
node --test tests/deploy-workflow.test.mjs
npm run verify
git diff --check
```

Expected: workflow 聚焦测试全部 PASS；完整测试 53/53 PASS；构建输出 `dist/index.html`；standalone validator 通过；`git diff --check` 无输出。

如果 `npm run verify` 只改写了生成产物而内容未变，确认后执行：

```bash
git restore --source=HEAD -- dist/index.html
```

- [ ] **Step 5: 提交单一修复**

Run:

```bash
git add tests/deploy-workflow.test.mjs .github/workflows/deploy-cloudbase.yml
git diff --cached --check
git commit -m "fix: deploy the existing CloudBase application"
```

Expected: 提交只包含 workflow 与它的契约测试。

---

### Task 2: 独立复核并验证真实应用版本

**Files:**
- Review only: `.github/workflows/deploy-cloudbase.yml`
- Review only: `tests/deploy-workflow.test.mjs`
- External state: GitHub Actions、CloudBase 应用 `laptop`

**Interfaces:**
- Consumes: Task 1 的提交；修复前版本基线 `laptop-006`。
- Produces: 成功的 Actions 运行、`laptop` 新应用版本、未改变的 `/` 路径和一致的线上产物。

- [ ] **Step 1: 独立 review**

审查范围从设计文档提交的父提交到 Task 1 HEAD。Reviewer 必须检查：

- `app info laptop` 先于部署执行；
- 应用名固定为 `laptop`，路径固定为 `/`；
- install/build 都显式跳过，`output-dir` 固定 `./dist`；
- `--force --yes` 保证非交互更新；
- `tcb hosting deploy`、删除命令和额外 Secrets 不存在；
- PR 与 `master` guard 未弱化。

Expected: 无 Critical 或 Important 问题。

- [ ] **Step 2: 推送并等待目标 revision 的 Actions**

Run:

```bash
git push origin master
HEAD_SHA="$(git rev-parse HEAD)"
RUN_ID="$(gh run list --repo Trendymen/laptop-opt --workflow deploy-cloudbase.yml --branch master --commit "$HEAD_SHA" --limit 3 --json databaseId --jq '.[0].databaseId')"
gh run view "$RUN_ID" --repo Trendymen/laptop-opt --json databaseId,status,conclusion,url,headSha
```

等待该 revision 的运行结束：

```bash
gh run watch "$RUN_ID" --repo Trendymen/laptop-opt --exit-status
```

Expected: Verify/build、CLI 安装、登录和 `Deploy CloudBase application` 全部成功。

- [ ] **Step 3: 核对 CloudBase 应用版本**

使用临时 HOME 登录 CloudBase CLI 3.6.1，执行：

```bash
tcb app info laptop --json -e "$TCB_ENV_ID"
```

凭据必须从 `/Users/liuzhuo/Desktop/keys` 读取且不得输出。Expected JSON 的 `data` 字段包含：

```json
{
  "data": {
    "serviceName": "laptop",
    "appPath": "/",
    "latestStatus": "SUCCESS"
  }
}
```

同时 `latestVersionName` 必须存在且不等于修复前的 `laptop-006`。

- [ ] **Step 4: 核对线上产物、日志和 Git 同步状态**

用应用详情返回的公网 URL 请求：

```text
/index.html?ci=$HEAD_SHA
```

Expected:

- HTTP 200；
- 远端响应与本地 `dist/index.html` SHA-256 一致；
- Actions 日志不包含 `TCB_SECRET_ID`、`TCB_SECRET_KEY`、`TCB_ENV_ID` 的任何原始值；
- `JOB_ID="$(gh run view "$RUN_ID" --repo Trendymen/laptop-opt --json jobs --jq '.jobs[0].databaseId')"` 后，`gh api "repos/Trendymen/laptop-opt/check-runs/$JOB_ID/annotations"` 返回 `[]`；
- `git fetch origin && git rev-list --left-right --count origin/master...HEAD` 返回 `0 0`；
- `git status --short --branch` 为 clean。

---

### Task 3: 将应用部署输入收窄到 `dist/`

**Files:**
- Modify: `tests/deploy-workflow.test.mjs`
- Modify: `.github/workflows/deploy-cloudbase.yml`

**Root cause:** CloudBase CLI 3.6.1 的 `app deploy` 会压缩当前工作目录，只默认忽略 `.git`、`node_modules` 和 `.DS_Store`。从仓库根目录运行会额外上传 `.cache`、`output`、`.superpowers`、源码与其他无关内容；当前未压缩输入约百 MB，应用版本创建前的上传因此超过十分钟。

- [ ] **Step 1: 先收紧 workflow 契约测试并确认 RED**

在 `assertWorkflowContract` 的部署步骤环境断言后加入：

```js
  assert.equal(steps[6]['working-directory'], 'dist');
```

把 `expectedDeployRun` 中的输出目录改为当前目录，并拒绝 `--cwd`：

```js
    '  --output-dir ./ \\',

  assert.doesNotMatch(steps[6].run, /(?:^|\s)--cwd(?:\s|$)/m);
```

增加三个 mutation tests：

```js
test('CloudBase workflow contract rejects deployment from the repository root', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace('        working-directory: dist\n', '');

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects the repository-root output path', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace('--output-dir ./ \\\n', '--output-dir ./dist \\\n');

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});

test('CloudBase workflow contract rejects the ineffective cwd option', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const mutated = workflow.replace(
    '            --output-dir ./ \\\n',
    '            --cwd ./dist \\\n            --output-dir ./ \\\n',
  );

  assert.notEqual(mutated, workflow);
  assert.throws(() => assertWorkflowContract(mutated));
});
```

Run:

```bash
node --test tests/deploy-workflow.test.mjs
```

Expected: FAIL；当前 workflow 仍从仓库根目录执行并使用 `--output-dir ./dist`。

- [ ] **Step 2: 最小修改部署步骤并确认 GREEN**

在 `Deploy CloudBase application` 步骤添加工作目录：

```yaml
        working-directory: dist
```

再把部署参数改为：

```bash
--output-dir ./
```

应用名 `laptop`、环境、存在性保护、根路径 `/`、空 install/build、`--force --yes --json` 均保持不变。

Run:

```bash
node --test tests/deploy-workflow.test.mjs
npm run verify
git diff --check
```

Expected: 聚焦测试和完整验证通过，构建产物仍为 `dist/index.html`。

- [ ] **Step 3: Review、提交、推送并核验最终部署**

独立 reviewer 必须确认：

- CLI 的实际压缩根目录是 `dist/`；
- 没有 `--cwd` / `buildPath` 歧义；
- 仍更新现有 `laptop` 应用与 `/` 路径；
- Secrets、PR guard 和禁止删除契约未弱化。

推送后等待同一 HEAD 的 Actions 结束，再执行 Task 2 的应用版本、线上 SHA-256、日志泄密与 Git 同步核验。
