# DSPidle2 1.0.27 开发交接

> 状态：Development complete / Not released
> 日期：2026-08-04
> 角色：Development Agent

## Task ID / title

`DSP-1.0.27-P2-SELECTION-BATCH`

本批包含四项开发需求：连接点与连线圆圈尺寸偏好、建筑制造中心批量目标、混合选区批量增加建筑/传送带数量、移动端大选区稳定性。

## Source and evidence

- 用户需求：1.0.27 下一批开发汇总（四项）。
- 现有基线：GameState v46、存档 envelope v2、云 schema v7。
- 当前工作区含 1.0.26 发布准备及离线/亮色主题等其他 Agent 的未提交修改；本批没有 reset、checkout、清理或覆盖这些修改。

## Implemented behavior

### 1. 连接点和连线圆圈尺寸

- 设置中提供“默认”“放大 25%”“放大 50%”。
- 偏好使用 `dsp-idle-network.ui.connection-point-size.v1` 保存到本机 `localStorage`，不写入 GameState、存档或云端。
- 同一比例同时应用于端口/端点视觉尺寸、连接预览圆圈、React Flow `connectionRadius` 和空间索引命中半径。
- 粗指针媒体规则使用同一 CSS 变量，避免移动端命中范围与视觉圆圈错位。
- 设置切换不重置视口、选择、建筑位置或模拟状态。

### 2. 建筑制造中心一键设置目标

- 建筑制造中心增加“全部建筑目标”操作，显示受影响的已解锁可制造建筑种类数量。
- 提供 `100`、`1,000`、`10,000` 和自定义目标；自定义只接受正安全整数，最大 `100,000,000`。
- 应用前使用统一游戏内确认弹窗。
- `setConstructionAutomationTargetsForBuildings` 一次复制并提交目标映射，只改目标库存，不生成建筑、不扣除全部材料、不取消现有任务、WIP 或进度。
- 仍受建筑仓储科技限制；未完成建筑仓储扩容 II 时拒绝超出当前科技上限。

### 3. 混合选区批量增加

- 桌面和新版移动端选区操作栏提供 `+1`、`+10`、`+100` 和自定义增加量。
- 自定义增加量仅接受 `1`～`1,000,000` 的正安全整数。
- `batchIncreaseSelection` 先计算所有建筑/线路变化、材料需求和上限命中，再一次性复制状态并扣料。
- 建筑单体新增总量遵守 `MAX_BUILDING_STACK_COUNT = 100,000,000`；传送带并联遵守 `MAX_BELT_LANES = 4096`。达到上限的项目保持不变并返回计数。
- 建筑和传送带混合选择时分别使用对应施工物料；任一物料不足时整批不变，不产生负库存、免费增加或部分扣料。
- 不可堆叠、锁定或历史超限项目不会被静默压缩。

### 4. 移动端多选稳定性

- 选择模式下忽略 React Flow 在节点刷新期间发出的瞬时空选择事件。
- 选择模式下阻止画布冒泡路径清空当前选区。
- 选择 refs 在点击更新时立即同步，模拟刷新、检查器更新和 React Flow 重派生不会操作旧选区。
- 节点保留持续选中轮廓、底色和“已选中”标识；点击、触摸多选和后续画布刷新保持一致。

## Changed files

本批相关文件如下；这些文件中的部分行也承载工作区已有的其他开发态改动，发布 Agent 必须以干净、可追溯的合并提交重新构建：

- `src/App.tsx`
- `src/game/engine.ts`
- `src/game/uiPreferences.ts`
- `src/game/uiPreferences.test.ts`
- `src/game/p2SelectionBatch.test.ts`
- `src/components/OperationsWorkspace.tsx`
- `src/components/ConstructionCenterWorkspace.tsx`
- `src/components/mobile/MobileFactoryPanels.tsx`
- `src/styles.css`
- `tests/e2e/v127-selection-batch.spec.ts`

相关既有 dirty worktree 文件包括 `src/game/offlineSimulation*`、亮色主题/设置页、画布性能和其他版本交接文档；本批没有回退它们。

## Compatibility and data preservation

