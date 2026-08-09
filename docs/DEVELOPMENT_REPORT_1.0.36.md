# DSPidle2 1.0.36 开发与验证报告

> 状态：开发完成，等待 Release Agent 验收；未部署生产环境
> 日期：2026-08-10
> 基线：正式版 `1.0.35+080844f55852`
> clean source：`e0ad49062fa329040b379375b595ba74b7d23daf`
> Build ID：`1.0.36+e0ad49062fa3`

## 1. 结论

本批七个模块均已实现并增加测试：新线路默认并联数量、可燃冰火电、传送带运行时索引、高密度 Canvas 命中、生产静态量缓存、物流调度索引，以及不改格式的存档字段审计。1.0.35 的纯挂机、普通/速通存档隔离、自动保存、统计、寻线和建筑堆叠完整回归通过。

确定性与守恒门禁通过。优化路径在 1、4、12、60、600 秒、1 小时和 1 天上与扫描 oracle 的完整 `GameState` 深比较一致；两份真实存档的 60 秒整段与 60×1 秒玩法哈希一致，非法/负数数量为 0，原始文件 SHA-256 前后不变。

性能为“部分达到目标”：两份真实档的传送带阶段分别下降约 76.3% 和 57.5%，单秒 P95 分别降至 228ms 和 247ms；9,089,328 字节档的 60 秒整段为 8.75 秒。20,164,029 字节档整段仍为 12.19 秒，没有达到需求中的 7～9 秒目标。约 946 实体/2,220 线路的目标画布样本在生产构建中低于 200MB 且 P95 为 7ms；4,084 实体/10,410 线路的极端样本仍会达到约 407MB，并存在偶发长帧。因此建议先灰度，不建议把“全部性能目标达成”作为发布说明。

本开发任务没有修改排行榜历史、生产数据库、生产服务、下载页或玩家存档，也没有部署任何候选。

## 2. 修改文件列表

源码候选共修改 64 个文件，新增 2,140 行、删除 382 行。权威列表可执行：

```powershell
git show --stat --name-status e0ad49062fa329040b379375b595ba74b7d23daf
```

版本与文档：

- `CHANGELOG.md`
- `package.json`
- `package-lock.json`
- `android/native-version.properties`
- `docs/ARCHITECTURE.md`
- `docs/GAMEPLAY_SYSTEMS.md`
- `docs/PROJECT_STATUS.md`
- `playwright.config.ts`

玩法、设置与 UI：

- `src/App.tsx`
- `src/components/CanvasBeltLayer.tsx`
- `src/components/OperationsWorkspace.tsx`
- `src/components/ReleaseNotesDialog.tsx`
- `src/components/ReleaseNotesDialog.test.ts`
- `src/game/content.ts`
- `src/game/engine.ts`
- `src/game/network.ts`
- `src/game/settings.ts`
- `src/game/settings.test.ts`
- `src/game/uiPreferences.ts`
- `src/game/uiPreferences.test.ts`
- `src/game/canvasPerformance.ts`
- `src/game/canvasPerformance.test.ts`
- `src/i18n/legacyTranslations.ts`
- `src/styles.css`
- `src/theme.css`

新增专项实现与测试：

- `src/game/canvasBeltSpatialIndex.ts`
- `src/game/canvasBeltSpatialIndex.test.ts`
- `src/game/saveFieldAudit.ts`
- `src/game/saveFieldAudit.test.ts`
- `src/game/v136-release.test.ts`
- `src/game/v136RealSaveBenchmark.test.ts`
- `tests/e2e/v136-release.spec.ts`

浏览器版本基线与历史回归：

