# DSPidle2 1.0.32 开发与发布交接

> 状态：Release complete / 已发布
> 日期：2026-08-07
> 角色：Development Agent + Release Agent
> 发布授权：用户已在本任务中明确授权香港/上海 VPS、下载页和安装包发布；按发布安全边界未使用生产账号执行写测试

## 1. 交接结论

1.0.32 的补充开发、最终门禁和生产发布均已完成。本批不改变 GameState v46、存档 envelope v2、云 schema v7 或排行榜服务端校验口径；真实夹具没有上传到生产账号，生产数据库没有恢复、替换或初始化。最终生产证据见 [1.0.32 发布记录](./releases/1.0.32.md)。

本批包含四项交接任务：

- `V1032-SPEEDRUN-COLLAPSE`：速通状态面板可折叠，折叠后只保留计时窗口，并保存设备级偏好。
- `V1032-RECURSIVE-OIL-INVARIANTS`：统一施工托盘、物品递归手搓和建筑制造中心的递归上游策略；允许 `plasma_refining` 作为内部原油上游，按目标物品净产出过滤循环配方。
- `V1032-OFFLINE-RESEARCH-COMPLETION`：修复离线/纯挂机跨科研完成边界后投入已满但科技不完成的问题；旧 v46 存档加载和模拟边界执行幂等自愈。
- `V1032-RELEASE-HISTORY-PAGING`：修复公告详情态直接跳页无效，并保证历史版本详情渲染静态数据中的全部更新条目。

同时完成方案 2 的宏观纯挂机实验原型：独立 Worker 执行 3×10 秒校准，使用 IndexedDB 检查点/心跳、Web Lock 与可过期租约防止重复结算；候选状态必须经过存档序列化、迁移和安全校验后才可提交。页面进入后台后高倍率只保留 300 秒宽限；恢复时先重建这段宏观候选，超过部分交给普通离线 Worker。活动普通科研或无限科研时不进入宏观仿射合同，而使用精确 Worker；启动发现含活动科研的旧检查点时保留检查点，并提供“放弃未结算并继续普通模拟”操作。

## 2. 来源与基线

### Task ID / title

`V1032-SPEEDRUN-COLLAPSE`、`V1032-RECURSIVE-OIL-INVARIANTS`、`V1032-OFFLINE-RESEARCH-COMPLETION`、`V1032-RELEASE-HISTORY-PAGING`。

### Source and evidence

- [1.0.32 补充开发提示词](./feedback/2026-08-06-v1.0.32-补充开发提示词.md)
- [方案 1](./feedback/2026-08-06-方案1.md)
- [方案 2：宏观纯挂机与终局指标](./feedback/2026-08-06-方案2-宏观纯挂机与终局指标.md)
- 速通面板、科研站和公告历史截图已在开发阶段只读核对；真实存档只读夹具未上传到生产账号。

### Reproduction / observed evidence

- 面板展开态固定占用画布右上区域；折叠后需要从布局和无障碍树中移除目标列表。
- 递归规划器此前以“直接手搓权限”过滤上游，导致原油不能进入精炼油链；氢分馏的总输出判断还会把 `10 氢 -> 9 氢 + 1 氘` 错当作氢生产。
- 科研完成只在研究站消耗周期内触发；离线/宏观路径可能只外推 `progressByTech`，留下投入达到成本但未执行奖励和队列切换的状态。
- 公告详情页的页码选择器此前只更新 `historyPage`，历史列表未打开时 `selectedReleaseId` 不变；历史静态数据中若只保留一条 item，详情自然无法展示完整更新。

### User-visible acceptance criteria

