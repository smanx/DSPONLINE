# DSPidle2 1.0.42 Release Agent 交接

> 交接日期：2026-08-14
> 固定运行时源码：`8056d2cb0e1b46757676b490c08f28a1e66fd0a6`
> Build ID：`1.0.42+8056d2cb0e1b`
> 分支：`codex/1.0.42-ui-review`
> 候选目录：`D:\GameDev\DSPidle2-v142-release\1.0.42-8056d2cb0e1b`
> 当前结论：开发侧工作完成；正式签名、真实设备、Linux 发布控制和生产灰度完成前保持 **No-Go**

## 1. 交接结论

1.0.42 的代码、对应回归、完整发布门禁、固定运行时提交、Web/API/source 归档、Windows unpacked 诊断、Android unsigned APK/AAB、source manifest、条件跳过报告、CycloneDX SBOM、候选清单和 in-toto provenance 均已完成并复验。

开发 Agent 没有连接生产服务器，没有使用真实玩家账号、生产数据库或玩家存档做读写测试，没有修改排行榜历史，没有部署 Web/API、切流、更新下载站或覆盖 stable 制品。`D:\GameDev\DSPidle2-v141` 在本任务期间保持 `93b984ebf7f765216f0a21f015bae03df5bc27b3`，1.0.41 发布 Agent 的工作树与候选制品均未被修改。

本交接文档位于固定运行时之后的文档提交。Release Agent 必须以 `8056d2cb…` 作为运行代码 SHA，以 `1.0.42+8056d2cb0e1b` 作为 Build ID；不得用后续文档 SHA 重建同名运行时。若 1.0.41 发布 Agent 之后新增生产记录，只能在不改变运行时树的前提下补合文档；一旦运行时代码产生差异，必须新建 SHA/Build ID 并重跑门禁。

## 2. 玩家可见变化

- 桌面和手机全屏工作区跟随真实顶栏、底部导航与施工托盘高度，80%～200% 字号下不再用固定偏移挤压内容。
- 手机命令面板跳到工作区、物资抽屉、检查器或实体时一次完成，不再因关闭面板触发第二次返回而退出目标页面。
- 工作区打开后，被覆盖工厂画布从键盘和无障碍树中失活；Tab 保持在可见工作区/壳层导航，嵌套确认框和物品悬浮 Portal 仍可操作，关闭后恢复触发点焦点。
- 统计行使用独立“展开趋势”操作，不再嵌套按钮；亮暗主题状态文字与物品字形前景色提升可读性。
- 时间范围、资料库分类、蓝图操作、戴森横屏、更新公告、科技树和制造中心在窄屏/高字号下重排或滚动；移动主要操作至少 44×44px。
- 蓝图、统计书签/规划、账号资料、搜索等普通文字输入保护中文组合态和页面内草稿；密码不共享、不持久化、不进入日志。
- 教程显示真实 1.0.42 应用版本，教程进度由独立内容 revision 管理，应用升级本身不再重置教程。

本版没有改变离线结算、纯挂机规则、时间扭曲倍率、资源采集、传送带吞吐、物资守恒、速通、公平性校验或排行榜提交。不会导致离线收益消失，也没有通过删除缓存、跳过产量或增加物资掩盖性能问题。

## 3. 存档与服务兼容

| 项目 | 结论 |
| --- | --- |
| GameState / envelope | v46 / v2，不变 |
| cloud schema / SQLite layout | v7 / v2，不变 |
| normal/speedrun 槽位 | `main/1/2/3` 继续独立，键与校验不变 |
| checksum/revision/history | 不改正文、checksum、revision、历史或 submission |
| 旧存档 | 无新增必填字段、无需存档迁移；继续使用既有 v46 兼容路径 |
| 教程进度 | 当前键缺失时只复制合法旧键，重复执行不覆盖当前进度；旧键保留 |
| 输入草稿 | 仅页面内存；刷新/主动关闭页面不恢复，密码永不进入共享草稿 |
| API | 无 1.0.42 服务逻辑变更；展开包仍通过 schema 7/layout 2 临时数据库启动 |

导入、导出、本地保存、云同步、快照、自动保存、删除、恢复和排行榜逻辑没有变化。普通/速通存档不会因本版 UI 调整串档。

## 4. 修改文件与架构入口

固定运行时相对 `93b984e…` 为 89 文件、`+1874/-372`。完整列表使用：

```text
git diff --name-status 93b984ebf7f765216f0a21f015bae03df5bc27b3..8056d2cb0e1b46757676b490c08f28a1e66fd0a6
```

关键入口：

