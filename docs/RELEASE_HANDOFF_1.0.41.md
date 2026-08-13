# DSPidle2 1.0.41 Release Agent 交接

> 交接日期：2026-08-14
> 固定运行时源码：`59f37d18feb90b38822ebfd83b76baa19215ccce`
> Build ID：`1.0.41+59f37d18feb9`
> 分支：`codex/1.0.41-player-experience`
> 制品根目录：`D:\GameDev\DSPidle2-v141-release\1.0.41-59f37d18feb9`
> 当前结论：开发侧完成；真实 Linux 发布控制演练未通过前保持 **No-Go**

## 1. 交接结论

1.0.41 的全部约定功能和 [1.0.40 No-Go](./releases/1.0.40-no-go-2026-08-13.md) 返修已经进入固定运行时提交。完整开发自动化、Web/API 归档、Windows unpacked 诊断、Android unsigned APK/AAB、source manifest、SBOM 和 provenance 已完成并复验。

开发 Agent 没有连接生产服务器，没有读取或写入生产数据库、真实玩家账号或玩家存档，没有修改排行榜历史，没有部署 Web/API、切流、更新下载站或覆盖 stable 制品。1.0.40 No-Go 记录确认的 `1.0.40-58d3e6f986ec` 永久禁止发布；中间 1.0.41 提交 `96b7adb…` 也不得用于构建。

本交接文档位于固定运行时提交之后，任何运行制品必须继续绑定 `59f37d18…`，不能把后续文档 SHA 当成 Build ID。

## 2. 玩家可见内容

- 48 MiB 保证云正文；上传前能看到原始/压缩/解压后大小、服务器上限和超出容量。
- 云同步状态中心显示模式/槽位、本地/云 revision、最近成功时间、进行中/冲突/失败/恢复状态，并提供重试、取消、导出双方副本和脱敏诊断。
- 普通离线超过 60 秒可以选择快速、精确或放弃；快速失败显示原因并能再次重试，精确可取消，放弃双重确认。
- 排行榜显示服务器认证成绩、本地最佳、当前普通主槽和下一个有效 60 秒窗口还差多少。
- 传送带端口真实命中范围可自动适配；桌面 Ctrl/Enter/Esc 和手机按钮支持连续选择、一次确认的原子批量连接。
- 中文输入法组合态、移动键盘、横竖屏和父级刷新不再无故清空注册、档案、搜索和目录输入。

纯挂机规则没有改成后台高倍率：前台高倍率、后台约五分钟宽限、随后普通离线。没有增加屏幕常亮或设备权限，也没有删除缓存、跳过产量或补物资。

## 3. 存档、云和旧客户端兼容

| 项目 | 结论 |
| --- | --- |
| GameState / envelope | v46 / v2，不变 |
| cloud schema / SQLite layout | v7 / v2，不变 |
| 普通/速通 | `normal/speedrun × main/1/2/3` 继续独立 |
| 旧存档迁移 | 无新增迁移；旧正文按原字节读取 |
| checksum/revision | 上传和下载不规范化正文，不改 checksum、revision 或历史 |
| 旧客户端 | 现有 raw/gzip/legacy 包装继续接受；32 MiB 以下行为保持兼容 |
| 大存档 | 48 MiB 保证；64 MiB 解压硬上限，超过时明确拒绝且旧云 revision 不变 |
| 分块上传 | 本版未启用，不得宣传为已上线 |

### 修改文件列表与模块边界

相对 1.0.40 开发交接基线 `46766d7`，固定运行时共改动 133 个文件，约 `+4090/-469`：`.github` 1、Android 1、云契约 1、deploy 24、desktop 3、锁文件/包配置 2、scripts 4、server 16、src 39、tests 42。完整列表使用：

```text
git diff --name-status 46766d7..59f37d18feb90b38822ebfd83b76baa19215ccce
```

关键文件分组：

