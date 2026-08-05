# DSPidle2 1.0.29 开发交接

> 状态：Development complete / Release candidate not created / Not released
> 日期：2026-08-05
> 角色：Development Agent
> 发布授权：未授予；本文不授权 VPS、下载页、Web/API、Windows 或 Android 发布

## 1. 交接摘要

- **Task ID / title：** `STABILITY-P0P1-20260804` / 建筑制造中心递归制造阻塞与时间扭曲停止稳定性修复
- **Priority：** P0 + P1
- **User-visible acceptance criteria：** 见第 2 节；制造保护期间全局模拟持续提交，时间扭曲停止最长 2 秒内恢复操作，且不复制或丢失物资
- **Compatibility and data-preservation constraints：** 见第 4 节；保持 GameState v46、envelope v2、云 schema v7 和 SQLite layout v2
- **Target platforms：** 桌面浏览器、移动浏览器、PWA、Electron/Windows 和 Android；当前只完成桌面 Chromium 专项，其他平台是发布前门禁
- **Required tests：** 见第 7、8、10 节；开发专项已通过，完整 Playwright、原生与生产发布矩阵尚待 Release Agent 从最终候选重跑
- **Release target and version：** `1.0.29`，等待 Release Agent 从干净、可追踪的 `1.0.28` 后继基线创建候选版
- **Source and attachments：**

- 原始需求：`C:/Users/WINDOWS/.codex/attachments/95d85f4d-0447-49b2-b9c8-bf3c6a37c512/pasted-text.txt`
- 只读真实存档夹具：`D:/360安全浏览器下载/dsp-idle-save-2026-08-04.json`
- 夹具信息：GameState v46、221 个实体、186 条传送带、13 个物流站、建筑制造中心堆叠 44,311、38 种递归目标，多个目标为 100,000,000

本批只修复精确模拟的计算预算、Worker 调度和时间扭曲停止流程。没有启用近似结算，没有改变配方、产能、库存、物流、量子网络、离线收益或时间扭曲倍率规则。

当前共享工作区同时包含尚未提交的 `1.0.28` 和其他开发改动。`package.json` 仍为 `1.0.25`，当前 `HEAD` 是 `1cc7394fdee2a77f48e0707d1bb73d19ad799487`，它只是工作区基点，不是 `1.0.29` 开发提交。Release Agent 禁止从当前 dirty 工作区直接打包或使用 reset/checkout/clean 清除其他 Agent 的工作。

## 2. 用户可见问题与验收结果

### P0：建筑制造中心阻塞全局模拟

修复前，高堆叠建筑制造中心会把 `seconds × machineCount × powerFactor` 作为未设上限的工作量，在同一个 Worker 请求中反复构建递归计划和执行小批次。真实夹具的原始 30 秒复现耗时约 16,866ms，其中建筑制造中心约 16,756ms，占 99.35%；Worker 未提交期间，托盘、线路、生产进度和统计只能显示旧状态。

修复后：

- 每个模拟秒最多执行 256 次建筑制造迭代，最多构建 24 次递归计划。
- 建筑制造中心堆叠达到 10,000 时显示“计算保护中”，本次只对制造中心降速；其他生产、线路、物流、电力和统计继续结算。
- 相同目标的可重复任务使用批量数学结算；高负载公平批次单次最多 4,096，避免按 44,311 台堆叠逐台创建任务。
- 预算耗尽时保留 job、`stepIndex`、WIP、库存、目标和制造进度，下一模拟片继续，不回退或重复扣料。
- 递归计划缓存跨持久模拟步骤复用。缓存按星球、目标/配方、已完成科技、内容包版本和相关材料快照校验；材料、科技或目录变化后安全失效。
- 普通 Worker 每次最多提交 2 个模拟秒，尚未处理的模拟时间和对应墙钟时间继续留在积压预算中，不静默丢失。

### P1：时间扭曲停止等待过久或卡死

修复后：

