# DSPidle2 1.0.28 开发交接

> 状态：Development complete / Not released
> 日期：2026-08-04
> 角色：Development Agent
> 发布授权：未授予；本文不授权 VPS、下载页、Web/API、桌面或 Android 发布

## 1. 范围与基线

本交接合并以下两份需求：

- `docs/UI_VISUAL_FEEDBACK_HANDOFF_2026-08-04.md`：亮色主题、设置分类、字体几何、科技树滚轮、版本历史、运行记录和物品悬浮交互。
- `docs/feedback/DEVELOPMENT_BATCH_HANDOFF_2026-08-04.md`：建筑/物流堆叠目标、科研喷涂、物流槽位紧凑布局、统计首屏性能、时间扭曲降档、白糖 `/min` 排行榜、统计星球顺序、原版重整精炼及配方审计。

代码工作区仍包含 1.0.27、离线/时间扭曲和其他 Agent 的未提交开发改动。当前 `package.json` 仍为 `1.0.25`，没有在开发任务中擅自改版本号；Release Agent 必须在审查后创建干净的 `1.0.28` 提交和不可变制品。

兼容边界保持不变：

- GameState v46；存档 envelope v2；云 schema v7；SQLite layout v2。
- 没有新增持久 GameState 字段，也没有迁移或清理历史物资、建筑、线路、载具、缓存、科技和生产记录。
- 主题、运行记录可见性、设置分类、连接点大小、画布性能和侧栏状态均为本机 UI 偏好，不进入存档、云端、排行榜或状态哈希。
- 所有玩法状态修改继续通过 engine 纯函数和 `commitGame`，没有在组件中直接删除或重建实体/线路。

## 2. 已实现功能

### 2.1 UI 视觉与设置重构

- 亮色语义主题覆盖开始菜单、存档/快照、云存档、物流塔、检查器、施工托盘、节点、线路、统计、科技树、弹窗、禁用/危险/选中状态和两套手机壳；深色主题保留原有表现。
- 主题首次挂载前读取设备偏好，显式亮色/深色/跟随系统跨菜单、刷新、PWA/桌面运行时保持；不改变 `GameState.settings.theme` 的兼容回退。
- 设置页按“画面与主题 / 终局性能 / 交互与控制 / 存档与云同步 / 统计与运行记录 / 教程、版本与其他”分组，分类偏好只写入设备 localStorage，返回时保留分类和滚动状态。
- 版本更新记录使用随包静态历史数据，按版本/日期倒序分页；详情只渲染当前版本，返回列表保留页码和滚动位置。
- 科技树区域将鼠标、触控板滚轮转换为横向滚动并消费事件，纵向滚动条和键盘仍可用。
- “显示运行记录”可以永久关闭普通浮条和自动记录面板；错误、成就、研究完成、存档失败和诊断提示继续显示。
- 物品悬浮卡只由图标/名称/数量触发，Portal 指针过渡、键盘焦点、移动点击/长按、定位和打开图鉴按钮保持可用。
- 终局节点在有配方时优先显示产物/配方名称，无配方显示“未设置配方”或建筑关键状态；左右侧栏可独立箭头收起，收起后画布回收空间且不清除选择。
- 字体 80%/100%/125%/150%/200% 不再改变节点世界尺寸、实体坐标、线路端点或 viewport；不足时设置布局切换为可读单列。

### 2.2 建筑/物流目标与批量操作

- 普通检查器统一为“堆叠目标”输入，支持最终数量 1～100,000,000；Enter/失焦提交，Escape 恢复真实数量；增加和减少使用同一原子 engine 命令。
- 目标大于当前值只扣除差额建筑，目标较小时完整返还差额；库存不足、锁定、非法输入、唯一建筑和上限失败时状态完全不变。
- 历史安全整数和历史超过一亿的堆叠不被静默压缩；历史超限只允许降低，不允许继续增加到更高值；矿脉只改变 `minerCount`，不改变矿脉储量。
- 独立物流管理页继续支持跨星球远程编辑，不切换 `activePlanetId`；降低物流塔堆叠不删除超额槽位库存、运输机/船、翘曲器、航线或缓存。
- 建筑制造中心“一键设置全部建筑目标”一次更新所有已解锁建筑目标，预设 100/1,000/10,000 和自定义；建筑仓储扩容 II 后上限为 100,000,000，现有 WIP/任务/进度不被取消。
- 混合建筑/传送带选区支持 `+1/+10/+100` 和 1～1,000,000 自定义增加；建筑遵守 `MAX_BUILDING_STACK_COUNT = 100,000,000`，线路遵守 `MAX_BELT_LANES = 4096`；材料不足整批原子失败，不免费增加、不产生负库存。
- 手机 5/10/20/50 项选择的权威 ID 与 React Flow 瞬时空选择解耦；模拟刷新、检查器刷新、触摸取消和多选不会清掉视觉高亮或其他已选对象。