- `tests/e2e/construction-automation-stability.spec.ts`
- `tests/e2e/game-flow.spec.ts`
- `tests/e2e/mobile-shell.spec.ts`
- `tests/e2e/speedrun.spec.ts`
- `tests/e2e/ui-visual-feedback.spec.ts`
- `tests/e2e/v101-ui-logistics.spec.ts`
- `tests/e2e/v102-light-i18n.spec.ts`
- `tests/e2e/v103-release.spec.ts`
- `tests/e2e/v104-release.spec.ts`
- `tests/e2e/v105-release.spec.ts`
- `tests/e2e/v106-release.spec.ts`
- `tests/e2e/v108-release.spec.ts`
- `tests/e2e/v109-storage-recovery.spec.ts`
- `tests/e2e/v112-release.spec.ts`
- `tests/e2e/v115-pure-idle-tutorial.spec.ts`
- `tests/e2e/v117-space-station-construction.spec.ts`
- `tests/e2e/v118-station-upgrade.spec.ts`
- `tests/e2e/v119-quantum-logistics.spec.ts`
- `tests/e2e/v120-paused-canvas-performance.spec.ts`
- `tests/e2e/v121-blueprint-construction.spec.ts`
- `tests/e2e/v121-statistics-alignment.spec.ts`
- `tests/e2e/v123-cloud-upload.spec.ts`
- `tests/e2e/v124-canvas-performance.spec.ts`
- `tests/e2e/v124-canvas-real-save-benchmark.spec.ts`
- `tests/e2e/v124-factory-management.spec.ts`
- `tests/e2e/v127-selection-batch.spec.ts`
- `tests/e2e/v130-feedback-batch.spec.ts`
- `tests/e2e/v135-idle-mode-isolation.spec.ts`
- `tests/e2e/v31-workspaces.spec.ts`
- `tests/e2e/v32-buffer-settings.spec.ts`
- `tests/e2e/v33-release.spec.ts`
- `tests/e2e/v34-release.spec.ts`

## 3. 新建传送带默认并联数量

- 新增设备级偏好键 `dsp-idle-network.ui.default-belt-lanes.v1`，默认 1，合法范围 1～4,096。
- 设置界面提供 1、2、4、自定义和恢复默认；0、负数、小数、文字和超过 4,096 均显示明确错误。
- 偏好只进入当前设备 `localStorage`，不进入 `GameState`、IndexedDB 存档、云存档、导出文件或排行榜。
- 桌面拖线、点击连接、连续连接、经典/新版移动连接和蓝图直接/排队放置均显式传递最终 `lanes`。
- 材料按最终并联数一次性计算；不足时返回“需要/现有/缺少”并保持原状态，不生成部分线路、不扣部分材料。
- 已有线路、货物 `stackSize`、原蓝图模板和已有建造队列不被重写。排队蓝图使用独立 `:lanes-N` 不可变解析版本。

## 4. 可燃冰燃料

- 复用内容目录中已有 `ItemId`：`fire_ice`。
- `FUEL_ENERGY_MJ.fire_ice = 4.8`，接入既有火力发电燃料列表、燃料选择、剩余热量、电网调度、耗尽提示、统计、离线和时间扭曲路径。
- 火电既有 80% 燃料效率与缓存规则不变；本批没有为可燃冰增加副产物。
- 煤、原油、精炼油、高能石墨、氢、氢燃料棒、氘核燃料棒和反物质燃料棒均保留原数值与路径。

## 5. 传送带运行时索引与状态队列

每个精确模拟会话建立可重建、不可序列化的星球级索引：

- `beltById`、`sourceToBelts`、`targetToBelts`、`itemToBelts`；
- `activeBelts`、`blockedBelts`、`inputStarvedBelts`、`outputFullBelts`、`powerLimitedBelts`；
- 按源端/物品分组的稳定路线、目标容量 ledger 和源/目标实体引用；
- 运行 profiler 的扫描、分配、预留、路线检查、目标检查与稳定跳过计数。

只有在至少 64 条且不少于 10% 路线可证明休眠时才启用休眠队列。源库存或生产能力、目标容量、配方、供电、线路参数、拓扑或运行字段变化都会重新唤醒；无法证明安全时继续完整计算。优先级、目标端口、路由偏移和持久公平顺序没有改变。

## 6. 生产、缓存与物流调度

生产会话复用配方定义、建筑速度×堆叠、星球倍率、输出容量、增产输出 credit key 和功率需求乘积。输出周期上界使用与旧逐周期语义一致的闭式分支与有界二分；每个建筑输入、输出、进度、增产余量和副产物仍独立，不合并库存。

