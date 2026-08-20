# DSPidle2 1.0.41 Release Agent 交接

> 交接日期：2026-08-14
> 固定运行时源码：`32daa4f9438095308e3e6be7a0055268abe01e66`
> Build ID：`1.0.41+32daa4f94380`
> 分支：`codex/1.0.41-player-experience`
> 制品根目录：`D:\GameDev\DSPidle2-v141-release\1.0.41-32daa4f94380`
> 当前结论：开发侧完成；真实 Linux 发布控制演练、正式原生签名和实体设备验收完成前保持 **No-Go**

## 1. 交接结论

1.0.41 的约定功能、1.0.40 [No-Go 记录](./releases/1.0.40-no-go-2026-08-13.md) 返修和最后一轮玩家交互补充均已进入固定运行时提交。Web/API 归档、Windows unpacked 诊断、Android unsigned APK/AAB、source manifest、条件跳过报告、CycloneDX SBOM、候选清单和 in-toto provenance 已重建并复验。

开发 Agent 没有连接生产服务器，没有使用真实玩家账号、生产数据库或玩家存档做写入测试，没有修改排行榜历史，没有部署 Web/API、切流、更新下载站或覆盖 stable 制品。`1.0.40-58d3e6f986ec` 仍是永久 No-Go；旧 `1.0.41-59f37d18feb9` 候选保留作历史诊断但不得发布。

本交接文档会形成固定运行时之后的文档提交。Release Agent 必须始终以 `32daa4f…` 作为运行代码 SHA，以 `1.0.41+32daa4f94380` 作为 Build ID；不得用后续文档 SHA 重建出另一个同名候选。

## 2. 玩家可见内容

- 云存档保证正文提升到 48 MiB；上传前显示原始、压缩、解压后大小、服务器上限和超出容量。
- 云同步状态中心显示模式/槽位、本地/云 revision、最近成功时间、上传中/等待确认/冲突/失败/恢复，并提供安全重试、取消、双方副本导出和脱敏诊断。
- 普通离线超过 60 秒可选择快速、精确或放弃；快速失败说明原因并可从原检查点重试，精确显示宽区间预计耗时并可安全取消，放弃收益需要双重确认。
- 排行榜分开显示服务器认证成绩与本地 60 秒最佳值，显示普通主槽来源、下一个有效窗口尚差秒数和正确同步入口。
- 传送带端口按缩放和触控设备扩大真实命中区域；桌面 Ctrl/Shift 连续选择、Enter 确认、Esc 取消，移动端工具按钮和输出端长按进入连续模式。
- 批量拉线在确认前完成重复、不兼容、端口占用和累计材料预检；整批只提交一次，任一非法时不创建线路、不扣物资。
- 中文输入法组合态、父级刷新、响应式重挂载、弹窗和横竖屏切换不再无故清空搜索、元数据和表单输入；密码不进入共享草稿。

纯挂机规则没有改成后台高倍率：前台高倍率、后台约五分钟宽限、随后转普通离线。没有增加屏幕常亮或设备权限，没有删除缓存、跳过产量、补物资或放宽守恒来换取速度。

## 3. 存档结构、迁移和模式隔离

| 项目 | 结论 |
| --- | --- |
| GameState / envelope | v46 / v2，不变 |
| cloud schema / SQLite layout | v7 / v2，不变 |
| 模式和槽位 | `normal/speedrun × main/1/2/3` 继续独立 |
| IndexedDB | 本版不新增迁移，不改已有正文和键 |
| checksum/revision | 原上传正文不规范化，不改 checksum、revision 或历史 |
| 旧存档 | 无新增必填字段；继续走既有迁移与回退，不会因 1.0.41 无法读取 |
| 旧客户端 | raw/gzip/legacy 包装继续兼容；32 MiB 以下路径保持原行为 |
| 排行榜 | 只有普通 main 更新银河榜；速通、普通手动槽互不串榜 |

