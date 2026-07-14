# CloudBase 应用级 CI/CD 目标修正设计

## 背景与根因

当前 GitHub Actions 使用：

```bash
tcb hosting deploy ./dist -e "$TCB_ENV_ID"
```

该命令只把文件写入指定云开发环境的静态托管空间，不包含应用名称，也不会形成应用版本记录。

控制台证据显示，目标环境内已有应用 `laptop`，应用路径为 `/`；2026-07-14 的 Actions 部署完成后，该应用的更新时间仍停留在 2026-07-13。CloudBase CLI 3.6.1 的只读查询同时显示其最新版本仍为 `laptop-006`。这说明文件虽然已经上线，但本次 CI 没有更新控制台中的 `laptop` 应用实体。

CloudBase 官方的应用部署模型使用 `tcb app deploy [serviceName]`：`serviceName` 对应具体应用，部署会生成版本记录并更新应用状态。官方 CLI 帮助也明确区分：`app deploy` 支持版本管理，`hosting deploy` 仅做文件上传。

首次切换到 `app deploy` 后还暴露出第二个问题：CLI 3.6.1 会把当前工作目录整体压缩上传，只默认忽略 `.git`、`node_modules` 和 `.DS_Store`。如果命令从仓库根目录执行，已经完成本地构建仍会把 `.cache`、`output`、`.superpowers`、源码和 `dist` 一起打包；当前仓库这些非必要内容未压缩前约百 MB，导致 Actions 在创建新应用版本前长时间停留在上传阶段。CLI 3.6.1 还没有把 `--cwd` 解析出的 `projectPath` 传给上传函数，因此仅追加 `--cwd ./dist` 不能收窄压缩范围。应用部署必须让进程本身从 `dist/` 内执行，确保上传输入只有已验证产物。

## 目标

- GitHub Actions 显式更新现有应用 `laptop`，不再只更新底层静态文件。
- 保持目标云开发环境不变，继续由 `TCB_ENV_ID` 选择环境。
- 保持应用路径 `/` 不变，线上访问地址不迁移。
- 复用 `npm run verify` 已生成的 `dist/`，并且只上传该目录，避免上传缓存、截图中间产物、源码或在 CloudBase 中重复安装依赖与构建。
- 保留现有 Secrets 隔离、PR 只验证、`master` 才部署和最小权限策略。

## 方案选择

### 采用：GitHub Actions 显式执行应用部署

部署步骤的工作目录固定为 `dist/`。先用只读命令确认目标应用已经存在，再执行部署：

```bash
tcb app info laptop --env-id "$TCB_ENV_ID" --json

tcb app deploy laptop \
  --env-id "$TCB_ENV_ID" \
  --framework static \
  --install-command "" \
  --build-command "" \
  --output-dir ./ \
  --deploy-path / \
  --force \
  --yes \
  --json
```

参数含义：

- `app info laptop`：作为 update-only 前置保护；环境或应用名错误时立即失败，不允许 CI 意外创建第二个应用。
- `laptop`：显式绑定控制台现有应用，避免从 `package.json` 的 `laptop-performance-handoff` 自动推断出错误名称。
- `--env-id`：选择现有云开发环境。
- `--framework static`：声明这是纯静态应用。
- `working-directory: dist`：让 CLI 的压缩根目录直接落在已验证产物目录，只上传部署所需文件；不使用 `--cwd ./dist`，避免 CLI 同时把该值写入云端 `buildPath`。
- 空安装和构建命令：跳过 CloudBase 侧重复安装与构建，直接使用 Actions 已验证的产物。
- `--output-dir ./`：部署当前工作目录中的产物；此时 `index.html` 就在输出目录根部。
- `--deploy-path /`：继续挂载到当前根路径。
- `--force --yes`：更新已有应用并禁止 CI 等待交互确认。
- `--json`：提供适合 Actions 日志和后续自动检查的结构化结果。

### 不采用：继续使用 `tcb hosting deploy`

它只能证明文件已上传，无法证明 `laptop` 应用版本已更新，控制台状态会继续与线上文件不一致。

### 不采用：改由控制台 Git 仓库部署

这会让 CloudBase 控制台与现有 GitHub Actions 同时接管构建和部署，增加重复配置、凭据和触发器冲突；当前只需修正 Actions 的目标语义。

## Workflow 与测试修改

只修改两个生产相关文件：

1. `.github/workflows/deploy-cloudbase.yml`
   - 部署步骤改名为应用级部署。
   - 部署步骤使用 `working-directory: dist`，将上传边界收窄到构建产物。
   - 先确认 `laptop` 已存在，再用上述 `tcb app deploy laptop` 命令替换 `tcb hosting deploy`。
2. `tests/deploy-workflow.test.mjs`
   - 契约测试必须要求应用存在性检查、显式应用名 `laptop`、路径 `/`、步骤工作目录 `dist`、输出目录 `./`、非交互参数和应用部署命令。
   - 契约测试必须拒绝删除 `working-directory`、退回仓库根目录的 `./dist` 输出或改用 `--cwd`。
   - 契约测试必须拒绝重新出现 `tcb hosting deploy`。
   - 继续验证 Secrets 只存在于登录与部署步骤、部署 guard、固定 CLI 版本和禁止危险删除。

页面模板、样式、图片、截图和内容测试不在本次范围内。

## 验证与验收

1. 先修改契约测试并确认它因当前仍使用 `tcb hosting deploy` 而失败。
2. 最小修改 workflow，使聚焦测试转绿。
3. 执行完整 `npm run verify` 和 `git diff --check`。
4. 独立 review 检查目标应用、路径、非交互参数、Secrets 范围和 PR guard。
5. 推送 `master` 并等待 Actions 成功。
6. 使用只读 `tcb app info laptop --json -e <env>` 确认：
   - `serviceName` 仍为 `laptop`；
   - `appPath` 仍为 `/`；
   - `latestStatus` 为 `SUCCESS`；
   - `latestVersionName` 不再是修复前的 `laptop-006`。
7. 请求公网 `index.html`，确认 HTTP 200 且与本地 `dist/index.html` SHA-256 一致。

## 风险控制

- 不执行 `hosting delete` 或 `app delete`。
- 不创建第二个应用；`app info laptop` 必须先成功，再由固定 `serviceName=laptop` 和 `--force` 更新现有应用。
- 不改变 `TCB_ENV_ID`、根路径 `/` 或公网域名。
- 不从仓库根目录执行 `app deploy`；部署输入严格限制为 `dist/`，避免无关缓存和中间产物拖慢或污染应用版本。
- 如果应用部署失败，Actions 会失败并保留当前成功版本；不会在测试失败后继续部署。

## 参考

- CloudBase 应用部署：<https://docs.cloudbase.net/cli-v1/app/management>
- CloudBase 静态托管文件管理：<https://docs.cloudbase.net/cli-v1/hosting>
- CloudBase GitHub Actions 集成：<https://docs.cloudbase.net/hosting/cli-devops#github-actions>