物流会话建立稳定供需槽索引、派遣计划、槽位容量、在途/预留/忙碌载具账本、伙伴排序和未变化阻塞缓存。量子池与传统运输继续分开；运输机、运输船、翘曲器、在途货物和每塔缓存仍按原规则结算。UI 运行状态也复用只读索引，避免高密度画布对物流塔、仓库和供电做 O(实体×线路) 扫描。

## 7. 画布、空间索引与安全回退

- 当前星球实体不少于 700 或线路不少于 1,500，且对应设备开关允许时，自动采用密集 Canvas 路径。
- 普通线路由 Canvas 批量绘制；拓扑/几何 revision 变化时重建网格空间索引。
- 线路悬浮、单击、双击寻线由空间索引命中；选中、悬浮、寻线、任务与生产详情线路临时提升为 React Flow 详细 edge。
- Canvas 初始化或绘制失败时自动恢复完整 React Flow edge；蓝图、拉线、建筑点击、节点移动和移动触控保持可用。
- 高密度节点状态派生复用只读模拟索引；生产构建和开发构建可通过 `DSP_E2E_USE_PREVIEW=1` 分开测量，避免把 React 开发诊断开销误当玩家性能。

## 8. 存档结构变化与字段审计

本批不改变存档结构：

| 协议 | 1.0.35 | 1.0.36 |
| --- | ---: | ---: |
| `GameState.version` | 46 | 46 |
| save envelope | v2 | v2 |
| cloud schema | v7 | v7 |
| SQLite layout | v2 | v2 |

字段分类结果：

- 权威且继续持久化：建筑输入/输出、生产进度、线路进度/`lastFlow`/`congestion`/累计运输、物流路线与在途货物、量子库存、矿脉与科研/任务/戴森状态。
- 运行时缓存且不持久化：传送带活跃/阻塞索引、物流阻塞缓存、机器静态量、Canvas 线路命中索引。
- UI 观察且不持久化：`recentFlow*`、Canvas revision。
- 迁移专用：旧档缺少模式字段继续由 1.0.35 的幂等迁移保守解析为 `normal`。

测试确认导出 JSON 不含新增索引，checksum 有效并可重新导入为 v46。

## 9. 旧存档迁移与本地/云兼容

本批不增加迁移步骤，不复制槽位，不覆盖已有记录。v1～v46 的既有连续迁移、旧档普通模式默认、普通/速通本地与云同槽隔离、导入校验、复制为普通存档、自动保存和排行榜资格全部由最终 Vitest/Playwright/server 套件回归。

本地保存仍使用既有 IndexedDB 主档、槽位、快照与校验和；云端仍使用 `mode + slot + expectedRevision`。服务端文件和数据库 schema 本批没有改动，Web 1.0.36 与 1.0.35 API 保持协议兼容。

## 10. 两份真实存档性能对比

同一开发机、Node v24.14.0、只读内存副本；基线为修改前 1.0.35，候选为 clean source 对应代码。

| 指标 | 9,089,328 B 基线 | 1.0.36 | 变化 | 20,164,029 B 基线 | 1.0.36 | 变化 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 秒精确总耗时 | 19,024.7ms | 8,751.8ms | -54.0% | 19,816.9ms | 12,186.7ms | -38.5% |
| 传送带 | 4,665.7ms | 1,105.2ms | -76.3% | 11,704.9ms | 4,970.5ms | -57.5% |
| 物流 | 10,783.3ms | 5,292.0ms | -50.9% | 1,301.1ms | 995.7ms | -23.5% |
| 生产 | 685.9ms | 552.6ms | -19.4% | 2,238.5ms | 2,432.3ms | +8.7% |
| 单秒 P95 | 581ms | 227.9ms | -60.8% | 1,538ms | 246.5ms | -84.0% |

9,089,328 字节档：4,779 实体、11,779 线路、904 站、18 星球；当前星球 223/604/21，最密 `abyss` 为 4,084 实体、10,410 线路、770 站。

20,164,029 字节档：11,604 实体、27,669 线路、2,011 站、22 星球；当前星球 887/2,014/142，最密 `crystal` 为 946 实体、2,220 线路、159 站。

结论：传送带 40%～65% 目标在大档达到，在第一档超过目标；两档单秒 P95 均优于 400～650ms 目标。20,164,029 字节档 60 秒总耗时仍未达到 7～9 秒目标，生产 30%～50% 与该档物流 30%～50% 目标也未稳定达到。

