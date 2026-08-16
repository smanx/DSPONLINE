# game-flow.spec.ts 拆分分析与方案（待执行）

> 目的：`tests/e2e/game-flow.spec.ts` 是 E2E 的最大单文件瓶颈（约 357KB / 105 个 test / 0 个 describe），即使 E2E 已开并行 worker，该文件仍只在单一 worker 上串行执行。本文档先做依赖分析并给出拆分方案；**实际拆分需按“独立任务”执行，不改变任何断言/测试语义**。
> 状态：分析完成，待拆分执行（执行前需用户授权一次，因为会大幅改动测试文件布局）。

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

## 3. 拆分方案

### 3.1 抽取共享 helper

新建 `tests/e2e/game-flow-helpers.ts`：

```ts
import { test, type Page, type TestInfo } from "@playwright/test";

export async function installGameFlowBootstrap(page: Page) { /* 现 installTestBootstrap 原样移动 */ }
export async function dismissGameFlowOnboarding(page: Page) { /* 现 dismissOnboarding 原样移动 */ }
export async function beforeEachGameFlow(page: Page, testInfo: TestInfo) {
  // 现 test.beforeEach 逻辑原样移动（含两个 title Set 与 addLocatorHandler）
}
```

各分文件统一：

```ts
test.beforeEach(async ({ page }, testInfo) => {
  await beforeEachGameFlow(page, testInfo);
});
```

### 3.2 按功能域拆分（6 个文件）

| 新文件 | test 数量（估） | 行范围（现文件） | 内容域 |
| --- | --- | --- | --- |
| `game-flow-menu-cloud.spec.ts` | 9 | 45–626 | 菜单门、发布公告、运维面板、云账号安全、云存档冲突/上传、注册登录 |
| `game-flow-onboarding.spec.ts` | 12 | 2138–2520 | 新手引导、基础采矿/建造/移动端操作 |
| `game-flow-logistics.spec.ts` | 22 | 2658–3340 | 传送带、配方、设备升级、统计、管理 |
| `game-flow-megastructure.spec.ts` | 24 | 3398–4600 | 建造自动化、能源、化工、星际物流、区域/蓝图 |
| `game-flow-canvas-settings.spec.ts` | 20 | 4604–5708 | 画布工具、设置持久化、字体缩放、性能模式 |
| `game-flow-campaign-galaxy.spec.ts` | 18 | 5746–6283+ | 战役、银河排行、端局控制台、可访问性 |

> 实际分割时以“test 函数边界”为准，不按行硬切；每个 test 整体迁移，内部零修改。

### 3.3 保持不变项

- 105 个 test 的**标题、断言、seed、交互序列全部原样保留**。
- title 白名单机制保留在 helper 中（标题不变，白名单无需改动）。
- `settings-helpers.ts` 等既有共享文件不碰。

## 4. 执行步骤（拆分时按此做）

1. `git worktree` 或独立分支，基线：当前 HEAD。
2. 创建 `game-flow-helpers.ts`，移动 2 个 helper + beforeEach 逻辑（仅 import 路径变化）。
3. 按功能域创建 6 个分文件，**机械移动** `test(...)` 块（整块剪切粘贴，零改写）。
4. 每个分文件加 `import` + `test.beforeEach(...)` 调用共享 helper。
5. 删除旧 `game-flow.spec.ts`。
6. 验证三关：
   - `npx playwright test --list` 的 test 总数仍为 **105**（移动前后 diff 为 0）；
   - 全量 E2E 通过数不变（当前 413 tests / 65 files → 拆分后 413 tests / 70 files）；
   - `game-flow-*` 六个 spec 单独跑全部通过。
7. 更新 `test:e2e:fast` 的 grep 清单（若需要），并更新本文档与 `RELEASE_RUNBOOK_CHECKS.md` 第 9 节。

## 5. 风险与规避

| 风险 | 规避 |
| --- | --- |
| 移动时误改断言/seed | 机械整块移动；diff 只允许出现 import 与 `beforeEach` 样板行 |
| title 白名单跨文件失效 | 白名单集中在 helper，标题不变即可 |
| 某个 test 隐式依赖其他 test 的 localStorage | 已确认 Playwright 每 test 独立 context，无此依赖；拆分后仍各自独立 |
| 分文件间 seed/工厂配置重复 | 每个 test 自带 seed，移动后不改变；未来可再抽取 seed helper（不在本次范围） |
| `--list` 计数不符 | 作为硬门禁，先于全量跑，失败即停止 |