- 速通面板展开态与旧行为一致；折叠态只显示计时、状态图标和展开按钮，刷新、返回主页、切换工作区后偏好保持。
- 三条递归制造路径使用同一策略；原油不足时准确提示原油，氢分馏不得被用来伪造氢；规划失败原子不扣料，成功保留副产氢并与执行库存一致。
- 离线、纯挂机、Worker 返回、命令切换和加载 v46 存档后，已满足成本的科技只完成一次、奖励只发一次、队列合法续接；取消或恢复不清空科研投入。
- 页面隐藏或硬关闭后，高倍率宏观最多结算后台 5 分钟；剩余时间只能走普通离线结算，恢复/保存失败时原主存档和检查点保持不变。
- 公告详情态直接跳到任意历史页立即打开对应列表，任意历史版本显示完整静态更新条目，桌面/手机/大字号均可用。

### Compatibility / data preservation

- GameState 保持 v46；envelope 保持 v2；cloud schema 保持 v7；SQLite layout 保持 v2。
- 速通既有可选字段和计时/榜单规则不变；本批不增加速通资格或服务端排名旁路。
- 纯挂机恢复记录使用独立 IndexedDB 数据库 `dsp-idle-network.pure-idle-recovery`，不写入 GameState、云 payload 或状态 hash；旧恢复记录缺少 `startedPaused` 时按兼容默认值处理。
- 原存档只有在候选状态通过正式序列化和重载校验后才提交；失败、取消、Worker 崩溃或保存失败保留原存档和恢复日志。

### Target platforms

Chrome/Edge Web、Windows Electron、Android Chrome/WebView、PWA；桌面、手机竖屏/横屏以及 80%～200% 字号。

### Release target

`1.0.32`。最终 clean source commit 为 `762bf693becb97a62d8c1ce8de60bf6e9083f0cc`，Build ID 为 `1.0.32+762bf693becb`，Android 为 `1.0.32 / 1000032`；香港、上海和下载页均已发布。

## 3. 已实现内容

### 3.1 速通状态面板

- `SpeedrunStatusPanel` 增加折叠/展开按钮、Lucide 图标、`aria-label` 和悬浮提示。
- 折叠态只挂载紧凑计时内容，目标列表、进度条和资格说明不占布局。
- `dsp-idle-network.ui.speedrun-panel-collapsed.v1` 只保存设备级 UI 偏好，不进入存档或签名摘要。
- 触摸目标保持至少 44px；响应式样式覆盖窄桌面、390×844、844×390 和高字号。

### 3.2 递归制造与守恒

- `isHandcraftableRecipe` 与 `isRecursiveManufacturingRecipe` 分离。
- `plasma_refining` 仅作为内部递归上游；`xray_cracking`、`reforming_refine` 和状态转换配方仍保持禁止。
- `getRecipeNetOutput()` 汇总同一物品的输入/输出后按净产出筛选，批次数按净产出计算。
- 施工托盘、物品手搓、建筑制造中心的规划、最大批数、灰锤缺料和缓存分析统一调用新策略。
- 递归规划失败不改变状态；成功路径按原子库存事务提交，并保留正常副产物。

### 3.3 科研边界与安全恢复

- `settleCompletedResearchBoundariesInPlace()` 是唯一幂等边界修复入口，完成奖励、队列切换和研究站进度重置。
- `advanceSimulationSession`、`completeSimulationAdvanceSession`、科研命令和 `storage.migrateGame` 均调用边界修复。
- 宏观纯挂机在活动科研时安全拒绝；普通精确 Worker 继续负责科研收益。
- 恢复日志包含 checkpoint、heartbeat、租约、墙钟进度、错误摘要和开始前暂停状态。
- Worker 失败时从未提交 checkpoint 重建；“放弃未结算并继续普通模拟”先修复科研、保存并读回，再清理恢复日志。

### 3.4 公告历史

- 页码选择统一打开历史列表并限制边界；详情态直接跳页不再是无效果控件。
- `showRelease` 同步计算所属页，详情/列表往返保持页码和滚动位置。
- 历史公告使用离线静态数据，详情遍历完整 `items`，未知图标使用稳定回退图标；不把当前公告内容静默套给历史版本。

## 4. 宏观纯挂机实现边界