| 分组 | 主要文件 |
| --- | --- |
| 云容量/状态 | `cloud-transfer-contract.json`, `src/game/cloud*.ts`, `src/components/CloudSaveStatusCenter.tsx`, `server/index.mjs`, `server/cloud-quota.mjs`, `server/upload-inspection-scheduler.mjs` |
| 离线/排行榜 | `src/App.tsx`, `src/components/StartMenu.tsx`, `src/components/GalaxyWorkspace.tsx`, `src/game/offlineSettlementStrategy.ts` |
| 拉线 | `src/game/engine.ts`, `src/game/uiPreferences.ts`, `src/styles.css`, `src/game/batchBeltConnection.test.ts` |
| 输入 | `src/components/StableTextInput.tsx`, `CompositionSafeInput.tsx`, `CatalogPicker.tsx` 及组件测试 |
| 发布控制 | `deploy/release-switch.mjs`, `api-handoff-proxy.mjs`, `active-api-environment.mjs`, `api-active-entry.sh`, `api-writer-lock.sh`, systemd 模板和 Linux/软链接/状态机测试 |
| 备份/预检 | `deploy/release-backup-evidence.mjs`, `probe-api-readiness.mjs`, `server/cloud-governance.mjs` |
| 跨端 | `desktop/cloud-transport.cjs`, `android/native-version.properties`, Playwright 版本兼容回归 |

## 4. No-Go 返修与安装顺序

必须一起安装新版控制脚本、systemd 模板和 runtime env，不能只替换 `release-switch.mjs`：

1. 复制 release control 文件到新的不可变目录，并以 `current` 软链接引用；先运行真实软链接启动测试。
2. 把 `dsp-idle-runtime.env.example` 的节点值安装到 `/etc/dsp-idle-cloud/runtime.env`，权限 0640。`DSP_CLOUD_BACKUP_WINDOW` 必须有效，默认启动宽限 900000 ms。
3. 安装 proxy、active、preflight、healthcheck unit，执行 `systemd-analyze verify` 和 `daemon-reload`；配置错误 78、锁占用 75 不得进入无限重启。
4. release switch 会创建 `/var/lib/dsp-idle-cloud/release-state` 为 `root:<service-group> 2750`，状态文件 `0640`；确认服务用户可读、不可写。
5. 对生产 Backup API 快照创建 evidence。存在非空 `-wal/-shm` 时必须拒绝，不能手工删除生产 sidecar。
6. 香港级多 GiB 快照若 ext4 无 reflink，提前运行有界 `--prepare-preflight` 生成独立副本与 evidence；切换时传 `--preflight-evidence`。禁止 handoff 窗口内整库无限速复制。
7. 先 `--dry-run`，再完成下节真实 Linux 故障矩阵，之后才允许请求用户单节点灰度授权。

pending journal 阶段为 `prepared/publishing/published/recovering`。只要恢复未完成，proxy 必须保持 hold、日志必须保留。禁止手动删除 pending 日志并同时启动 legacy/active 两个 writer。

## 5. 真实 Linux 硬门禁（尚未执行）

开发机为 Windows，且没有 WSL 发行版或 Docker。以下必须由 Release Agent 在隔离 Linux、真实 systemd/Nginx、真实服务 UID/GID、临时 SQLite 上执行；任一失败则继续 No-Go：

- 正常切换和幂等重复执行；
- proxy 经 `current` 软链接启动；
- Nginx test/reload 失败；
- preflight health/ready 超时；
- writer lock 目录/文件权限错误和锁已占用；
- new active start 失败及 systemctl 先产生副作用后报错；
- 旧 1.0.39 无 `/api/ready` 的立即 health 回退；
- prepared/publishing/published/recovering 各阶段进程重启；
- ext4 无 reflink、3.2 GiB 合成库、有界预置副本、并发写与 WAL 增长；
- 连续探针和新 Nginx 日志中 502/503/504 为 0，且任意时刻最多一个 writer。

CI 中 `DSP_REQUIRE_LINUX_RELEASE_GATE=1` 会把 Linux 条件跳过变成失败。实例级 Nginx/systemd 故障演练仍需 Release Agent 执行，不能只引用 Node FakeRuntime 结果。

## 6. 开发门禁结果

| 门禁 | 最终结果 |
| --- | --- |
| clean `npm ci` | 根 456 包、server 75 包安装成功 |
| typecheck | 通过 |
| Vitest | 1206 通过/18 条件跳过，0 失败 |
| server | 347/2，0 失败 |
| ops | 55/6，0 失败；6 项为 Linux 专属，未冒充通过 |
| native | 24/24 |
| Chromium | 334/2，0 失败，923.4 秒 |
| Firefox/WebKit | 2/2 |
| preview PWA | 1/1 |
| production build | 通过；首屏 183,877 B gzip，菜单 270,096 B |
| production audit | 根 0、server 0 |
| licenses | 125 个运行时包 |
| API | 162 文件；临时 SQLite health 200/schema 7/layout 2 |
| Android | bundle/assemble/lintVital 通过；1.0.41/1000041；unsigned |
| Windows | unpacked 通过；Authenticode `NotSigned` |

