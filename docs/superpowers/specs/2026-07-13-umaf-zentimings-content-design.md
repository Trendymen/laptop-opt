# UMAF 与 ZenTimings 工具职责文案设计

## 目标

修正页面把 ZenTimings、UMAF 仅写成“当前结果 / 回退入口”的失真表达，让接手者明确知道：哪个工具用于读取当前实际参数，哪个工具用于修改固件参数，以及约 80MB UMAF 启动分区为何必须保留。

## 上游事实

ZenTimings 官方说明将它定义为 Ryzen 平台的内存时序监控工具，可显示当前应用的主要内存时序、部分内存相关电压，以及 FCLK、MCLK、UCLK；其时序界面目前是只读的，不能在 Windows 中即时修改 Ryzen 时序。它可以用于保存当前设置截图，但不是内存稳定性压力测试工具。

来源：

- https://zentimings.com/
- https://github.com/irusanov/ZenTimings

Smokeless UMAF 上游说明显示，它通过自定义 UEFI Form Browser 暴露 AMD PBS、AMD CBS 以及部分 AMD Overclocking 菜单，让用户在不刷写 BIOS 的情况下访问和修改真实固件设置。上游明确警告错误修改可能导致设备无法启动，部分危险设置甚至可能需要重新刷写恢复。

来源：

- https://github.com/DavidS95/Smokeless_UMAF

UXTU 上游全名为 Universal x86 Tuning Utility，是面向 x86 笔记本和电脑的处理器 / GPU 调校工具；上游同时警告误用可能导致系统不稳定或异常。本机记录的 AMD Curve Optimizer 全核负压 `-20` 正是通过该工具应用。

来源：

- https://github.com/JamesCJ60/Universal-x86-Tuning-Utility

“本机约 80MB UMAF 分区”是本项目已经记录的本机安装事实，不冒充上游的通用安装要求。页面把它准确写成当前机器的 UMAF 启动入口；不可删除或格式化是这台机器的接手约束。

## 02 已经安装的软件

把现有四张软件卡拆成七张，各自只承担一个清晰职责：

1. MCHOSE HUB：鼠标驱动。
2. MSI Afterburner：游戏内监控。
3. HWiNFO：传感器监控。
4. UXTU（Universal x86 Tuning Utility）：Windows 下的处理器 / GPU 调校工具；本机用它应用 AMD Curve Optimizer 全核负压 `-20`，并保留开机自启、自动应用配置的恢复提示。
5. ZenTimings：只读核对当前实际生效的内存频率、时序、FCLK/MCLK/UCLK 与平台可读取的相关电压；用于重启后确认参数和保留截图，明确说明不能用它修改时序，也不能替代稳定性测试。
6. AIDA64 · TM5：压力测试和结果判断，先询问 AI 再使用。
7. UMAF：高风险固件设置入口；用于进入 AMD PBS/CBS/Overclocking 隐藏菜单，修改包括内存频率和时序在内的真实固件参数。卡片内高亮显示“本机约 80MB 的 UMAF 启动分区不可删除或格式化”，并说明错误设置可能导致无法启动。

UMAF 分区警告只在 02 软件部分出现，不回到 Hero，也不继续留在页尾附录。

## 页尾内存附录

移除以下等号式标题：

- `ZenTimings = 当前 Windows 实际运行结果`
- `UMAF = 已记录字段的局部参数入口和回退对照`

替换为职责清晰的内容：

- ZenTimings 区块标题说明它用于“核对当前实际生效的内存参数”；正文解释截图用来确认 5600 MT/s、时序和控制器相关参数是否在重启后生效，并再次标明它是读取/记录工具，不是修改或压测工具。
- UMAF 区块标题说明它是“修改这些固件参数的位置，也是按记录值回退的入口”；正文解释两张截图记录 DDR SPD Timing 与 DDR Non-SPD Timing 中已经改过的字段，只按截图恢复，不猜测未记录参数。

保留三张内存相关截图、原图质量和常显布局，不新增折叠或交互。

## 03 负压截图

03 标题改为“当前关键设置、截图与教程”。在开头新增“已完成前置设置”摘要，明确写出：

`CCD1 已关闭 · BIOS 已解锁 · UMAF 已安装`

`CPU 睿频已关闭 · 高性能电源计划已调出`

正文说明这是当前机器已经完成的前置状态，不要求接手者重复操作。

原 04 的两条 B 站教程整体移动到 03：教程 01 紧邻 CCD1 / BIOS / UMAF 状态，教程 02 紧邻 CPU 睿频 / 高性能电源计划状态。教程用于需要重新安装、重新进入或回看操作步骤时查阅，不表示现在需要重复执行。

04 标题收窄为“异常恢复”，只保留 UXTU 无法启动的恢复步骤和截图。

负压截图标题必须同时给出工具简称、工具全名和当前参数：

`UXTU（Universal x86 Tuning Utility）· AMD Curve Optimizer · All Core Offset -20`

正文说明这是本机当前通过 UXTU 应用的全核负压记录；出现蓝屏、重启、游戏或应用崩溃时优先恢复默认并重新验证。

## 测试与验收

内容测试必须验证：

- 02 软件区同时包含独立的 UXTU、ZenTimings、AIDA64 · TM5 和 UMAF 卡片；
- UXTU 在 02 和 03 都展开为 `Universal x86 Tuning Utility`，03 标题同时包含 `All Core Offset -20`；
- 03 在所有设置截图之前包含 `CCD1 已关闭 · BIOS 已解锁 · UMAF 已安装` 和 `CPU 睿频已关闭 · 高性能电源计划已调出`；
- 两条 B 站教程都位于 03，04 不再包含教程；
- ZenTimings 文案包含“只读”“当前实际生效”“不能修改时序”“不能替代稳定性测试”的语义；
- UMAF 文案包含 AMD PBS/CBS/Overclocking、真实固件参数、约 80MB 分区不可删除或格式化，以及错误设置可能无法启动；
- 约 80MB 警告只出现在 02 软件区一次；
- 页尾附录不存在两个旧等号标题，但仍包含三张内存截图与局部回退边界；
- 构建、HTML validator、PC 2x 和移动端 3x 截图全部通过。