### 2.3 物流塔槽位紧凑布局

槽位检查器改为五行紧凑布局，参考图片副本为 [logistics-station-slot-density.png](./feedback-assets/development-batch-2026-08-04/logistics-station-slot-density.png)：

1. 物品选择、输入数量、库存当前值/实际容量；空槽直接显示选择器。
2. 本地供应/需求/仓储。
3. 星际供应/需求/仓储；行星物流站隐藏这一行。
4. 起运比例 10%/25%/50%/100%。
5. 优先级和库存上限。

高频卡片隐藏航路策略、翘曲预算和 minStock 控件，但底层字段继续读取和保存；不重置航线、预留物资或在途货物。窄屏与粗指针下控件保持至少 44px 触控目标。

### 2.4 科研喷涂与重整精炼

- `matrix_research` 明确允许安装喷涂模块；科研模式只开放正常/加速，额外产出按钮禁用并说明原因。
- 喷涂点数按实际消耗的矩阵数量结算，多矩阵科技和无限科研不写死空配方；点数耗尽后恢复普通科研速度，不永久停机。
- 新增 `reforming_refine`：原油精炼厂，`煤 1 + 氢 1 + 精炼油 2 -> 精炼油 3 / 4s`，科技和配方图/统计/规划接入；精炼厂循环被标记为不可手搓，递归规划不会把循环当作免费来源。
- 原有等离子精炼、X 射线裂解和已存档配方、缓存、线路不自动切换。`originalRecipeParity` 提供固定目录审计，区分 implemented/adapted/not-applicable/missing。

### 2.5 统计、时间扭曲与排行榜

- 生产统计首屏使用按状态/星球范围缓存、异步 Worker 和按需计算；生产页不再提前扫描银河网络/生产规划；过期结果不会覆盖新筛选。
- 统计范围顺序为“全部星球 / 当前星球（含星系） / 其他星球”，切换不重置搜索、排序和时间窗口。
- 生产模拟保留索引与精确 oracle；时间扭曲前台预算按设备比例分段，单次 Worker 请求可取消并有积压保护，实际倍率不足时自动降档但保留请求值。
- 排行榜新增 `white-rate`（白糖 `/min`）。服务端只根据相邻有效主云修订的 `totalProduced.universe_matrix` 增量和模拟秒差计算，最小有效区间 60 秒；首次、回滚、负增量、短区间和内容包不更新官方榜单，历史峰值保留。

## 3. 修改文件

本批直接相关的主要文件：

- UI/交互：`src/App.tsx`、`src/main.tsx`、`src/styles.css`、`src/theme.css`、`src/components/GamePanels.tsx`、`OperationsWorkspace.tsx`、`StatisticsWorkspace.tsx`、`ReleaseNotesDialog.tsx`、`ItemReference.tsx`、`StartMenu.tsx`、`GalaxyWorkspace.tsx`、`ConstructionCenterWorkspace.tsx`、`BlueprintWorkspace.tsx`、`mobile/MobileFactoryPanels.tsx`、`src/hooks/useHorizontalPan.ts`、`src/game/uiPreferences.ts`。
- 模拟/规则：`src/game/engine.ts`、`content.ts`、`planning.ts`、`statistics.ts`、`offlineSimulation.ts`、`offlineSimulation.worker.ts`、`simulation.worker.ts`、`storage.ts`、`types.ts`、`cloud.ts`。
- 排行榜服务：`src/game/leaderboard.ts`、`src/game/leaderboard.test.ts`、`server/index.mjs`、`server/server.test.mjs`。
- 测试：`src/game/v128-development.test.ts`、`src/game/p2Batching.test.ts`、`src/game/p2SelectionBatch.test.ts`、`src/game/uiPreferences.test.ts`、`src/components/ReleaseNotesDialog.test.ts`、`src/hooks/useHorizontalPan.test.ts`、`src/game/*offline*test.ts`、`src/game/statisticsAsync.test.ts`、`src/game/timeWarpComputeGovernor.test.ts`、`tests/e2e/ui-visual-feedback.spec.ts`、`tests/e2e/v127-selection-batch.spec.ts`、`tests/e2e/game-flow.spec.ts`、`tests/e2e/v31-workspaces.spec.ts`。
- 文档/夹具：`docs/UI_VISUAL_FEEDBACK_HANDOFF_2026-08-04.md`、`docs/feedback/DEVELOPMENT_BATCH_HANDOFF_2026-08-04.md`、`docs/OFFLINE_TIMEWARP_ACCELERATION_PLAN_2026-08-03.md`、`docs/feedback-assets/`。

工作区还存在其他 Agent 的离线、云存档、P3-P6 和发布准备改动；发布前必须按文件审查，不得使用 reset/checkout/clean 覆盖它们。

## 4. 验证结果

