# DSPidle2 1.0.30 开发交接

> 状态：Development handoff / 未生成独立发布提交 / 未发布
> 日期：2026-08-05
> 角色：Development Agent
> 发布授权：未授予；本文不授权 VPS、下载页、生产数据库或安装包发布

## 1. 交接结论

本批将“速通模式 + 独立速通排行榜”和“30 秒精确校准 + 剩余时间批量外推”的快速离线结算实验纳入 `1.0.30` 开发候选。

- 速通模式的代码、客户端面板、独立排行榜 API、服务端校验和专项测试已完成。
- 快速离线结算 `fast-30s-v1` 已完成 Worker 路径、取消、结构安全校验、序列化重载和真实存档只读基准。
- 快速模式在 1.0.30 中默认开启，不写入 GameState、存档 envelope、云 schema 或排行榜规则；玩家可在设置中显式关闭，失败时从原始状态走精确路径。
- 当前验收只把结构/数值安全和白糖、戴森关键结果尾验作为硬门禁。普通资源、缓存和传送带累计量的偏差记录为诊断值；白糖累计产量、戴森结构点/壳层、火箭/太阳帆和发电功率关键结果允许最高 100% 相对误差，超过才回退精确。因此当前实现仍不能宣称“任意复杂存档 30 秒内完成”，但不会因为玩家明确接受的普通资源误差而阻塞可用的快速结果。
- 当前工作区仍是多 Agent dirty 工作区，没有独立 `1.0.30` commit、Build ID、不可变制品或签名；不得从当前工作区直接部署。

### 1.1 本次追加变更：默认开启快速离线

- `fast-30s-v1` 的设备级默认值已改为开启，首次使用 1.0.30 的设备会优先尝试 30 秒校准后的批量外推。
- 玩家在设置中关闭后写入显式 `false`；关闭只改变本机 UI 偏好，不写入 GameState、存档、云端或排行榜。
- 快速路径仍然只在 Worker 内存副本运行；校准、结构/数值安全检查和 5 秒精确验证任一失败，立即从原始状态回到精确 Worker 路径。
- 本次变更把非关键资源/缓存字段从硬门禁改为诊断值；关键白糖/戴森尾验上限为 100%，结构安全门禁不放宽，不把复杂终局标记为无条件成功，也不承诺 30 秒硬上限。

兼容约束保持不变：GameState v46、存档 envelope v2、云 schema v7、SQLite layout v2。没有部署香港/上海 VPS，没有更新下载页，没有发布 Web、Android 或桌面安装包。

## 2. 快速离线结算实现

### 2.1 开关和边界

- 设备级开关：`dsp-idle-network.experimental-approximate-offline.v1`。
- 1.0.30 新设备默认开启；设置文案为“快速离线结算（实验）”。玩家关闭后写入显式 `false`，不会因重新进入菜单而自动重新开启。
- 开关不进入 `GameState`、本地存档、云 payload、普通排行榜或速通规则。
- 只有离线时长大于 30 秒才尝试快速路径；不超过 30 秒继续精确结算。
- 所有工作在 `offlineSimulation.worker.ts` 的隔离副本执行；原始载入状态在成功前不变。

### 2.2 `fast-30s-v1` 流程

1. 克隆原始状态，执行 3 个 10 秒精确窗口，共 30 个模拟秒。
2. 捕获实体输入/输出、累计生产、库存/缓存、传送带计数、物流/量子字段、戴森/速通计数、进度和电力相关数值的实测增量。
3. 对连续校准窗口建立增量合同，按实测尾部速率批量应用剩余时间；不是按建筑理论产能推算。
4. 对循环进度做取模，对非负数字/十进制库存做非负与容量规范化；负库存、非有限数字、非法大整数和无法写入字段均安全回退。
5. 在批量结果上执行 5 秒精确验证；普通资源/缓存/运输量记录 `maxNonCriticalError`，白糖累计产量、戴森结构点/壳层、火箭/太阳帆和发电功率执行关键尾验，超过 100% 才丢弃近似结果并回到原始状态的精确 Worker 路径。默认开启不等于强制提交近似结果，结构和数值安全门禁始终有效。
6. 成功报告算法版本、校准秒数、批量秒数、最大估计误差和边界修正数；回退报告原因。