- 点击停止后立即禁止新切片提交，并立即进入停止状态。
- 最多等待当前切片 750ms；仍未响应时终止该 Worker，只丢弃尚未提交的切片，不在主线程同步补算。
- 被终止的 Worker 会重建；内容包注册表指纹同时清空，确保新 Worker 的首个请求重新携带注册表。
- 修复旧 `gameRef` 竞争覆盖真实超时原因的问题；手动停止和自动超时后均恢复 Worker 路径与页面交互。
- 时间扭曲单片最多 12 个模拟秒，目标切片墙钟约 350ms；1,000ms 视为慢任务，2,000ms 触发硬超时并自动停止。
- 调速器记录 Worker 慢、积压、计算能力不足、供电限制等原因，并根据真实吞吐自动降档。
- Worker 无论是否开启性能面板都会返回轻量 `durationMs`；详细 profiler 仍只在诊断开启时返回。
- 用户会看到“未完成切片已丢弃/未计入收益”的明确提示，不会误认为未提交计算已经结算。

## 3. 核心实现设计

### 3.1 建筑制造预算与缓存

`runConstructionCenters` 使用每模拟秒重置的共享计算预算。预算限制的是确定性的迭代次数和计划构建次数，而不是把墙钟时间写入游戏规则，因此同一状态、同一切片顺序可以重复得到相同结果，也不会把设备速度写入 GameState。

持久缓存保存在模拟运行时 lookup 中，不持久化到存档。缓存命中前重新验证相关材料快照；库存、科技、星球、配方选择或内容包变化都会触发重新规划。预算耗尽仅结束本次制造中心处理，随后照常执行本模拟步的其他系统。

### 3.2 Worker 切片与积压

`simulationBudget.ts` 将“积累时间”和“取出一个安全切片”分离。普通模式固定最多 2 秒；时间扭曲使用调速器给出的动态切片但硬上限为 12 秒。切片按原模拟时间/墙钟时间比例拆分，剩余两类时间同时保留，避免收益丢失或墙钟重复结算。

Worker 响应总是带 `durationMs`，但只在性能诊断开启时计算详细阶段数据和传输大小。主线程用完整往返样本调整后续倍率和切片，并在单个时间扭曲请求超过 2 秒时执行安全恢复。

### 3.3 停止与恢复

停止操作先关闭纯挂机提交门，再等待最多 750ms 的已提交边界。超时后终止旧 Worker、清空仅属于该未提交请求的引用和积压、暂停模拟、保存最后一份已经提交且校验通过的状态，然后创建新 Worker。新 Worker 不复用旧内容包指纹，因此不会因缺少注册表进入循环恢复。

该流程不回放未提交切片，也不把旧 React/GameState 引用覆盖到新状态。已经提交的物资、建筑、线路和时间保留；尚未提交的切片明确不计入收益。

## 4. 兼容与数据守恒

- GameState 保持 v46；存档 envelope 保持 v2；云 schema 保持 v7；SQLite layout 保持 v2。
- 没有新增持久字段、迁移、内容 ID 或本地设置键。
- 不删除或重置建筑制造中心、递归任务、WIP、目标库存、托盘、线路缓存、载具、在途货物或量子库存。
- 所有玩家可见数量继续要求非负安全整数；真实夹具 60 秒结果中非法、负数或非安全整数计数为 0。
- 同一夹具两次执行 60 个一秒切片的状态哈希稳定为 `511b02d4`。
- 保存、重新加载和再次导出的 checksum 均有效，关键实体、线路、库存、任务、物流、科研和量子状态保持一致。
- 一个 60 秒请求的哈希为 `56db9fc4`，60 个一秒请求为 `511b02d4`。唯一不同的顶层字段是 `productionHistory`：前者在请求边界记录 1 个样本，后者记录 60 个样本；`historyRecordedAt` 相同，除采样密度外的所有玩法字段字节等价。该允许差异已经记录在 `docs/ARCHITECTURE.md`。
- 近似离线结算仍是独立、默认关闭的实验功能；存在递归 job 的存档不会因本批修复被强制改走近似路径。

## 5. 真实存档性能结果

以下数据来自同一只读夹具和正式持久模拟路径；原始存档未被覆盖、保存或上传。

| 指标 | 修复前 | 修复后：60 × 1 秒切片 | 改善 |
| --- | ---: | ---: | ---: |
| 60 模拟秒总耗时 | 30,932ms | 588.94ms | 降低 98.10%，52.52× |
| 建筑制造中心耗时 | 30,738ms | 404.34ms | 降低 98.68%，76.02× |
| 单片 P50 | 未形成稳定提交 | 9.60ms | 低于 500ms 推荐目标 |
| 单片 P95 | 未形成稳定提交 | 13.88ms | 低于 500ms 推荐目标 |
| 单片最大值 | 数秒至数十秒积压 | 28.51ms | 低于 2,000ms 硬目标 |