| 范围 | 文件 |
| --- | --- |
| 动态壳层/全局接线 | `src/App.tsx`, `src/styles.css`, `src/styles/codex.css`, `src/styles/mobile-workspaces.css` |
| 模态与焦点 | `src/components/AccessibleDialog.tsx`, `src/components/WorkspaceFrame.tsx`, `src/components/GamePanels.tsx` |
| 手机导航 | `src/hooks/useMobileNavigation.ts`, `src/components/mobile/MobileGameShell.tsx`, `src/components/mobile/MobileWorkspaceHub.tsx` |
| 稳定输入 | `src/components/StableTextInput.tsx` 与各工作区调用方 |
| 教程/版本/发布说明 | `src/game/tutorialProgress.ts`, `src/components/TutorialWorkspace.tsx`, `src/i18n/releaseNotes.ts`, `package*.json`, `android/native-version.properties` |
| 统计/对比度/科技树 | `src/components/StatisticsWorkspace.tsx`, `src/components/ItemReference.tsx`, `src/game/technologyTreeLayout.ts`, `src/theme.css` |
| 主要新回归 | `tests/e2e/v142-ui-review.spec.ts`, `tests/e2e/mobile-shell.spec.ts`, `src/components/WorkspaceFrame.test.tsx`, `src/components/StableTextInput.test.tsx`, `src/game/tutorialProgress.test.ts` |

## 5. 开发门禁证据

| 门禁 | 结果 |
| --- | --- |
| clean install | root 456、server 75 包 |
| typecheck | 通过 |
| Vitest | 139 文件通过/6 跳过；1222/18；0 失败；117.64 秒 |
| server | 347/2；0 失败；约 36.5 秒 |
| ops | 55/6；0 失败；6 项是 Linux 专属 |
| native | 24/24；0 失败 |
| Chromium | 344/9；0 失败；353 总项；985.9 秒 |
| Firefox/WebKit | 2/2；0 失败；11.3 秒 |
| production preview PWA | 1/1；0 失败；7.0 秒 |
| build | 通用候选首屏 184,570 B gzip；菜单 273,830 B；禁止模块为空 |
| production audit | root 0、server 0；licenses 125 |
| API | 162 文件；临时 SQLite health 200/schema 7/layout 2 |
| Android | bundle/assemble/lintVital/zipalign；1.0.42/1000042；unsigned |
| Windows | PE 1.0.42/1.0.42.0、ASAR Build ID、48 MiB 合同、隔离启动 4 进程；`NotSigned` |

Chromium 实际跳过 9 项，原因和新增专项清单见 [候选记录](./releases/1.0.42-candidate.md)。所有可写服务测试继续使用合成账号与临时 SQLite。首次诊断运行发现的问题在固定提交前修复，最终完整套件从头重跑为 0 失败；没有删除测试或放宽断言来获得绿灯。

## 6. 不可变制品与 SHA-256

制品目录：`D:\GameDev\DSPidle2-v142-release\1.0.42-8056d2cb0e1b`

| 制品 | 字节 | SHA-256 |
| --- | ---: | --- |
| source tar | 6,114,303 | `787c95469ecf11c5152ecb067c2da67e3f993b2a99e20c641288e3fb58b0b7a4` |
| Web tar | 1,455,767 | `4a02181719a2b494442a6709c608d7f43a5d6036c0cbcbc59c5b39192f18ef18` |
| API expanded tar | 616,305 | `bf647d94523bbc62a49e09f97dfc418697f58885c3de93f2b424dd1f7da18c98` |
| Windows unpacked diagnostic unsigned | 154,655,950 | `16d198708fa7100800c0048a7ac702ab9bdc96f1d10be078f2e61aac964c6877` |
| Android unsigned APK | 4,830,240 | `f67bb5c51de691f71c66ca4ef183b5cf595ac52a1c5511379018c517f2535d59` |
| Android unsigned AAB | 4,644,965 | `15e8d41d8160756eafcdbd76d3f8e8caf3d6622489db9c944fb58a5f07153868` |
| source manifest | 36,061 | `0b02e9e842e1bdeed88762193b7bed9a924f65b7845f4fb1187268110b573394` |
| conditional skips | 3,438 | `6f95f649807e4b8ac23387f6adcb56983a35731797f69e10f8849d5835d1aa0b` |
| SBOM | 407,391 | `8dafd0e3343f6e128a86c7c33dc7279d2339009304b2044bb5debf6adb105727` |
| source verification | 176 | `74662eb523c7d82ded2eadeef8ae5dfc37e4947b9fa2f321b4cea836d98357bf` |
| candidate manifest | 1,997 | `507e97c943c656618ebc7545faa74b60b365c1d960704fe15511d36dc8baf0f6` |
| provenance | 2,385 | `a52897b1cb4dcfcfd807b26340373672e1f4eaf2347d08e2f2156bdb92f4745d` |

source manifest 213/213，aggregate `292a5ec74bb446f8ed71d157697c24723a9e04f5c2427666c61c1d7423281660`；candidate 10/10；provenance 3/3；四个 tar.gz 均完整读取。构建时间写入 `version.json.generatedAt`，所以 provenance 正确标记 `reproducible:false`。