快速模式不会修改正式时间扭曲玩法。速通计时使用会话接收的有效墙钟秒，模拟倍率不会直接倍速计时。

### 2.3 取消和失败

- 异步校准每个精确切片都会检查取消；取消抛 `AbortError`，Worker 发出 `cancelled`，不发送精确回退请求。
- Worker 崩溃、数值/结构校验失败或验证误差超限时，调用方可用同一原始状态继续精确结算。
- 快速结果在 `serializeEnvelope()` 后通过 checksum 检查，再由 `inspectSave()` 重新读取；序列化失败不会提交半成品。
- `StartMenu` 只有在 Worker 完成并经 `finalizeDeferredOfflineGame()` 后才保存；取消保留原存档并直接进入，不重复发放离线收益。

## 3. 速通模式实现

- 可选 `GameState.speedrun`，仅新建工厂选择“速通工厂”时创建；普通旧存档没有转换入口。
- 固定 `speedrun-v1` / `season_01`，开始时记录 `factoryId`、有限科技基线、实际发射火箭基线和累计宇宙矩阵基线。
- 三个稳定目标 ID：`all_technologies`、`dyson_rockets_10000`、`white_matrix_1m`。
- 全科技排除无限/循环研究；戴森目标读取实际 `totalRocketsLaunched`；白糖目标读取累计 `totalProduced.universe_matrix`，不读取库存或上传量。
- 暂停不计时；时间扭曲只影响生产模拟秒；离线有效墙钟时间只计入一次；目标完成时间写入 milestone 后不因继续生产降低。
- 导入、回滚、时间异常、规则/赛季/工厂身份不合法时保留存档但标记不可上榜。
- 新增独立服务端类别：`speedrun-all-technologies`、`speedrun-dyson-rockets-10000`、`speedrun-white-matrix-1m`。
- `POST /api/speedrun/submit` 从当前主云档重新验证账号归属、规则/赛季、revision/hash、目标计数、时间窗口、内容包和重复提交；最快成绩幂等保留，普通排行榜接口不变。

## 4. 真实存档基准

基准只读加载并 `structuredClone` 存档，没有覆盖、保存或上传附件。初始基准使用以下两个真实夹具：

| 夹具 | JSON 大小 | 实体 | 线路 |
| --- | ---: | ---: | ---: |
| `dsp-idle-save-2026-08-01 (2) (1).json` | 5,507,255 B | 2,906 | 6,340 |
| `dsp-idle-save-2026-08-02 (1).json` | 7,297,536 B | 3,978 | 8,867 |

### 4.1 初始 5.5MB/7.3MB 夹具的早期全状态门禁基准

下表是把输入/输出缓存和传送带累计量也当作 20% 硬门禁时的早期只读基准。它用于说明为什么不能把全状态误差当作快速模式的唯一目标；当前 1.0.30 已按“关键白糖/戴森 + 结构安全”口径验收，普通缓存偏差仅记录诊断值。

| 夹具 / 离线时长 | 状态 | 耗时 | 快速覆盖 | 最大验证误差 | 边界/回退 |
| --- | --- | ---: | ---: | ---: | --- |
| 5.5MB / 10 分钟 | fallback | 3,651 ms | 0 | 100% | `inputs.proliferator_mk3` 预测 0，验证实际 925 |
| 5.5MB / 1 小时 | fallback | 3,399 ms | 0 | 100% | `inputs.proliferator_mk3` 预测 0，验证实际 929 |
| 5.5MB / 7 天 | fallback | 3,295 ms | 0 | 100% | 传送带 `totalTransferred` 预测 0，验证实际 39,604 |
| 5.5MB / 30 天 | fallback | 3,368 ms | 0 | 100% | 同一传送带累计运输边界，回退精确 |
| 7.3MB / 10 分钟 | fallback | 4,727 ms | 0 | 100% | `outputs.stone` 预测 1,800,000，验证实际 0 |
| 7.3MB / 1 小时 | fallback | 4,766 ms | 0 | 100% | 同一输出缓存边界，回退精确 |
| 7.3MB / 7 天 | fallback | 4,696 ms | 0 | 100% | 传送带 `totalTransferred` 预测 0，验证实际 1,543,648 |
| 7.3MB / 30 天 | fallback | 4,781 ms | 0 | 100% | 传送带 `totalTransferred` 预测 0，验证实际 1,606,442 |