修复后 60 个一秒 Worker 提交均完成，模拟时间前进 60 秒，传送带累计量和总生产量继续增加，44,311 建筑制造中心堆叠及至少 38 个制造目标保留。该结果只证明本夹具和当前测试设备，不应外推成所有存档的固定性能承诺。

## 6. 修改文件

本批直接相关文件：

- 模拟与调度：`src/game/engine.ts`、`src/game/simulation.worker.ts`、`src/game/simulationBudget.ts`、`src/game/timeWarpComputeGovernor.ts`
- 主线程与状态提示：`src/App.tsx`、`src/components/TimeWarpIdleOverlay.tsx`
- 单元/性能测试：`src/game/constructionAutomationGuard.test.ts`、`src/game/simulationBudget.test.ts`、`src/game/timeWarpComputeGovernor.test.ts`、`src/game/offlinePerformance.test.ts`
- 浏览器测试：`tests/e2e/construction-automation-stability.spec.ts`
- 架构与玩法文档：`docs/ARCHITECTURE.md`、`docs/GAMEPLAY_SYSTEMS.md`

这些 tracked 文件还可能含有既有 `1.0.28` 或其他 Agent 的相邻改动。Release Agent 必须逐文件审查并在隔离工作树中形成可追踪提交，不能按整文件覆盖或回滚。

## 7. 已执行验证

以下结果在本批源码完成后、当前共享工作区中执行：

| 命令 | 准确结果 |
| --- | --- |
| `npm run typecheck` | 通过；TypeScript 0 错误 |
| `npm test -- --run` | 86 个测试文件通过、3 个跳过；744 项通过、14 项跳过、0 失败 |
| `$env:DSP_REAL_FIXTURE='D:/360安全浏览器下载/dsp-idle-save-2026-08-04.json'; $env:DSP_CONSTRUCTION_STABILITY_PROFILE='1'; npm test -- --run src/game/offlinePerformance.test.ts` | 2 项通过、2 项可选基准跳过；真实夹具性能、确定性和保存重载通过 |
| `$env:DSP_CONSTRUCTION_STABILITY_SAVE='D:/360安全浏览器下载/dsp-idle-save-2026-08-04.json'; npx playwright test tests/e2e/construction-automation-stability.spec.ts --workers=1` | 3/3 通过、0 失败 |
| `npm run build` | 通过；Vite 转换 1,876 个模块 |
| `git diff --check` | 通过；仅有无关 `src/theme.css` CRLF 转换提示 |

专项覆盖包括：

- 44,311 高堆叠保护、迭代/计划预算、任务跨步继续、中间物资守恒和重复执行确定性。
- 递归计划跨步骤命中，以及材料变化后的正确失效；缓存与冷路径玩法结果一致。
- 普通积压按 2 秒切片且剩余预算不丢失；时间扭曲切片、慢任务降档和 2 秒硬超时。
- 未开启性能诊断时 Worker 仍返回耗时，详细 profiler 不被无条件生成。
- 真实夹具连续 60 次 Worker 提交、线路/生产继续推进、堆叠和目标保持。
- 人工延迟 Worker 后，手动停止在 2 秒门禁内恢复；自动硬超时也会终止、重建 Worker、重新发送内容包注册表并恢复统计页面交互。

## 8. 未验证缺口与已知风险

- 未运行完整 `npm run test:e2e`；当前只有 3 个本批专项 Playwright 场景。
- 未在真实 Android Chrome/WebView、移动浏览器、Electron 和低性能设备上执行长时间压力测试。
- 未执行 `npm run test:server`、`npm run test:ops`、`npm run test:native`、`npm run licenses:check` 或原生包启动/签名门禁；本批未修改服务端，但正式发布矩阵仍必须补齐。
- 计算保护采用确定性的迭代/计划次数预算，不是硬墙钟中断。单次极端复杂规划仍可能比普通任务慢；当前单测要求低于 500ms，真实夹具最大 28.51ms，但不能承诺任意第三方内容包都相同。
- 高频材料变化会使递归计划缓存失效并降低性能，但优先保证结果正确；不得为提高命中率放宽材料快照校验。
- Worker 被强制终止时，尚未提交的时间扭曲切片按设计不计入收益。提示文案已经明确，但发布前仍需验证移动端停止按钮和应用切后台场景。
- `productionHistory` 的样本密度随 Worker 提交边界变化；玩法状态一致，但统计图短窗形状可能与单个长请求不同。
- 当前工作区没有独立 `1.0.29` Git 提交，无法从现有 `HEAD` 直接证明哪些相邻 hunk 属于本批。