以下命令在当前工作区执行，均无失败：

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过，TypeScript 0 错误 |
| `npm test -- --run` | 85 个测试文件通过、3 个跳过；738 项通过、12 项跳过 |
| `npm run test:server` | 47/47 通过 |
| `npm run build` | 通过，Vite 转换 1,876 个模块；仅有既有大 chunk 警告 |
| `npx playwright test tests/e2e/ui-visual-feedback.spec.ts --workers=1` | 6/6 通过 |
| `npx playwright test tests/e2e/game-flow.spec.ts --grep "multi-slot stations|galaxy rankings|light theme|settings|font" --workers=1` | 9/9 通过 |
| `npx playwright test tests/e2e/v127-selection-batch.spec.ts --workers=1` | 3/3 通过 |
| `npx playwright test tests/e2e/v31-workspaces.spec.ts --workers=1` | 6/6 通过 |
| `git diff --check` | 通过；`src/theme.css` 仅有 CRLF 转换提示 |

`v128-development.test.ts` 单独为 17/17；`p2Batching.test.ts` 单独为 13/13。完整 Vitest 已包含这两组结果。UI 回归截图输出在 `artifacts/qa/ui-2026-08-04/`，包括 A1/A2 设置、B1-B15 主题/检查器/施工/物品卡、E1 终局标题、F1 侧栏和 G1 版本分页。附件原图副本在 `docs/feedback-assets/ui-2026-08-04/`，没有伪造“before”截图。

未执行或不能代替执行的门禁：

- 未运行完整 `npm run test:e2e` 全量套件；本交接只记录上表聚焦套件。
- 未在真实 Android Chrome/WebView、iOS Safari、Electron、实体平板和实体手机上测量帧率/内存/触控；Playwright 的手机尺寸是桌面 Chromium 仿真。
- 未执行 `npm run test:ops`、`npm run test:native`、`npm run licenses:check`、原生签名、release manifest、双节点健康检查或真实存档线上上传。
- 未执行 1.0.28 版本公告、下载页应用包生成、VPS 部署或生产切换。

## 5. 性能与风险

- 统计和模拟索引减少重复扫描，但本批没有在同一真实终局存档、同设备、同浏览器上生成可发布的性能百分比；发布前需补充 P50/P95/Max 帧耗时、统计首屏、Worker 往返、堆峰值和 5.5/7.3MB 存档对照。
- 时间扭曲分段只限制单次任务积压，不改变玩法倍率；复杂流体、量子、在途物流和递归任务仍走精确路径。不能承诺任意离线存档 30 秒内完成。
- 重整精炼包含同一物品输入/输出，需继续关注输出容量、净统计、离线/大步长和递归规划循环；若异常应只回滚该配方/科技，不删除玩家库存。
- 白糖榜依赖相邻主云修订，首次上传不会立即有速率；服务端重算结果为权威。发布前必须备份 SQLite 并验证旧记录/内容包排除逻辑。
- 统一堆叠目标允许历史超限降低；不得把一亿限制用于读取时截断历史值。远程物流编辑必须持续验证跨星球不切换活动行星。
- 亮色主题和字体固定尺寸覆盖面较广，剩余风险集中在真实设备字体渲染、系统 WebView 原生控件和极窄窗口。

## 6. Release Agent 接收门禁

1. 先读取本文件、`RELEASE_HANDOFF_1.0.27.md` 和当前 `git diff`，按文件拆分并保留其他 Agent 改动；禁止从 dirty 工作区直接覆盖或 reset。
2. 在独立干净提交中把版本/公告/构建 ID 提升到 `1.0.28`，保留 `1.0.27` 和当前生产版作为回滚目标。
3. 重新运行类型检查、完整 Vitest、完整 E2E、server/ops/native/licenses 门禁和生产构建；生成 manifest、聚合 SHA-256、Web/Windows/Android 不可变制品并验证签名连续性。
4. 用只读副本验证 GameState v46、envelope v2、云 schema v7、旧蓝图/旧物流字段、历史超限建筑堆叠、白糖榜旧记录和重整精炼存档兼容。
5. 按既有备份、隔离启动、健康探针、原子切换和固定回滚指针流程发布；本文件不包含 VPS 密钥，也不授权发布。
6. 发布后验证 `version.json`、Service Worker、公告内容、香港/上海 API、下载页两个应用包、1–2MB 云存档上传、白糖 `/min` 修订递增、统计和亮色/移动布局。

## 7. 回滚边界

- 代码回滚到上一份已验证的 1.0.27/1.0.25 制品；不得删除或重写玩家存档、云修订、排行榜历史、数据库备份或旧 hashed assets。
- UI 偏好异常可删除对应设备 localStorage 键或关闭独立实验开关；不需要数据迁移。
- 白糖排行榜异常只回滚榜单类别计算/展示，保留云存档和其他榜单；重整精炼异常只撤销新增科技/配方代码。
- 未经单独授权，不执行 VPS 推送、下载页更新、应用签名或生产原子切换。