本版没有普通→速通转换入口，也没有放宽 MOD、实验状态或速通规则校验。云上传、下载、删除、冲突恢复和自动保存继续携带模式与槽位，不修改历史 submission 或玩家公开成绩。

## 4. 修改范围

相对 1.0.40 开发交接基线 `46766d7`，固定运行时共改动 154 个文件，约 `+5026/-558`：`.github` 1、Android 1、云传输契约 1、deploy 24、desktop 3、docs 10、包配置/锁文件 2、scripts 4、server 16、src 50、tests 42。完整清单：

```text
git diff --name-status 46766d7..32daa4f9438095308e3e6be7a0055268abe01e66
```

关键模块：

| 分组 | 主要文件 |
| --- | --- |
| 云容量/状态 | `cloud-transfer-contract.json`, `src/game/cloud*.ts`, `src/components/CloudSaveStatusCenter.tsx`, `server/index.mjs`, `server/cloud-quota.mjs`, `server/upload-inspection-scheduler.mjs` |
| 离线/排行榜 | `src/App.tsx`, `src/components/StartMenu.tsx`, `src/components/GalaxyWorkspace.tsx`, `src/game/offlineSettlementStrategy.ts` |
| 拉线 | `src/App.tsx`, `src/game/engine.ts`, `src/game/uiPreferences.ts`, `src/styles.css`, `tests/e2e/v127-selection-batch.spec.ts` |
| 输入 | `src/components/StableTextInput.tsx` 及注册、搜索、星图、生产、物流、移动端调用方 |
| 发布控制 | `deploy/release-switch.mjs`, `api-handoff-proxy.mjs`, `active-api-environment.mjs`, `api-active-entry.sh`, `api-writer-lock.sh`、systemd 模板及状态机测试 |
| 备份/预检 | `deploy/release-backup-evidence.mjs`, `probe-api-readiness.mjs`, `server/cloud-governance.mjs` |
| 跨端 | `desktop/cloud-transport.cjs`, `android/native-version.properties`、Playwright/PWA/版本兼容回归 |

## 5. 1.0.40 No-Go 返修安装要求

新版控制脚本、systemd 模板和 runtime env 必须成套安装，不能只替换 `release-switch.mjs`：

1. 把 release control 文件放入新的不可变目录，以 `current` 软链接引用，并先运行真实软链接启动测试。
2. 安装 `/etc/dsp-idle-cloud/runtime.env`，权限 0640；`DSP_CLOUD_BACKUP_WINDOW` 必须有效，默认启动备份宽限为 900000 ms。
3. 安装 proxy、active、preflight、healthcheck unit，执行 `systemd-analyze verify` 与 `daemon-reload`；配置错误 78、锁占用 75 不得无限重启。
4. release state 目录必须为 `root:<service-group> 2750`，状态文件 0640；active API 可读、不可写。
5. 对生产备份副本生成 evidence；存在非空 WAL/SHM 必须拒绝，禁止手工删除生产 sidecar。
6. 多 GiB 数据库在 ext4 无 reflink 时，提前用有界 I/O 生成并校验独立 preflight 副本，切换时传入 evidence；handoff 窗口不得整库无界复制。
7. 先执行 dry-run，再完成下一节隔离 Linux 故障矩阵，之后才可请求单节点灰度授权。

pending journal 阶段为 `prepared/publishing/published/recovering`。恢复未完成时 proxy 必须保持 hold、journal 必须保留；禁止删 journal 并同时启动 legacy/active 两个 writer。

## 6. 开发门禁结果

