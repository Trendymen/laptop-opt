# CloudBase GIT Application Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execute the TDD and verification gates in order.

**Goal:** 由 GitHub Actions 更新现有 CloudBase 应用 `laptop`，通过 CloudBase 服务端拉取公开 Git 仓库来绕开失败的 runner-to-COS ZIP 上传，并以新版本 `SUCCESS` 作为部署完成条件。

**Architecture:** GitHub Actions 先运行 `npm run verify`，随后由 Node ESM 脚本使用腾讯云官方 TCB SDK 执行 `DescribeCloudAppInfo → CreateCloudApp(BuildType=GIT) → DescribeCloudAppVersion(BuildId)`。CloudBase 服务端从 `Trendymen/laptop-opt@master` 重新安装、验证、构建并发布到 `/`。

**Tech Stack:** GitHub Actions、Node.js 20 ESM、`tencentcloud-sdk-nodejs-tcb` 4.1.266、`node:test`、YAML。

## Global Constraints

- 目标环境只来自 `TCB_ENV_ID`，目标应用固定为 `laptop`，应用路径固定为 `/`。
- 部署前必须确认现有应用的名称、类型和路径；校验失败时禁止创建版本。
- GIT 来源固定为 `github / Trendymen/laptop-opt / master`。
- CloudBase 构建命令固定为 `npm ci`、`npm run verify:deploy`、`tcb hosting deploy ./dist /`；npm script 调用 revision 脚本，校验当前 Git SHA 后无 shell 拼接地执行 `npm run verify`。平台自定义构建命令白名单不接受直接以 `node` 开头。
- 不再调用 CLI `app deploy`、ZIP/COS 上传或 `tcb login`。
- 三个 Secrets 只允许进入最后一个受信任 `master` 部署步骤。
- PR 只验证；生产 push 串行排队，不能取消已经可能触发远端构建的 job。
- 不执行任何应用、版本或静态文件删除命令。
- 不修改页面模板、样式、图片、截图或内容。

---

### Task 1: 用失败测试冻结应用部署契约

**Files:**
- Create: `tests/deploy-cloudbase-app.test.mjs`
- Modify: `tests/deploy-workflow.test.mjs`
- Modify: `package.json`

- [ ] 为部署脚本增加精确 payload 测试：`serviceName=laptop`、`deployType=static-hosting`、`buildType=GIT`、公开仓库三个字段、根路径、构建命令；拒绝 ZIP/COS 字段。
- [ ] 增加 update-only 测试：应用不存在、名称不符、类型不符或路径不是 `/` 时，`createApp` 调用数必须为零。
- [ ] 增加调用顺序和轮询测试：查询应用后才能创建；必须轮询创建结果的 `BuildId`；覆盖 `BUILDING→SUCCESS`、`FAILED`、未知状态与超时，全部使用假时钟。
- [ ] 增加环境变量和日志测试：任一变量缺失时在 SDK 初始化前失败；输出不得包含任一原始值。
- [ ] 收紧 workflow 契约：五个固定步骤、最后一步唯一 Secrets 作用域、串行并发、精确脚本入口，并拒绝 CLI/ZIP/COS/删除命令。
- [ ] 把新测试加入显式测试列表，运行聚焦测试并确认因脚本和 workflow 尚未实现而 RED。

### Task 2: 最小实现 SDK GIT 部署

**Files:**
- Create: `scripts/deploy-cloudbase-app.mjs`
- Modify: `.github/workflows/deploy-cloudbase.yml`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] 安装并精确锁定 `tencentcloud-sdk-nodejs-tcb@4.1.266`，把 common 依赖固定为 `4.1.220`，使用 `uuid@11.1.1` override 保持生产依赖审计为 0。
- [ ] 实现纯函数 payload、递归 API 字段转换、目标校验和 BuildId 轮询；真实入口动态导入 SDK，初始化只发生一次。
- [ ] 日志仅输出脱敏 JSON 摘要；`createApp` 不做盲目重试，查询失败直接终止。
- [ ] workflow 删除 CLI 安装与登录，最后一步执行 `node scripts/deploy-cloudbase-app.mjs`；三个 Secrets 只在该步骤 env 中。
- [ ] 把 `cancel-in-progress` 改为 `false`，job timeout 大于脚本超时。
- [ ] 运行聚焦测试直到 GREEN。

### Task 3: 完整验证和独立审查

- [ ] 运行 `npm run verify`，确认所有测试、构建与 standalone HTML validator 通过。
- [ ] 运行 `git diff --check`，检查生成产物是否有非预期改动。
- [ ] 独立 reviewer 检查 target、payload、BuildId、Secrets、PR guard、并发和危险命令，无 Critical/Important 后才提交。
- [ ] 提交并推送当前 `master`。

### Task 4: 真实 Actions 与 CloudBase 验收

- [ ] 仅跟踪最终 HEAD 对应的 GitHub Actions run，等待 job 完成。
- [ ] 确认 run conclusion 为 `success`，check annotations 为 `[]`。
- [ ] 只读查询 `laptop`：`ServiceName=laptop`、`AppPath=/`、`LatestStatus=SUCCESS`，版本不再是 `laptop-006`。
- [ ] 请求线上 `/index.html?ci=<HEAD>`，与本地 `dist/index.html` 比较 SHA-256。
- [ ] 扫描 Actions 日志，确认三个 Secret 原值均未出现。
- [ ] `git fetch` 后确认本地与 `origin/master` 同步且工作区 clean。