- GameState 仍为 v46。
- 存档 envelope 仍为 v2，云 schema 仍为 v7；没有新增持久字段，也没有迁移。
- 连接点尺寸、设置分类和选区界面状态均为设备级 UI 偏好，不进入存档、云存档、排行榜或状态哈希。
- 批量命令只能通过 `commitGame`/现有纯函数修改权威状态。
- 旧存档中的历史安全整数、历史超限堆叠、线路缓存和制造任务不会被压缩或删除。

## Validation executed

以下结果均为本次当前工作区重新执行的结果：

| Command | Result |
| --- | --- |
| `npm run typecheck` | 通过，TypeScript 0 错误 |
| `npm test -- --run` | 82 个测试文件通过，3 个跳过；714 项通过，12 项跳过 |
| `npm run build` | 通过；Vite 转换 1,875 个模块。仅有既有的大 chunk 警告，无构建失败 |
| `npx playwright test tests/e2e/v127-selection-batch.spec.ts --workers=1` | 3/3 通过，约 7.3 秒 |
| `git diff --check` | 通过（`src/theme.css` 仅报告 CRLF 转换提示） |

新增 Playwright 覆盖：

1. 设置“放大 50%”后视觉 handle 计算为 `27px`，并验证画布 data 属性。
2. 桌面混合选区显示批量增加入口、确认弹窗和成功提示。
3. 新版手机逐点多选在画布刷新后仍保持 2 个节点选中。

Playwright 使用 `playwright.config.ts` 的 `4319` 端口和单 worker；最终运行复用了当前工作区 Vite 服务。若服务端口或进程来自其他测试，发布前应停止旧服务后重新启动一次，避免端口复用造成假阳性。

## Artifact and commit status

- Commit SHA：`not created`。当前工作区是 dirty 的多 Agent 开发树，不能把未隔离的构建当作发布提交。
- Manifest / aggregate hash：`not generated`。
- `dist/` 已由本次 `npm run build` 生成，但它来自当前 `package.json` 的 `1.0.25` 版本号，不是 1.0.27 不可变制品。
- 未执行 VPS、下载页、生产切换、原生签名或发布清单上传。

## Release Agent gate

发布 1.0.27 前必须：

1. 在保留 1.0.26 发布 Agent 改动的前提下整理一个干净、可追溯的 1.0.27 提交，并明确包含本交接列出的文件。
2. 将应用/公告/构建 ID 正式提升到 `1.0.27`，重新运行 `npm run typecheck`、完整 Vitest、`npm run build`、相关 Playwright，以及发布所需的 server/ops/native 门禁。
3. 生成 release manifest、聚合 SHA-256 和新的 Web/桌面/Android 制品；签名连续性、GameState v46、envelope v2、cloud schema v7 必须复验。
4. 在香港、上海及下载页执行既有备份、隔离启动、健康检查、原子切换和回滚指针流程。此文档不授权发布。
5. 发布后验证连接点偏好不进入存档、建筑目标和批量增量的库存守恒、移动端 5/10/20/50 选区稳定性，并保留 1.0.26 作为代码和资源回滚目标。

## Unverified gaps and risks

- 本次未运行完整 `npm run test:e2e`，也未在真实 Android WebView、Electron、平板横屏或 200% 字号下执行设备实测。
- Playwright 移动用例验证了选择刷新稳定性，但当前夹具只有 2 个节点；5/10/20/50 个建筑的真实密集存档帧率、节点重渲染次数和 `pointercancel` 统计仍需发布前专项验证。
- 本次没有完整验证 4096 并联线路在真实玩家存档中的材料汇总与边界提示，只覆盖纯函数边界单测和混合选区路径。
- 工作区仍有其他 Agent 未提交修改；发布 Agent 不得直接从当前 dirty 树打包，应先完成冲突审查、版本确认和独立构建。

## Rollback

代码回滚目标应为 1.0.26 的已验证发布目录/制品；数据回滚不在本批范围内。若 1.0.27 的 UI 偏好出现问题，可删除对应设备级 `localStorage` 键或关闭新入口，不需要修改或删除玩家存档。