## 9. 开发制品与追踪信息

| 字段 | 当前值 |
| --- | --- |
| Commit SHA | `unknown`：尚未创建独立 `1.0.29` 提交 |
| Base HEAD | `1cc7394fdee2a77f48e0707d1bb73d19ad799487`，仅作共享工作区基点 |
| Build ID | `unknown`：尚未生成 `1.0.29` 构建 ID |
| Web artifact path | `unknown / not created` |
| API artifact path | `unknown / not created` |
| Windows artifact path | `unknown / not created` |
| Android artifact path | `unknown / not created` |
| Manifest | `unknown / not created` |
| Aggregate SHA-256 | `unknown / not created` |
| Native signatures | `unknown / not verified for 1.0.29` |

缺少以上项目意味着本文件是开发交接，不是可直接部署的发布清单。

## 10. Release Agent 必须完成的门禁

1. 等待当前 `1.0.28` 发布工作结束并确认实际生产基线；读取本文件、`docs/RELEASE_HANDOFF_1.0.28.md`、当前 `git status --short` 和相关 diff。
2. 在独立干净工作树/分支中提取本批相关 hunk，创建唯一 `1.0.29` 提交；不得覆盖 `1.0.28` 改动，也不得从 dirty 工作区直接打包。
3. 将应用版本、公告、Android versionCode、桌面元数据和 Build ID 一致提升到 `1.0.29`；公告不得混入未完成或未发布功能。
4. 从该干净提交重新执行 `npm ci`、typecheck、完整 Vitest、server/ops/native/licenses、完整 Playwright、生产构建和真实夹具专项。任何失败都必须回到开发角色修复，禁止发布时热改源码。
5. 生成不可变 Web/API/Windows/Android 制品和 manifest，记录每个文件哈希与 aggregate SHA-256；验证 Android 长期签名证书连续性、Windows 签名实际状态、包内版本/API/更新源和隔离启动。
6. 使用只读副本再次验证 GameState v46、envelope v2、云 schema v7、44,311 堆叠、递归 job/WIP、线路/物流/量子库存、保存重载和 60 秒持续提交。
7. 获得明确发布授权后，按既有备份、未激活目录验证、健康探针、原子切换和固定回滚指针流程处理指定节点和下载页；本文不包含服务器密钥或签名机密。
8. 发布后验证 `version.json`、Service Worker、Build ID、公告、API health、旧 hashed asset 回退、两类安装包完整下载/Range/哈希/签名，以及桌面和移动端真实停止操作。

## 11. 发布公告草案

### 1.0.29 稳定性热修

- 修复高堆叠建筑制造中心执行复杂递归制造时长期占满模拟 Worker，导致托盘、传送带、生产进度和统计数字长时间不刷新的问题。
- 建筑制造任务现在按安全预算分段执行并复用递归计划；任务、WIP、材料、目标库存和制造进度不会因计算保护而丢失。
- 普通模拟与时间扭曲使用有限 Worker 切片；慢任务会自动降档，积压时间继续保留。
- 优化时间扭曲停止流程。停止后不再无限等待卡住的切片，超时会重建 Worker 并恢复界面操作；未提交切片会明确提示且不计入收益。
- 存档仍为 GameState v46，云存档和玩法规则不变。

公告中的版本、构建 ID、平台、测试数量和上线状态必须由 Release Agent 按最终制品和生产验收结果补齐。

## 12. 回滚边界

- 代码回滚目标应是发布时实际验证的 `1.0.28` 不可变目录和提交，当前无法预填，记为 `unknown`。
- 本批无数据库、GameState、envelope 或云 schema 迁移；代码回滚不需要恢复或重写玩家数据库。
- 回滚不得删除玩家递归任务、库存、线路、云修订、备份或旧 hashed assets。
- 若只出现时间扭曲停止回归，可回滚调速/停止协调代码，但必须保留普通模拟 2 秒上限和建筑制造计算预算，避免重新引入 P0 软卡死。
- 若建筑制造缓存出现正确性异常，优先关闭/回滚运行时缓存并保留预算保护；不得清空制造目标或 WIP 作为修复手段。