上述耗时是 Node/Vitest 只读基准，不是浏览器 Worker 墙钟承诺。基准同时记录 CPU、堆变化和 RSS；大存档多次 `structuredClone` 会形成明显内存峰值，早期样本 RSS 约 0.95～2.41GB，不能把它当作移动端可接受值。`heapDeltaBytes` 受 GC 时机影响，发布前必须在目标桌面、Android Chrome/WebView 和 Electron 重新测量峰值。

### 4.2 2026-08-05 新附件复测

| 夹具 | JSON 大小 | 实体 | 线路 | 物流站 | 量子非零物品 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `dsp-idle-save-2026-08-05.json` | 3,280,426 B | 1,580 | 3,690 | 293 | 26 |
| `dsp-idle-save-2026-08-05 (1).json` | 17,344,200 B | 10,250 | 23,640 | 1,755 | 24 |

两份均为 GameState v46、envelope v2，未暂停，时间扭曲待处理预算为 0。

| 夹具 / 时长 | Node 快速耗时 | 关键结果最大误差 | 结论 |
| --- | ---: | ---: | --- |
| 3.28MB / 10 分钟 | 2.799s | 12.09% | 快速结果可接受 |
| 3.28MB / 1 小时 | 2.535s | 5.86% | 快速结果可接受 |
| 3.28MB / 7 天 | 3.032s | 71.61% | 在 100% 关键误差上限内 |
| 3.28MB / 30 天 | 4.228s | 91.53% | 接近上限但仍在 100% 内 |
| 17.34MB / 10 分钟 | 33.565s | 0.0033% | 快速结果可接受 |
| 17.34MB / 1 小时 | 23.345s | 0.0226% | 快速结果可接受 |
| 17.34MB / 7 天 | 18.903s | 8.30% | 快速结果可接受 |
| 17.34MB / 30 天 | 19.045s | 9.56% | 快速结果可接受 |

两份存档的结果均成功序列化、重新加载并通过关键字段校验；17.34MB 存档优化精确路径在 10 分钟单独测得约 78,487 ms，快速路径的关键结果误差明显低于 100% 上限。当前 Node 基准 RSS 最高约 1.41GB（3.28MB）和 2.91GB（17.34MB），不代表移动端可以保证 30 秒完成；发布前仍需验证 Worker 内存门槛。

这里的误差只针对白糖/戴森关键结果相对完整精确结果的增量，不代表每个缓存、每条传送带或每项普通资源都逐字段一致；普通字段偏差仍需通过非负、容量和结构校验。

### 4.3 浏览器 Worker 真实终局验证

在 Chrome Worker 中使用 17.34MB、10,250 实体、23,640 线路的真实夹具执行 30 天快速离线：本次耗时约 `11.451 秒`，完整推进 `2,592,000` 模拟秒，关键白糖/戴森尾验最大误差约 `9.56%`，源存档摘要、`elapsedSeconds`、`totalProduced` 和戴森字段保持不变；普通字段诊断最大误差记录为 `100%`，未触发结构安全失败。该结果证明当前设备可在目标范围内完成一次复杂终局快速结算，但不代表所有浏览器、移动设备或所有工厂都能达到同一耗时。

同一夹具的纯挂机 Worker 切片验证：8x 约 `3.694 秒`、12x 约 `2.689 秒`、16x 约 `2.662 秒`；停止响应约 `257ms`，终止后无迟到 Worker 消息，关键白糖/戴森字段均为有限非负数。三档关键尾验分别约 `98.16%`、`98.17%`、`88.38%`，均在 100% 上限内。

### 4.4 精确对照边界