- Worker 算法版本：`pure-idle-macro-v2`。
- 校准：固定 3 个 10 秒模拟窗口；稳定模式有 10 分钟影子校验，终局极限模式只使用宏观合同和即时操作对象刷新。
- 合同只允许可证明的累计/库存增量，冻结或拒绝航线 cargo、路线 progress、传送带流量、功率诊断等瞬时字段；候选最终执行非负、容量、有限数值、资源守恒、序列化重载门禁。
- 纯挂机停止以墙钟边界为准，已提交预算只结算一次；未提交预算不会在主线程补算。开始前已暂停的工厂停止后恢复暂停，运行中的工厂正常停止后恢复运行。
- 当前并非完整的行星/物品/量子/矿脉生产域账本。复杂物流、有限矿脉、流体循环、量子状态或建造中心出现未建模边界时，必须继续使用精确路径或明确阻止宏观会话；不得把当前实验宣称为任意存档的 30 秒硬保证。
- 后台策略：`backgroundStartedAtMs` 只存在恢复日志；隐藏/`pagehide` 时记录一次边界，`getPureIdleBackgroundPlan()` 将 `startedAtMs → backgroundStartedAtMs + 300s` 归入宏观，其余归入普通离线秒数。新启动没有 `pagehide` 标记时使用最后一次持久心跳作为保守边界，避免硬关闭恢复无限高倍率时间。
- `App` 使用运行时单飞互斥，避免可见性事件和 1 秒定时器并发重建/保存两个候选；普通离线 Worker 失败、取消或主存档写入失败都会保留原主档和恢复记录。

## 5. 当前验证结果

### 5.1 单元与构建

| 命令 | 当前结果 |
| --- | --- |
| `npm run typecheck` | 通过，0 个 TypeScript 错误 |
| 专项 Vitest（8 个文件） | 352/352 通过 |
| `npm test -- --run` | 89 个文件通过、5 个跳过；806 项通过、16 项跳过；0 失败 |
| `npm run licenses:check` | 128 个运行时包一致 |
| `npm run test:server` | 49/49 通过 |
| `npm run test:ops` | 6/6 通过 |
| `npm run test:native` | 8/8 通过 |
| `npm run build` | 从最终 clean commit 重跑通过 |
| `git diff --check` | 通过 |

### 5.2 浏览器专项

| 命令/夹具 | 结果 |
| --- | --- |
| `npx playwright test tests/e2e/ui-visual-feedback.spec.ts --workers=1` | 6/6 通过 |
| `npx playwright test tests/e2e/speedrun.spec.ts --workers=1` | 2/2 通过 |
| 相关构造中心/速通/教程/宏观专项合并运行 | 8 通过、3 跳过、0 失败 |
| `DSP_PURE_IDLE_MACRO_FIXTURE=dsp-idle-save-2026-08-05 (1).json npx playwright test tests/e2e/v132-pure-idle-macro.spec.ts --workers=1` | 3/3 通过；30 天耗时 15,447 ms |
| `DSP_PURE_IDLE_MACRO_FIXTURE=dsp-idle-save-2026-08-02 (1).json npx playwright test tests/e2e/v132-pure-idle-macro.spec.ts --workers=1` | 3/3 通过；30 天耗时 4,598 ms |

两份真实夹具均只读加载，源 hash 不变；最终状态 `inspectSave()` 有效，航线 cargo 为非负安全整数、progress 在 `[0,1]`，实体数和线路数保持不变，30 天墙钟秒数完整推进。

### 5.3 全量 Playwright

最终 clean commit 的 `npm run test:e2e` 为 242 项通过、11 项显式可选夹具/故障注入跳过、0 失败。两份真实夹具各有 5/5 只读验证通过，覆盖 5 分钟宽限、普通离线尾段、取消/崩溃恢复和正式存档重载。

## 6. 修改文件

开发阶段共享工作区涉及的源代码、测试和文档文件如下；当时因混有先前批次未提交修改，Release Agent 逐 hunk 审查后提取到独立 clean commit。该列表保留用于审计，主工作树没有被整文件覆盖、reset 或 clean：