`npm ci` 的完整开发依赖审计仍报告 5 项已知工具链问题（1 moderate/4 high），来自 Electron/Vite 构建链；生产依赖审计为 0。禁止在候选上直接 `npm audit fix` 造成锁文件漂移。

## 7. 不可变制品和 SHA-256

下列文件位于 `D:\GameDev\DSPidle2-v141-release\1.0.41-59f37d18feb9`：

| 制品 | 字节 | SHA-256 |
| --- | ---: | --- |
| source tar | 6,071,276 | `4496f6834158271deda2d7aea8d73d84e9cd26038e176c42fa75374c0651e8ca` |
| Web tar（clean worktree） | 1,448,812 | `f24f0a94195a54367044a8cdacdf5919e18811305853871d8489fc44c310a170` |
| API expanded tar | 616,635 | `1dbad342bc3b5bd5d9dd4ccaf3e7f151cfffa3f7da4be522f0028703a1a5ca81` |
| Windows unpacked diagnostic unsigned | 150,165,398 | `83e1a04305b569a51efba7a5bfa2d8dc7419605e86e219c49dbabee533dfa087` |
| Android unsigned APK | 4,823,426 | `8a24307297e7aa90e5ec8b25242c02e6295733276d878b681a31f952b2617510` |
| Android unsigned AAB | 4,638,205 | `098f53f497bf6cafb60aeb96bea1ecc984bcabfae9682eb04407a5d2ab6986ce` |
| source manifest | 36,218 | `0e6a7d08f23fc322ed5515a37aaa5ba804176d9146f8a8507f1f20276bf1f22f` |
| SBOM | 407,391 | `8c30567c3cf7d84df5c3e4cc8bd5b1173935ec0a9830249d19a29d0056c40a40` |
| provenance | 2,305 | `d9c2192eca148a58572b615f1a1fe8578b3708c95f20798e5de9a1fe51d061e3` |

source manifest 为 214/214，聚合 SHA-256 `3368d2f6a64d1ee3bb38660b912d9d5cafa8e116609f32222a7dc5d38c3aed96`；candidate manifest 记录 10 个 subject，已逐项复验；provenance 的 3 个 subject 已复验。`version.json.generatedAt` 按构建时间变化，因此 provenance 明确 `reproducible:false`；最终 Web tar 和 source manifest 来自同一次 clean worktree 构建。

Windows/Android 制品禁止直接进入 stable。Release Agent 必须从固定源码以正式 URL/既有批准证书重建、签名和验证；不得创建新 Android 证书，不得把 `NotSigned` Windows 诊断包伪装成正式安装包。

## 8. 真实设备与体验门禁

- Android 真机、新版/经典手机 UI、横竖屏、中文/英文输入法、100/150/200% 字号；
- 1.0.38→1.0.41 覆盖升级，普通/速通本地档与安全会话边界；
- 低配 Windows、正式 setup/feed、独立 profile；
- 23～48 MiB 上传/下载/重启/历史恢复，浏览器关闭在上传前/中/已提交未收到三个时点；
- 多标签页、多设备、网络中断和重复点击；
- 一小时及更久普通离线，一小时纯挂机，后台超过五分钟；
- 80～200% 字号、小窗口和手机端 10/50/100 条连接交互。

不得使用生产账号或玩家存档做写测试。若需要大规模档，只能使用确定性合成档或玩家明确授权的只读本地副本。

## 9. Go/No-Go 与回滚

以下任一情况立即 No-Go：Linux 实例门禁未完成、双 writer、pending/state/current/proxy 不一致、502/503/504、备份窗口缺失、活跃 WAL/SHM、preflight 无界复制、存档正文/checksum/revision 改写、模式串档、离线收益重复/消失、物资不守恒、签名不连续。

- 未切流：直接废弃候选，生产不变。
- 已单节点灰度：使用 release switch 把 Web/API 指针切回不可变 1.0.39 代码和验证过的旧模板；只回滚代码，不恢复生产数据库。
- pending 存在：先按 journal 恢复并证明一个 writer，再决定代码回滚；不能删除日志绕过。
- Android/Windows：保留现行 1.0.38 stable feed，不发布诊断制品。
- 不删除缓存、不覆盖玩家本地/云存档、不修改排行榜历史、不补物资、不跳过结算。

只有 Linux、签名、实体设备、备份副本和用户授权全部满足后，Release Agent 才能创建正式 `docs/releases/1.0.41.md`。本开发交接本身不是生产发布记录。