| 门禁 | 最终结果 |
| --- | --- |
| clean `npm ci` | 根 456 包、server 75 包安装成功 |
| typecheck | 通过 |
| Vitest | 136 文件通过/6 条件跳过；1208/18；0 失败；135.78 秒 |
| server | 347/2；0 失败；38.16 秒 |
| ops | 最终 55/6；0 失败；6 项为 Linux 专属，未冒充通过 |
| native | 24/24；0 失败 |
| Chromium | 333/9；0 失败；342 总项；925.7 秒 |
| Firefox/WebKit | 2/2；11.9 秒 |
| production preview PWA | 1/1；7.4 秒 |
| production build | 首屏 183,885 B gzip；菜单 270,394 B；禁止首屏模块为空 |
| production audit | 根 0、server 0 |
| licenses | 125 个运行时包 |
| API | 162 文件；临时 SQLite health 200/schema 7/layout 2 |
| Android | bundle/assemble/lintVital；1.0.41/1000041；unsigned |
| Windows | unpacked、PE/ASAR/传输契约、隔离 profile 10 秒 4 进程；`NotSigned` |

完整开发依赖图仍报告 5 项构建工具链提示（1 moderate/4 high），生产依赖审计为 0；禁止在固定候选上直接执行 `npm audit fix` 造成锁文件漂移。

Chromium 9 条跳过逐项来自：2 条 construction 真实存档、2 条 P6 真实终局/基准、1 条真实画布、2 条真实离线/时间扭曲 describe、1 条真实 30 天纯挂机和 1 条开发服务器模式 PWA。所有真实夹具环境变量为空，本轮没有读取玩家存档；PWA 已在 production preview 单独通过。

ops 首轮有 1 条 Windows 临时目录原子 rename `EPERM`；实现原有有界重试未被修改。失败用例随后连续 5/5，通过后完整 ops 重跑为 55/6。原生构建发现 Android/Windows 并行写 `dist` 后，未采用该轮 Windows 输出；最终按 Android→Windows→通用 Web 顺序重建并封存。

## 7. 不可变制品与 SHA-256

制品目录：`D:\GameDev\DSPidle2-v141-release\1.0.41-32daa4f94380`

| 制品 | 字节 | SHA-256 |
| --- | ---: | --- |
| source tar | 6,091,595 | `297355374725445841441e350b15556f3524b39a9b17b7f8528ee3431c98a090` |
| Web tar | 1,450,446 | `19c827706750a5704d0f14db474858231c66330167c1300e032d7a3bc7a9c56e` |
| API expanded tar | 616,638 | `63704164d79c8b2135266ed2f0c169abf1ae690cf39bf2645ed729d664d95bde` |
| Windows unpacked diagnostic unsigned | 154,654,977 | `dc1187f0df675e104437fea475bb05dd4ac383d30f53a2a89399df6ce03dfbeb` |
| Android unsigned APK | 4,825,002 | `a9702fc02abbad8af668cc62190196275fee6f3942d83dcdfda93eff0839d470` |
| Android unsigned AAB | 4,639,778 | `2b1dd1b64960e36f90f94972a7c8273b976b56b40388ce7c561050a39f909258` |
| source manifest | 36,218 | `ddbaf82b66bec87e11134b3f752f6635f1655b7fdcaaf51b888c2f9ea22d4e7e` |
| conditional skips | 3,438 | `58d78d6a5e19cd5b237534594a0d30e1083ef17f96465caf49eb557f2e9664a7` |
| SBOM | 407,391 | `b05608ef16ad985e2bb639b9be4f5bb16023b1f722b87e841509af386b993b8c` |
| source verification | 176 | `3f76334d46f9c92783054229da700755eb8a660ca5e8a0aad4b761522ea8947e` |
| candidate manifest | 2,057 | `6211588fa38c7a8aeb1040c723c9d4367ced2ed0d408c9265ae5cab1c68731af` |
| provenance | 2,305 | `60a714c9cf8d236e49d87f801611d7ad942bdc4e1bd4e87b8e83678bd6da9fd9` |

source manifest 为 214/214，聚合 SHA-256 `4e3d4c6b1f48391060fe7f084c3c4947230eb84a26b5c0cd42e08825da6529b3`。candidate manifest 的 10 个 subject 已逐项复算大小/哈希，4 个 tar.gz 已完整读取；provenance 的 3 个 subject已复验。`version.json.generatedAt` 随构建变化，因此 provenance 标记 `reproducible:false`。

