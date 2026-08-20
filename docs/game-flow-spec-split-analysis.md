# game-flow.spec.ts 拆分分析与方案（已执行）

> 目的：`tests/e2e/game-flow.spec.ts` 是 E2E 的最大单文件瓶颈（约 357KB / 105 个 test / 0 个 describe），即使 E2E 已开并行 worker，该文件仍只在单一 worker 上串行执行。
> 状态：**已完成拆分并验证**（2026-08-17，分支 `codex/test-split-game-flow`）。测试逻辑零改写，仅做机械文件切分。

## 0. 执行结果

- 原文件拆分为 6 个分文件，`game-flow.spec.ts` 已删除：
  - `game-flow-menu-cloud.spec.ts`（9 tests）
  - `game-flow-onboarding-mobile.spec.ts`（16 tests）
  - `game-flow-logistics.spec.ts`（19 tests）
  - `game-flow-megastructure.spec.ts`（27 tests）
  - `game-flow-canvas-settings.spec.ts`（24 tests）
  - `game-flow-campaign-galaxy.spec.ts`（10 tests）
- 验证：
  - `npx playwright test --list`：总数 **413 tests / 70 files**（拆分前 413/65），game-flow 相关 **105**，数量一致 ✅
  - 6 个分文件全量跑：**104 passed / 1 failed（2.2 分钟）**；失败项 `box selection copies...` 为 4-worker 并行下的偶发 5s 超时，**串行复跑通过（16.7s）** ✅
  - 结论：105 个 test 语义完整保留；并行偶发超时是 E2E workers 提高后的已知观察（见 5.2）
- 切分方式：**头部 44 行 + test 块之间的共享定义 gap（约 1543 行）完整复制到每个分文件**，test 块以“无缩进顶格 `test(` 开始、无缩进顶格 `});` 结束”为边界整块移动，零改写。

## 1. 当前结构事实

| 指标 | 值 |
| --- | --- |
| 文件大小 | 约 357 KB |
| `test(...)` 数 | 105 |
| `test.describe` / `test.describe.serial` | **0**（全部扁平 `test()`） |
| `beforeAll` | 0 |
| `beforeEach` | 1（全文件统一，按 `testInfo.title` 分支） |
| module 级可变状态 | **无**（仅有 2 个不可变 `Set` 常量） |
| 跨 test 状态依赖 | **无**（Playwright 每个 test 独立 context/localStorage） |

## 2. 依赖分析结论

**拆分风险低**，因为：

1. **没有 describe 序列依赖**：105 个 test 彼此独立，任一 test 可移动到任意文件而不改变执行语义。
2. **没有跨 test 可变状态**：module 级只有两个按标题匹配的常量集合：
   - `testsManagingOfflineReport`（3 个 test 不自动关闭“离线结算报告”对话框）
   - `testsManagingOnboarding`（3 个 test 不自动 dismiss 新手引导）
3. **共享代码很小**，全部可以无损抽取到共享 helper 文件：
   - `installTestBootstrap(page)`（注入 test-bypass-menu + 公告已读）
   - `dismissOnboarding(page)`（关闭新手引导）
   - `test.beforeEach(...)`（含两个 title 白名单分支 + `addLocatorHandler`）
4. **imports 纯净**：`engine` / `storage` / `settings-helpers` 均为纯导入。

## 3. 拆分方案（实际执行方式）

### 3.1 共享代码复制（非 helper 抽取）

实际执行采用**更保守的复制方案**（避免 import/noUnusedLocals 风险）：

- 原文件第 1–44 行（imports + `installTestBootstrap` + `dismissOnboarding` + 两个 title 白名单 `Set` + `test.beforeEach`）作为共享头部，**完整复制**到每个分文件。
- test 块之间的共享定义 gap（约 1543 行，含 `freshGame`、`createTouchPage`、`openInterstellarGame`、`openBlueprintStageGame`、`openCampaignEndgameStageGame` 等顶层函数/常量）同样**完整复制**到每个分文件。
- 代价是每份文件有共享代码重复；后续可再独立抽取 helper 优化（不影响本次语义安全）。

### 3.2 按功能域拆分（6 个文件，实际数量）

| 新文件 | test 数量 | 内容域 |
| --- | --- | --- |
| `game-flow-menu-cloud.spec.ts` | 9 | 菜单门、发布公告、运维面板、云账号安全、云存档冲突/上传、注册登录 |
| `game-flow-onboarding-mobile.spec.ts` | 16 | 新手引导、基础采矿/建造、移动端操作 |
| `game-flow-logistics.spec.ts` | 19 | 传送带、配方、设备升级、统计、管理 |
| `game-flow-megastructure.spec.ts` | 27 | 建造自动化、能源、化工、星际物流、区域/蓝图 |
| `game-flow-canvas-settings.spec.ts` | 24 | 画布工具、设置持久化、字体缩放、性能模式 |
| `game-flow-campaign-galaxy.spec.ts` | 10 | 战役、银河排行、端局控制台、可访问性 |

> 边界以“无缩进顶格 `test(` 开始、无缩进顶格 `});` 结束”为准；每个 test 整块迁移，内部零修改。

### 3.3 保持不变项

- 105 个 test 的**标题、断言、seed、交互序列全部原样保留**。
- title 白名单机制原样复制（标题不变，白名单无需改动）。
- `settings-helpers.ts` 等既有共享文件不碰。

## 4. 执行步骤（已按此完成）

1. 独立分支 `codex/test-split-game-flow`，基线：当前 HEAD。
2. 用切分脚本（`gen-game-flow-split.mjs`）按顶格边界切出 105 个 test 块，收集共享头部 + gap。
3. 生成 6 个分文件（头部 + gap + 本组 test 块），删除旧 `game-flow.spec.ts`。
4. 验证三关：
   - `npx playwright test --list` 总数 413/70、game-flow 105（与移动前一致）；
   - 6 个分文件全量 104/105 通过，唯一失败项串行复跑通过（并行偶发超时）；
   - 拆分脚本已保留在 `artifacts/release-ops/1.0.44-3e580c715a5a/gen-game-flow-split.mjs` 供审计。

## 5. 风险与规避

| 风险 | 规避 |
| --- | --- |
| 移动时误改断言/seed | 机械整块移动；diff 只允许出现 import 与 `beforeEach` 样板行 |
| title 白名单跨文件失效 | 白名单集中在 helper，标题不变即可 |
| 某个 test 隐式依赖其他 test 的 localStorage | 已确认 Playwright 每 test 独立 context，无此依赖；拆分后仍各自独立 |
| 分文件间 seed/工厂配置重复 | 每个 test 自带 seed，移动后不改变；未来可再抽取 seed helper（不在本次范围） |
| `--list` 计数不符 | 作为硬门禁，先于全量跑，失败即停止 |