现有 `offlinePerformance`/`offlineSimulation` 单测覆盖 1 小时、8 小时、9 小时、24 小时、7 天和 30 天的确定性精确会话（无实体/惰性夹具），并验证分段 Worker 与同步结果一致。当前没有对上述两个真实终局存档执行完整 7 天/30 天精确基线，因为该基线可能超过本地测试门限；因此不能给出真实存档的“快速相对精确加速倍数”。

## 5. 已执行验证

| 命令/场景 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过，0 个 TypeScript 错误 |
| `npx vitest run src/game/offlineApproximation.test.ts --reporter=verbose` | 13/13 通过，包含默认开启、显式关闭持久化、Worker 取消和精确回退 |
| `npm test -- --run` | 778 项通过、16 项跳过；0 失败 |
| `npm run test:server` | 49/49 通过，含速通 API、幂等、伪造时间和普通存档拒绝 |
| `npm run build` | 通过；Vite 转换 1,878 个模块；当前共享 package 版本仍为 1.0.25 |
| `npm run test:native` | 8/8 通过 |
| `npm run test:ops` | 6/6 通过 |
| `npm run licenses:check` | 128 个运行时包一致 |
| `npx playwright test tests/e2e/speedrun.spec.ts --workers=1` | 2/2 通过，桌面新建/面板和 390×844 速通排行 |
| `npx playwright test tests/e2e/game-flow.spec.ts --workers=1 --grep "abandon long offline|cloud upload can abandon offline|offline report summarizes"` | 3/3 通过 |
| `npx playwright test tests/e2e/v130-feedback-batch.spec.ts --workers=1` | 6/6 通过 |
| `npx playwright test tests/e2e/v121-statistics-alignment.spec.ts --workers=1` | 3/3 通过 |
| `DSP_CONSTRUCTION_STABILITY_SAVE=... npx playwright test tests/e2e/construction-automation-stability.spec.ts --workers=1` | 3/3 通过（3.28MB 真实夹具；停止包含保存提交且小于 3 秒） |
| `DSP_REAL_OFFLINE_TIME_WARP_FIXTURE=... npx playwright test tests/e2e/v130-offline-timewarp-real-save.spec.ts --workers=1` | 2/2 通过（17.34MB 真实夹具） |
| `npx playwright test tests/e2e/v123-cloud-upload.spec.ts --workers=1` | 3 个场景因未配置真实云上传夹具而跳过 |
| `npx playwright test --workers=1` | 本轮未重新跑全量长测；共享工作区前次结果为 248 个场景：198 通过、6 跳过、44 失败，失败主要为历史 UI 选择器/旧夹具/移动工作区时序，不能视为全量门禁通过 |
| `git diff --check` | 通过；仅有既有 `src/theme.css` CRLF 转换警告 |

专项单测还覆盖：30 秒以内精确路径、30 秒校准合同、速率不稳定回退、量子合同、确定性重复运行、速通计时/目标基线、暂停/时间扭曲、序列化重载、快速取消和原始状态哈希不变。

## 6. 修改文件

本批直接相关或需在发布候选中提取的文件：

- 快速离线：`src/game/offlineApproximation.ts`、`src/game/offlineApproximation.test.ts`、`src/game/offlineFastSettlementBenchmark.test.ts`、`src/game/offlineSimulation.ts`、`src/game/offlineSimulation.worker.ts`、`src/components/StartMenu.tsx`、`src/components/OfflineReportWorkspace.tsx`、`src/App.tsx`
- 速通核心：`src/game/speedrun.ts`、`src/game/speedrun.test.ts`、`src/game/types.ts`、`src/game/engine.ts`、`src/game/storage.ts`
- 速通界面/API：`src/components/SpeedrunStatusPanel.tsx`、`src/components/GalaxyWorkspace.tsx`、`src/game/cloud.ts`、`server/index.mjs`、`server/package.json`、`server/speedrun.test.mjs`、`tests/e2e/speedrun.spec.ts`
- 共同文档：`docs/ARCHITECTURE.md`、`docs/GAMEPLAY_SYSTEMS.md`、`docs/PROJECT_STATUS.md`

以上文件同时包含之前 `1.0.27`～`1.0.29`、亮色 UI 和其他 Agent 的未提交修改；Release Agent 必须逐 hunk 审查，不能整文件覆盖、reset、checkout 或 clean。