## 7. Web/API/Android/Windows 发布矩阵

| 目标 | 开发候选 | Release Agent 必做 |
| --- | --- | --- |
| Web/PWA | 通用 Web tar、1.0.42 version/Build ID 已验 | 从固定 SHA 重建或逐字节使用候选；验证 manifest/HTML/SW 原子切换、CDN 缓存、previous-stable 与离线重开 |
| API | 与 1.0.41 代码相同，展开包临时启动通过 | 若随版本切 API，仍执行真实 Linux 单 writer、systemd/Nginx、备份和回滚门禁；不得仅因“无 API diff”跳过发布安全 |
| Android | unsigned APK/AAB、1.0.42/1000042、zipalign 通过 | 使用批准的既有长期证书和正式 HTTPS 配置重建；验证 v2/v3、证书连续性、1.0.41→1.0.42 覆盖升级与真机 |
| Windows | unpacked 诊断、版本/Build ID/合同/隔离启动通过 | 按现行策略注入正式 HTTPS 地址，生成正式 setup/feed；记录 Authenticode/SmartScreen、低配与覆盖升级结果 |

当前 Android/Windows 诊断件不能直接发布，也不能因哈希已记录而跳过正式重建后的新哈希、manifest 和签名校验。正式原生制品必须使用新的 1.0.42 文件名和清单，不得覆盖或复用 1.0.41/既有 stable 文件。

## 8. Release Agent 剩余硬门禁

### 合并与来源

1. 确认 1.0.41 最终生产记录与 `8056d2cb…` 的运行时父级一致；只合并发布记录等文档变化。
2. 若主线运行时代码已不同，不得强行沿用 Build ID；新建 SHA/Build ID 并重跑全部门禁。
3. 复算候选清单、source manifest、SBOM 和 provenance；正式签名后为原生制品生成新的哈希与不可变清单。

### UI 与真实设备

- Windows Chrome/Edge、Android Chrome、iOS Safari、微信/QQ 内置浏览器、鸿蒙浏览器；经典/新版手机 UI。
- 320×568、360×480、390×844、844×390、768×1024、960×540、1440×900、1920×1080；80/100/125/150/200% 字号与系统缩放。
- 中文/英文输入法，composition、键盘弹出/关闭、横竖屏、全屏、弹窗、路由切换、浏览器/物理返回键。
- 键盘 Tab/Shift+Tab/Escape/Enter、屏幕阅读器、工作区嵌套确认框、物品 Portal、移动 44px 触控目标。
- 从 1.0.41 本地档/云档进入 1.0.42，普通/速通各槽位、自动保存、冲突、导入导出、离线/纯挂机做不变性 smoke。

### 生产发布控制

- 延续 1.0.41 的真实 Linux systemd/Nginx、服务 UID/GID、Bash flock、pending journal、备份证据、单 writer 和故障恢复矩阵。
- Web/API 必须先部署到新的不可变目录；验证健康、readiness、版本、静态完整性、PWA cache 隔离后再原子切换。
- 全过程不得使用玩家账号/存档写测试，不得修改排行榜历史；采用合成账号和临时/授权隔离副本。

## 9. 性能影响

- 候选首屏相对 1.0.41 增加 685 B gzip（约 0.37%），仍低于 200 KiB；菜单增加约 1.27%。
- 新增 DOM 测量和焦点边界只在壳层 resize 或模态生命周期运行，不进入 60 Hz 模拟路径。
- 页面草稿仅保留活动文字，关闭页面释放；不改变存档大小、云上传内存或 Worker 复制。
- 本版没有调整结算引擎，因此不能把 UI 版本宣传为离线/纯挂机性能升级。

## 10. Go/No-Go、风险与回滚

以下任一情况立即 No-Go：版本/Build ID 不一致；工作区遮挡或焦点逃逸；命令面板跳转后被返回动作撤销；中文组合文本消失；移动主要目标小于 44px；普通/速通串档；存档正文/checksum/revision 改写；正式原生签名或证书连续性失败；PWA 新旧资源混用；Linux 双 writer 或切换恢复失败。

- 未切流：废弃候选即可；1.0.41 与当前 stable 不变。
- 已灰度：只把 Web/API 指针切回验证过的上一不可变版本；不恢复生产数据库，不删除云历史，不覆盖玩家存档，不修改排行榜记录。
- PWA：完整回滚 HTML、manifest、资源和 service worker，并验证离线重开；禁止单文件覆盖。
- 原生：保持上一 stable feed；禁止卸载玩家应用、清除数据或创建新证书规避连续性问题。
- 教程迁移无需数据回滚；旧进度键从未删除。输入草稿不持久化。

在所有硬门禁通过并获得明确生产授权前，不部署、不更新下载页、不覆盖 stable 制品。