## 11. 哈希、库存与长时结算

| 夹具 | 60 秒完整哈希 | 玩法哈希 | 60×1 秒玩法哈希 | 非法数量 | 缓存合计 | 量子库存 |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 9,089,328 B | `bc66537b` | `b8991085` | `b8991085` | 0 | 85,989,242,731 | 187,778,066,569 |
| 20,164,029 B | `c3c250aa` | `98168731` | `98168731` | 0 | 230,792,709,140 | 219,082,673,616 |

整段与 60×1 秒的完整哈希因既有 `productionHistory` 采样桶粒度不同而不同；排除该 UI 历史数组后的所有玩法字段一致。另一个合成 oracle 在 1/4/12/60/600 秒、1 小时和 1 天上直接执行完整 `GameState` 深比较，包含库存、缓存、线路、物流、量子、载具、翘曲器、电力、科研和戴森字段，全部一致。

既有 `fast-30s-v2` 在真实档的 1 小时/1 天只读测试均返回可重载候选、关键终局指标重载一致且 `fellBack=false`。但第一档保守误差估计约 50.2%～58.4%，20MiB 档约 0.30%～5.81%，组合 Node 进程 RSS 最高约 3.18GB。该近似算法并非本批新增，仍不得用于速通、排行榜或需要完整精确结果的结算。

原始文件 SHA-256 前后保持：

- `dsp-idle-save-2026-08-09.json`：`6f65f490cc886e89dea2d3cecf25fee40ed6eee04ceac3c61f32e9c7df087413`
- `dsp-idle-save-2026-08-07 (1) (1).json`：`37848f48fa3764cded937560765a6b0f91048cb22867a24bd4aadb8d2414a148`

## 12. 浏览器内存与交互

以下为 clean production build、P6、4 秒暂停/运行拖动采样：

| 星球 | 场景 | P95 | 最大帧 | 浏览器堆峰值 | DOM 节点/线路 |
| --- | --- | ---: | ---: | ---: | ---: |
| 4,084 实体 / 10,410 线路 | 暂停 | 7.0ms | 7.1ms | 296,738,075 B | 15 / 0 |
| 同上 | 运行 | 13.8ms | 1,153.9ms | 407,287,233 B | 15 / 0 |
| 946 实体 / 2,220 线路 | 暂停 | 7.0ms | 20.9ms | 161,192,202 B | 11 / 0 |
| 同上 | 运行 | 7.0ms | 3,892.9ms | 163,793,711 B | 11 / 0 |

需求给出的约 900～1,000 实体/2,000～2,500 线路目标样本达到 P95 <16.7ms 和堆 <200MB。10,410 线路极端样本的交互 P95 达标，但内存不达标；两档运行场景仍有由整档模拟/状态提交引起的偶发长帧，Canvas 单次绘制本身约 0.2～0.4ms。

Worker JSON 传输大小分别为 9,089,404 B 和 19,847,537 B。Node benchmark 的“after heap”同时保留源、整段和分片三个状态，分别为 358,916,712 B 与 851,418,936 B，不应误写成单个浏览器存档的峰值。

## 13. 多 Worker 探针

该探针只做乐观只读星球分区，不是完整生产模拟：

| 夹具 | 1 Worker | 2 Worker | 4 Worker | 8 Worker |
| --- | ---: | ---: | ---: | ---: |
| 9,089,328 B，相对协调器串行 | 0.727× | 0.830× | 0.834× | 0.817× |
| 20,164,029 B，相对协调器串行 | 0.712× | 1.320× | 2.406× | 2.535× |

第一档由一颗超密星球主导，无法均匀分区；第二档有乐观收益，但尚未包含确定性屏障和固定顺序 delta merge。生产多 Worker 继续硬关闭。

## 14. 新增测试与最终结果

新增专项：

