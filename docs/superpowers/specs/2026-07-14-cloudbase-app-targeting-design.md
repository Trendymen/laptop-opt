# CloudBase 应用级 CI/CD 目标修正设计

## 背景与三次定位结果

目标云开发环境中已经存在应用 `laptop`，应用路径为 `/`，修复前最新成功版本为 `laptop-006`。CI/CD 必须更新这个应用的版本记录，而不是只改环境中的静态文件。

前两版方案分别暴露出目标语义和传输链路问题：

1. `tcb hosting deploy ./dist` 只上传环境级静态文件，不包含应用名，也不会为 `laptop` 生成应用版本。
2. `tcb app deploy laptop` 能选中正确应用，但 CloudBase CLI 3.6.1 会把进程工作目录压缩为 ZIP，再用一个 COS `PUT` 上传。从仓库根目录执行时输入约百 MB；改为只上传 `dist/` 后，输入虽已收窄，GitHub-hosted runner 仍在约九分钟后收到 COS `UserNetworkTooSlow`，失败发生在创建版本之前。

因此最终方案不能继续依赖 GitHub runner 到腾讯云 COS 的单次 ZIP 上传。

## 目标身份与代码来源

CloudBase 部署有两组不能混淆的标识：

- `envId` 选择腾讯云云开发环境；
- `serviceName: "laptop"` 选择该环境内的具体应用；
- `codeSource/codeRepo/codeBranch` 只描述应用版本的代码来源，不替代应用名。

同一环境、同一 `serviceName` 调用 `CreateCloudApp` 会为现有 `laptop` 创建新版本。部署前仍必须查询应用详情并校验名称和根路径，保持 update-only 行为。

## 最终架构

GitHub Actions 仍是唯一 CI/CD 触发入口：

1. checkout 当前 `master` revision；
2. `npm ci`；
3. `npm run verify`，在 GitHub 侧完成测试、构建和独立 HTML 校验；
4. 使用固定版本腾讯云官方 TCB API SDK 查询现有 `laptop`；
5. 通过 `BuildType=GIT` 创建该应用的新版本；
6. CloudBase 服务端从公开 GitHub 仓库拉取 `master`，重新执行安装、验证、构建和发布；
7. Actions 按 `CreateCloudApp` 返回的 `BuildId` 轮询，只有新版本状态为 `SUCCESS` 才成功结束。

GitHub 本地验证仍是发布门禁；CloudBase 侧重复构建是为了消除不可靠的跨云 ZIP 上传，不再尝试复用 runner 本地 `dist/`。

## 官方控制台等价请求

CloudBase 控制台 1.24.0 的公开仓库部署会把 GitHub URL 解析为仓库标识，并提交以下 CloudApp 请求：

```js
{
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
      buildCmd: 'node scripts/verify-deploy-revision.mjs',
      deployCmd: 'tcb hosting deploy ./dist /',
    },
    staticEnv: {
      variables: [{ key: 'EXPECTED_GITHUB_SHA', value: '<github.sha>' }],
    },
  },
}
```

其中 `codeRepo` 不含协议、域名或 `.git`。控制台创建页把文件上传映射为 `ZIP`、模板映射为 `TEMPLATE`，Git 个人仓库和公开仓库均映射为 `GIT`。

控制台只提供 `codeBranch`，没有 commit SHA 字段。部署请求把当前 `github.sha` 写入非敏感构建变量，CloudBase 在发布前运行 `node scripts/verify-deploy-revision.mjs`；该脚本用参数数组读取 `git rev-parse HEAD`、比对 revision，再用参数数组启动 `npm run verify`。分支若在克隆前移动会安全失败，避免发布错误 revision。这里不能把 `$(...)` 或 `&&` 直接写入 CloudBase 的自定义构建命令，因为平台会将其判定为非法字符并拒绝执行。为避免两个远端构建交叠，Actions 的生产并发组必须串行排队，不再取消正在运行且可能已经触发 CloudBase 构建的 job。每次脚本只轮询自己创建后返回的 `BuildId`，不能用“最新版本”代替。

## 脚本与 Workflow 边界

新增 Node ESM 部署脚本，职责包括：

- 校验 `TCB_SECRET_ID`、`TCB_SECRET_KEY`、`TCB_ENV_ID` 均存在；
- 使用 `tencentcloud-sdk-nodejs-tcb@4.1.266` 签名调用 `DescribeCloudAppInfo`，校验 `ServiceName=laptop`、`DeployType=static-hosting`、`AppPath=/`；
- 用固定 GIT payload 调用 `CreateCloudApp`；
- 用返回的 `BuildId` 调用 `DescribeCloudAppVersion`，处理 `PENDING`、`BUILDING`、`SUCCESS`、`FAILED` 和超时；
- 日志只输出应用名、路径、版本名、BuildId 和状态，不输出环境 ID 或凭据。

最初评估的 `@cloudbase/manager-node@5.6.2` 会额外引入本次请求完全不需要的 COS、`request` 和 XML 处理链，生产依赖审计出现 11 项问题，其中 3 项为 critical。最终实现改用更窄的腾讯云官方 TCB SDK，并把其 wildcard common 依赖固定为 `4.1.220`、`uuid` 覆盖到兼容的 `11.1.1`；`npm audit --omit=dev` 为 0 项漏洞。SDK adapter 只开放本次所需的三个 action，并递归把内部 lower-camel payload 转成腾讯云 API 的 PascalCase。

workflow 删除全局 CLI 安装、`tcb login`、ZIP 上传和 `working-directory: dist`。三个 Secrets 只注入受 `master` guard 保护的最后一个 SDK 部署步骤。PR 仍只执行安装与完整验证。

## 测试策略

测试分两层，均不访问网络：

1. Node 单元测试冻结 GIT payload、update-only 校验、调用顺序、BuildId 轮询、失败/未知状态/超时和日志脱敏。
2. YAML 契约测试冻结触发器、权限、分支 guard、串行并发、固定步骤、三个 Secrets 的唯一作用域，并拒绝 CLI 安装、登录、ZIP/COS 上传、删除命令和环境级部署回退。

真实验收在推送后完成：目标 Actions revision 成功、无 annotations、`laptop` 路径仍为 `/`、状态为 `SUCCESS`、版本不再是 `laptop-006`，线上 `index.html` 与该 revision 的本地产物一致，Actions 日志不含三个 Secret 原值。

## 风险控制

- 不调用 `hosting delete`、`app delete` 或版本删除。
- 应用查询或名称/路径校验失败时，不调用 `createApp`。
- `createApp` 不做盲目网络重试，避免一次不确定响应产生多个版本；只有版本状态查询允许继续轮询。
- 未知构建状态 fail closed。
- 脚本超时小于 Actions job timeout，为失败收尾留出余量。
- 腾讯云 SDK 只在真实入口动态导入，单元测试使用假 client、假 service、假时钟和假 logger，不加载凭据或网络。

## 参考

- CloudBase Manager Node CloudApp API：<https://docs.cloudbase.net/api-reference/manager/node/cloudApp>
- CloudBase 应用管理：<https://docs.cloudbase.net/cli-v1/app/management>
- CloudBase Git 仓库部署：<https://docs.cloudbase.net/hosting/quick-start>
- CloudBase GitHub Actions 集成：<https://docs.cloudbase.net/hosting/cli-devops#github-actions>