Android APK/AAB 明确无签名：APK `apksigner` 返回 `DOES NOT VERIFY`，AAB 签名 entry 为 0。Windows PE FileVersion `1.0.41`、ProductVersion `1.0.41.0`、Build ID 与 48 MiB 传输契约通过，Authenticode 为 `NotSigned`。这些都不是 stable 制品。

## 8. 性能影响

- 最终 Web 首屏 gzip 183,885 B，低于 200 KiB 预算；禁止的 game-core 等模块未进入首屏。
- 48 MiB 保证正文会增加网络、临时内存和 SQLite 占用；服务端仍按请求数与解压字节双重限流，单次 64 MiB 解压硬上限、96 MiB 并发预算不变。
- 批量拉线最多 100 条只发布一次领域状态，避免逐条全量重渲染；预览和草稿均是临时 UI 状态，不写入存档。
- 精确离线预计耗时只是展示层宽区间估计，不改变 Worker deadline、结算检查点、模拟结果或倍率。
- 本轮没有以降低模拟频率、删除缓存、丢弃产量或放宽守恒换取性能。

## 9. Release Agent 尚需完成的硬门禁

### 隔离 Linux

- 真实 systemd/Nginx、服务 UID/GID、Bash flock、正常切换与幂等重复；
- current 软链接启动、Nginx test/reload 失败、preflight timeout、锁权限/占用；
- new active start 失败、systemctl 先副作用后报错、旧 1.0.39 `/ready` 404 回退；
- prepared/publishing/published/recovering 各阶段重启恢复；
- ext4 无 reflink、3.2 GiB 合成库、预置副本、并发写/WAL；
- 连续探针和 Nginx 日志 502/503/504 为 0，且任何时刻最多一个 writer。

CI 中使用 `DSP_REQUIRE_LINUX_RELEASE_GATE=1`，让 6 条 Linux 条件跳过直接失败。任一失败继续 No-Go。

### 原生与真实设备

- Android 使用现有批准长期证书重建，验证 v2/v3、证书连续性和 1.0.38→1.0.41 覆盖升级；禁止创建新证书。
- Windows 按现行策略以正式 HTTPS API/更新地址构建 setup/feed，记录 Authenticode/SmartScreen，完成低配和覆盖升级。
- Android 真机、手机 Web、低配 Windows、80%～200% 字号、小窗口、横竖屏、中文/英文输入法。
- 23～48 MiB 上传/下载/重启/历史恢复；浏览器关闭在上传前、上传中、服务器已提交但客户端未收到三个时点。
- 一小时及更久离线、一小时纯挂机、后台超过五分钟、多标签页、多设备、网络中断和重复点击。

不得用生产账号或玩家存档做写测试；大存档使用确定性合成档，或玩家明确授权的只读副本。

## 10. Go/No-Go 与回滚

以下任一情况立即 No-Go：Linux 实例门禁未完成、双 writer、journal/current/proxy 不一致、502/503/504、备份窗口缺失、活跃 WAL/SHM、preflight 无界复制、正文/checksum/revision 改写、模式串档、离线收益重复或消失、物资不守恒、Android 证书不连续。

- 未切流：废弃候选即可，生产与 stable 不变。
- 已单节点灰度：用 release switch 把 Web/API 指针切回验证过的上一不可变版本；只回滚代码，不恢复生产数据库。
- pending 存在：先按 journal 完成恢复并证明仅一个 writer，再决定代码回滚；禁止删 journal 绕过。
- Android/Windows：继续保留现行 stable feed，不发布本交接的 unsigned/NotSigned 诊断制品。
- 不删除缓存，不覆盖玩家本地/云存档，不修改排行榜历史，不补物资，不跳过离线区间。

只有 Linux、签名、实体设备、备份副本和用户发布授权全部满足后，Release Agent 才能创建正式 `docs/releases/1.0.41.md`。本文不是生产发布记录。
