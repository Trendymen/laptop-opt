# GitHub Actions 自动部署 CloudBase 设计

## 1. 目标

为公开仓库 `Trendymen/laptop-opt` 增加可审计的 CI/CD：Pull Request 先验证，`master` 通过验证后自动把 `dist/` 发布到现有 CloudBase 静态网站托管根目录。

仓库默认分支已经确认是 `master`。本地凭据文件 `/Users/liuzhuo/Desktop/keys` 包含且只用于写入以下 GitHub Actions repository secrets：

- `TCB_SECRET_ID`
- `TCB_SECRET_KEY`
- `TCB_ENV_ID`

任何凭据值都不得进入 Git、工作流源码、测试输出、命令日志或设计文档。

## 2. 官方依据

CloudBase 官方 GitHub Actions 指南要求：使用 GitHub Secrets 保存三项凭据，执行 `npm ci` 和项目构建，安装 CloudBase CLI，通过 `tcb login --apiKeyId ... --apiKey ...` 非交互登录，再运行 `tcb hosting deploy`。

- GitHub Actions 集成：<https://docs.cloudbase.net/hosting/cli-devops#github-actions>
- 静态托管部署：<https://docs.cloudbase.net/recipes/add-hosting-react>

本项目已用本地凭据对 CloudBase CLI `3.6.1` 做只读验证：登录成功，`tcb hosting detail --json -e <env>` 成功。验证过程使用临时 HOME，并且没有输出或持久化凭据。

## 3. 工作流边界

创建 `.github/workflows/deploy-cloudbase.yml`，名称为 `Verify and Deploy CloudBase`。

触发条件：

- 向 `master` push：执行 CI，成功后部署；
- 针对 `master` 的 pull request：只执行 CI，不安装 CloudBase CLI、不读取 Secrets、不部署；
- `workflow_dispatch`：只允许在 `master` 引用上执行部署。

不使用 `pull_request_target`，避免在具有高权限上下文时执行不可信 PR 代码。

## 4. CI 步骤

单个 job 按以下顺序执行：

1. 使用固定 commit SHA 的 `actions/checkout`；
2. 使用固定 commit SHA 的 `actions/setup-node`，Node.js 20，并启用 npm 缓存；
3. `npm ci`；
4. `npm run verify`。

`npm run verify` 已包含测试、`dist/index.html` 构建和 standalone HTML validator。任一步失败都立即终止，后续部署步骤不会执行。

## 5. CD 步骤

仅当 `github.ref == 'refs/heads/master'` 且事件不是 `pull_request` 时执行：

1. 全局安装固定版本 `@cloudbase/cli@3.6.1`；
2. 只在登录 step 的环境中注入 `TCB_SECRET_ID`、`TCB_SECRET_KEY`；
3. 执行 `tcb login --apiKeyId "$TCB_SECRET_ID" --apiKey "$TCB_SECRET_KEY"`；
4. 只在部署 step 的环境中注入 `TCB_ENV_ID`；
5. 执行 `tcb hosting deploy ./dist -e "$TCB_ENV_ID"`，省略 cloud path，使 `dist/` 内容发布到静态托管根目录。

不先执行 `hosting delete`，避免自动化流程删除未被本次构建覆盖的远端文件。

## 6. 安全与运行控制

- workflow 顶层权限固定为 `contents: read`；
- Secret 表达式只出现在对应 step 的 `env` 中，shell 命令只引用环境变量名；
- 不把 Secrets 放在 job 级环境，确保 `npm ci`、测试和构建无法读取部署凭据；
- 对同一个 workflow/ref 使用 concurrency，新的运行取消旧运行；
- job 超时为 15 分钟；
- GitHub Actions 使用不可变 commit SHA：
  - `actions/checkout`：`9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0`（v7.0.0，Node 24 runtime）；
  - `actions/setup-node`：`48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e`（v6.4.0，Node 24 runtime）。

## 7. 凭据配置

使用 `gh secret set` 从 `/Users/liuzhuo/Desktop/keys` 读取三项值并写入 `Trendymen/laptop-opt`。工具输出只验证 Secret 名称存在，不读取回写值。

凭据配置必须在推送 workflow 之前完成，避免首次 push 因缺少 Secrets 失败。

## 8. 验证标准

本地：

- 工作流契约测试先在文件缺失时失败，再在实现后通过；
- 使用 YAML 1.2 解析器校验精确触发器集合、job 与 step 顺序、三个 CD step 的完整条件，以及三项 Secret 表达式只能位于指定 step 的 `env`；
- 变异回归测试必须拒绝额外定时触发器、job 级部署凭据和无条件部署 step；
- `npm run verify` 全部通过；
- workflow YAML 能被解析，并且没有未替换占位符；
- `git diff --check` 通过。

GitHub：

- `gh secret list --app actions` 只显示三项 Secret 名称；
- workflow 被 GitHub 识别；
- push 到 `master` 后首次运行成功；
- 日志显示 verify、CloudBase 登录和根目录部署成功，且不出现凭据明文；
- 失败时不把失败运行描述为已部署。

## 9. 不做

- 不提交 `/Users/liuzhuo/Desktop/keys` 或生成 `.env`；
- 不在 PR 中部署；
- 不自动清空 CloudBase 静态托管；
- 不添加多环境、预览环境、域名切换或通知系统；
- 不改页面构建内容和现有截图产物。