- `src/App.tsx`
- `src/components/ReleaseNotesDialog.test.ts`
- `src/components/ReleaseNotesDialog.tsx`
- `src/components/SpeedrunStatusPanel.tsx`
- `src/components/TimeWarpIdleOverlay.tsx`
- `src/components/TutorialWorkspace.tsx`
- `src/game/engine.test.ts`
- `src/game/engine.ts`
- `src/game/offlineApproximation.test.ts`
- `src/game/offlineApproximation.ts`
- `src/game/pureIdleMacro.test.ts`
- `src/game/pureIdleMacro.ts`
- `src/game/pureIdleMacro.worker.ts`
- `src/game/pureIdleMacroClient.ts`
- `src/game/pureIdleRecovery.ts`
- `src/game/recursiveCrafting.test.ts`
- `src/game/recursiveCrafting.ts`
- `src/game/storage.test.ts`
- `src/game/storage.ts`
- `src/game/uiPreferences.test.ts`
- `src/game/uiPreferences.ts`
- `src/styles.css`
- `src/styles/time-warp-idle.css`
- `tests/e2e/construction-automation-stability.spec.ts`
- `tests/e2e/speedrun.spec.ts`
- `tests/e2e/v115-pure-idle-tutorial.spec.ts`
- `tests/e2e/v132-pure-idle-macro.spec.ts`
- `docs/ARCHITECTURE.md`
- `docs/PROJECT_STATUS.md`

### Commit / artifacts

- 构建基线：`7d07618b9517ceb63aeb011dcad093a9c0db9b60`；隔离分支：`codex/release-1.0.32`。
- 1.0.32 clean source commit：`762bf693becb97a62d8c1ce8de60bf6e9083f0cc`；Build ID：`1.0.32+762bf693becb`。
- package / Android：`1.0.32` / `1000032`；server package 保持独立版本规则 `0.4.0`。
- Web/API、Android、Windows、稳定清单和下载页均从最终提交生成；149 文件清单聚合 SHA-256 为 `26f858bb95a6ba8f95fff8bbcfd81d0bb614dbfbf9f1cf3fd08906b186c18461`。
- 香港、上海 Web/API 和上海下载页已发布；本地夹具保持只读，生产数据库只执行一致性备份，没有写入测试存档。

## 7. 未验证项目与剩余风险

1. 宏观纯挂机仍是受保护的广义仿射合同，不是方案 2 的完整生产域账本；复杂流体/量子/有限矿脉/在途物流/建造中心场景可能回退精确或被资格门禁拒绝。
2. 真实夹具当前在桌面 Chrome 验证；Android Chrome/WebView、Electron、低内存设备和后台挂起/崩溃恢复尚未完成长时压力验证。Node/RSS 内存峰值不能直接推断移动端安全。
3. 本地 E2E 的 `/api/analytics`、`/api/health`、`/api/presence`、`/api/public-status` 等请求曾记录 `ECONNREFUSED 127.0.0.1:65534`；这不是生产节点故障，但说明本轮没有运行本地 API 服务。
4. 服务端 49/49、运维 6/6、原生工具 8/8、许可证、原生签名和 release manifest 已完成；仍未执行真实生产账号云写入或排行榜提交。

## 8. Release Agent 门禁执行结果

1. 已从独立 clean worktree 的唯一源码提交 `762bf693...` 构建；主工作树和 `stash@{0}` 未被修改。
2. Web/API、Android、Windows、`version.json` 和稳定清单均绑定 `1.0.32+762bf693becb`；没有覆盖 1.0.31 制品。
3. 类型、单元、服务端、运维、原生工具、许可证、生产构建和完整 Playwright 均通过，精确数量见第 5 节。
4. 两份真实终局夹具在桌面 Chrome 各完成 5/5 只读验证；Edge、Android Chrome/WebView 和 Electron 长时夹具未执行，作为剩余风险保留。真实夹具未上传到生产账号。
5. 149 文件 immutable manifest、聚合 SHA-256、Android 长期证书连续性、Windows `NotSigned`、Service Worker/`version.json` 缓存和云 schema v7 兼容性均已核验。
6. 用户随后明确授予发布授权；香港、上海和下载页均按备份、新目录、原子切换、健康检查与回滚流程完成，未输出或写入任何密钥、密码或证书私钥。