- `v136-release.test.ts`：并联线路原子创建/缺料、蓝图直接与排队、1/4/12/60/600/3,600/86,400 秒完整 oracle、可燃冰/旧燃料/耗尽、休眠唤醒、物流阻塞缓存、UI 状态索引一致性。
- `canvasBeltSpatialIndex.test.ts`：Bezier/折线路径命中、半径边界和稳定 tie-break。
- `saveFieldAudit.test.ts`：四类字段、运行索引不序列化、v46 checksum/导入。
- `v136RealSaveBenchmark.test.ts`：显式环境变量下只读记录真实档规模、阶段、哈希、守恒、切片和内存。
- `v136-release.spec.ts`：设备偏好校验/刷新/不进 GameState，桌面/经典移动/新版移动、横竖屏和 80/100/125/150/200% 字号，自动密集 Canvas 命中/提升，Canvas 失败回退。

最终门禁：

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 101 文件通过、6 跳过；918 项通过、17 跳过、0 失败 |
| `npm run test:e2e -- --workers=1` | 259 通过、11 条显式条件跳过、0 失败（270 总数，772.2 秒） |
| `npm run test:server` | 70 通过、2 条显式夹具跳过、0 失败 |
| `npm run test:ops` | 6/6 |
| `npm run test:native` | 8/8 |
| `npm run licenses:check` | 128 个运行时包一致 |
| 根/服务端 `npm audit --omit=dev` | 均 0 漏洞 |
| `npm run build` | clean Build ID 通过，1,888 模块；仅 >500kB chunk 警告 |
| clean `npm ci` | 457 包；完整开发依赖审计仍有既有 1 moderate/4 high，生产依赖为 0 |
| clean `npm run desktop:pack` | 通过；包内版本正确；隔离启动 10 秒；NotSigned |
| clean `npm run android:release:unsigned` | 413 tasks、lintVital、APK/AAB 通过；1.0.36/1000036；未签名 |
| source/archive verify | source 160/160；Web/API 解包 160/160 |

11 条 E2E 跳过均需要显式真实夹具/性能环境开关；真实档、生产 Canvas、长离线和多 Worker 已在本报告所列独立命令中执行。

## 15. 性能影响、默认策略与未解决风险

默认建议：

- 确定性运行时索引可以随 1.0.36 默认启用；失败或条件不明时保留完整路径。
- 密集 Canvas 可按当前阈值自动启用，但必须保留设备开关和 React Flow 回退。
- 多 Worker 保持关闭。
- 存档紧凑化只保留审计结果，本版不删除字段、不升级格式。
- 建议灰度发布，先观察 20MiB 以上存档的 Worker 延迟、浏览器堆、长任务和自动保存。

未解决风险：

1. 20,164,029 字节档 60 秒精确模拟为 12.19 秒，未达到 7～9 秒目标。
2. 4,084 实体/10,410 线路极端星球运行时浏览器堆约 407MB，未达到 200MB。
3. 生产画布 P95 达标，但运行中仍有 1.15～3.89 秒偶发长帧。
4. 既有长离线近似路径在复杂档的 Node 内存与保守误差估计仍高；速通和排行榜必须继续拒绝近似。
5. 没有连接 Android 真机，也没有低配 Windows；温度、锁屏、后台恢复、长时内存和触控体验尚无物理设备证据。
6. Windows/Android 诊断制品均未签名，禁止进入稳定更新源。
7. Vite 的 `FactoryRuntime` 与主 CSS 仍有 >500kB chunk 警告。

## 16. 回滚方案

代码回滚边界为完整 1.0.36 候选回到已发布 1.0.35：

1. Release Agent 若尚未切流，直接废弃 `1.0.36-e0ad49062fa3` 候选目录和未签名诊断制品。
2. 若已灰度，Web/API/下载指针原子切回不可变 1.0.35 目录；不要热改服务器源码。
3. 本批没有数据库 schema 或存档迁移，不恢复旧数据库、不删除本地缓存、不改玩家存档。
4. 新设备偏好在旧版本中只是未读取的 `localStorage` 键，无需删除；已有线路没有被批量改写。
5. 不回滚、删除或重算排行榜历史；任何速通恢复继续走既有人工授权流程。
6. 回滚后复核 1.0.35 `version.json`、API health、云四槽、普通/速通隔离、下载哈希和旧 hashed asset。

发布 Agent 的精确制品、门槛和操作交接见 [RELEASE_HANDOFF_1.0.36.md](./RELEASE_HANDOFF_1.0.36.md)。
