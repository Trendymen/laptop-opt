# PC 2x / 移动端 3x 脚本化截图设计

## 目标

用一条可重复执行的命令生成两张正式全页截图，替代依赖人工调整浏览器和手工截图的流程：

- PC：CSS 视口 `1440 × 900`，DPR `2`，输出宽度 `2880px`。
- 移动端：CSS 视口 `390 × 844`，DPR `3`，输出宽度 `1170px`。

正式产物固定为：

- `output/playwright/pc-1440-2x.png`
- `output/playwright/mobile-390-3x.png`

不再保留其他倍率的旧正式截图，也不保留本轮人工生成的 1x 临时截图。

## 实现方式

新增 Node ESM 脚本 `scripts/capture.mjs`，通过 Playwright Node API 完成完整生命周期：

1. 调用现有 `buildPage()` 构建 `dist/index.html`，继续复用图片转换缓存。
2. 在 `127.0.0.1` 随机空闲端口启动只服务当前 HTML 的临时 HTTP 服务，避免依赖外部 `npm run serve` 或占用固定 4173 端口。
3. 启动 Chromium，为 PC 和移动端分别创建独立 BrowserContext，并设置各自的 viewport 与 `deviceScaleFactor`。
4. 打开 `/?capture=1`，等待 `document.fonts.ready` 和 10 张图片全部加载完成。
5. 检查没有横向溢出、内部纵向滚动容器、浏览器错误、资源加载失败，再生成 `fullPage` PNG。
6. 使用 `finally` 关闭 context、browser 和 HTTP 服务；任一步失败时退出码非零。

项目新增 `npm run capture` 作为正式入口。

## 测试与验收

普通 `npm test` 增加快速配置测试，锁定两个截图 profile 的文件名、CSS 视口、DPR 和预期像素宽度，不在每次单元测试中启动浏览器。

新增 `npm run capture:verify`：真实执行截图脚本，再用 Sharp 读取 PNG metadata，确认：

- 两张文件均为 PNG；
- 宽度分别为 `2880px` 与 `1170px`；
- 高度大于各自首屏物理高度，证明产物为全页截图；
- 页面运行时检查全部通过。

最终人工查看两张正式产物，确认桌面 3 列和移动端 1 列首屏、章节顺序、截图清晰度与末尾常显附录均无视觉回归。

## 非目标

- 不把 Playwright 浏览器截图加入普通 `npm test`，避免重新把快速测试拖慢到十秒级。
- 不引入可配置的任意视口矩阵；本轮只维护用户确认的 PC 2x 和移动端 3x 两个 profile。
- 不改变页面正文、图片转换质量或原有 `npm run serve` 的人工预览用途。