## 9. 回滚边界

- Web/API 代码回滚到 `1.0.31-19040a9d1e45`；上海下载页直接回滚到原 `download-site-1.0.32-762bf693becb`，更深一层保留 1.0.31。
- 不删除或重写玩家 GameState、云存档、速通记录、递归 WIP、科研缓存或纯挂机 IndexedDB 恢复日志作为回滚手段。
- 若宏观合同校验、科研边界或 Worker 恢复出现问题，关闭宏观尝试并保留原精确 Worker；活动科研始终可走精确路径。
- 发布失败只切回旧代码目录，不恢复或替换生产数据库，除非按独立灾难恢复流程明确授权。

## 10. 2026-08-07 历史开发停止检查点

以下内容记录开发角色停止时的发布前状态，仅供审计；后续 Release Agent 已完成最终制品、完整 E2E 和生产发布，当前状态以本文顶部及 [正式发布记录](./releases/1.0.32.md) 为准。应用代码和发布工具的最后 clean source commit 为：

- `762bf693becb97a62d8c1ce8de60bf6e9083f0cc`（`codex/release-1.0.32`）
- 其父提交 `cfe95fca96717f8baf23bf80252dfd83b976bd5c` 曾生成一轮临时制品；正式发布没有复用这些制品，而是重新绑定 `1.0.32+762bf693becb`。
- `deploy/create-release-manifest.mjs` 已修复 bundle-root 清单写入路径字符串、导致 verifier 读取 undefined 的缺陷。

开发停止前从 `762bf693` 重新运行并通过：`npm ci`、`npm --prefix server ci`、`npm run licenses:check`（128 包）、`npm run typecheck`、`npm test -- --run`（89 文件：806 passed、16 skipped、0 failed）、`npm run test:server`（49/49）、`npm run test:ops`（6/6）、`npm run test:native`（8/8）、`npm run build`、`git diff --check`。当时最终 SHA 的全量 E2E 被中断；Release Agent 后续从同一 SHA 完整重跑 `npm run test:e2e`，结果为 242 项通过、11 项显式跳过、0 失败。

父提交上的 Chrome 只读真实夹具证据随后也在最终提交上复验：两份夹具各完成 30 天纯挂机宏观、5 分钟后台宽限、普通离线尾段、租约/检查点、Worker 崩溃恢复、取消和序列化重载；7.3 MB 约 4.2～4.8 秒，17.34 MB 约 14～15 秒，源文件 hash 均未改变。活动有限科研在单元测试和临时浏览器验证中均明确拒绝宏观合同并保持源状态不变；Edge、Android Chrome/WebView、Electron 长时真实夹具仍未验证。

以下父提交临时制品没有用于生产，不能当作最终 762bf69 制品：

- `D:\GameDev\DSPidle2-release-1.0.32\release\web-1.0.32-cfe95fca9671-clean.tar.gz`
- `D:\GameDev\DSPidle2-release-1.0.32\release\api-1.0.32-cfe95fca9671-clean.tar.gz`
- `D:\GameDev\DSPidle2-release-1.0.32\release\download-site-1.0.32-cfe95fca9671.tar.gz`
- `D:\GameDev\DSPidle2-release-1.0.32\release\update-feed-1.0.32-cfe95fca9671\`

父提交的 bundle manifest 曾因上述工具缺陷验证失败，因此没有复用。Release Agent 已从 `762bf693...` 重跑完整 E2E，重建并核验 Web/API/APK/EXE/blockmap/稳定清单/本地下载页，随后完成香港、上海和下载页发布；最终哈希、备份与回滚指针见 [正式发布记录](./releases/1.0.32.md)。