## 7. 未通过项目和剩余风险

1. 3.28MB 存档 30 天关键结果误差约 91.53%，虽在 100% 上限内但接近边界；普通缓存/运输量可能更大，只能依赖结构安全校验和诊断报告，不能承诺全状态一致。
2. 大存档快速路径的 Node RSS 峰值达到约 3.01GB；17.34MB 浏览器 Worker 本次约 11.739 秒，但尚未在 Android Chrome/WebView、Electron 和低内存设备确认可用内存上限。
3. 17.34MB 存档优化精确 10 分钟约 78 秒，快速路径是通过可接受的关键结果误差换取速度；若关键尾验超过 100% 或结构校验失败必须精确回退，不能截断离线时间。
4. 普通缓存/物流字段不再作为快速结果的数值硬门禁，但仍可能出现明显诊断偏差；产品只接受资源误差，不接受 NaN、负库存、容量越界、丢失在途物资或结构损坏。
5. 全量 Playwright 248 个场景仅 198 通过、6 跳过、44 失败，聚焦离线/时间扭曲和本批反馈场景已通过；发布前必须由开发 Agent 清理历史回归或明确排除清单。
6. 未在真实 Android Chrome/WebView、Electron 和低性能设备上做长时间快速结算压力测试；未测真实 Worker 内存上限、切后台、浏览器崩溃恢复。
7. 服务端速通测试使用临时 SQLite 和本地 HTTP；没有生产账号、生产数据库或 VPS smoke test。
8. 当前没有独立 `1.0.30` commit、版本号、Build ID、Web/API/Android/桌面 immutable artifact、manifest 或签名证明；不能从共享 dirty 工作区直接打包。

## 8. Release Agent 接手门禁

1. 等待 `1.0.29`/当前发布 Agent 完成并确认生产基线；读取本文件、相关历史 handoff 和当前 `git status --short`。
2. 在独立干净分支中只提取本批速通与快速离线相关 hunk，创建唯一 `1.0.30` commit；不得把共享工作区其他 UI/性能实验误带入发布。
3. 使用 `dsp-idle-save-2026-08-05.json` 和 `dsp-idle-save-2026-08-05 (1).json` 在固定桌面设备、Chrome/Edge、Android Chrome/WebView 和 Electron 重新执行精确/快速对照；确认默认开启只改变尝试顺序，不改变结构安全回退。若关键尾验超过 100% 或设备触发安全回退，公告必须写“默认尝试、失败自动精确回退”；即使关键误差通过，也不能写成任意存档 30 秒硬保证。
4. 评估 RSS 峰值和移动端 Worker 内存；若超过平台门限，先减少副本驻留或提供设备级关闭提示，不得通过截断时间、删除缓存或压低库存掩盖问题。
5. 从干净提交提升到 `1.0.30`，生成版本公告、Web/API/Windows/Android 制品和 manifest，核验 GameState v46、envelope v2、云 schema v7、长期 Android 证书连续性和包内 API 地址。
6. 重新执行 typecheck、Vitest、server/ops/native/licenses、完整 Playwright、真实存档矩阵和安装包 smoke test。所有失败回到 Development 修复，不在发布节点热改代码。
7. 获得单独发布授权后，才按既有备份、健康检查、原子切换和回滚流程处理指定 VPS/下载页。本文不含任何秘钥、密码或证书私钥。

## 9. 回滚边界

- 快速离线实验默认开启，可通过设备开关关闭；精确 Worker 路径保持为正式回退，不需要存档迁移。关闭偏好写入 `false`，回滚代码时不得清理该本地偏好。
- 速通字段是可选的；代码回滚不得删除普通工厂或已有速通本地记录。速通排行榜服务端回滚前必须保留数据库备份和独立 submission 数据。
- 代码回滚目标应是发布时实际验证的 `1.0.29` immutable 目录和 commit；当前填 `unknown`，由 Release Agent 在制品生成后补齐。
- 不允许以清空量子库存、删任务、截断离线时间或重写玩家存档作为回滚手段。
