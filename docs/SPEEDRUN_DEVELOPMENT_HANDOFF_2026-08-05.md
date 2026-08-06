# 速通模式开发交接（2026-08-05）

状态：开发完成，等待代码审查和独立发布授权。

本批只修改代码、测试和本交接文档。没有部署 VPS、写入生产数据库、更新下载页或生成发布安装包。

## 已实现

- 新增可选 `GameState.speedrun`，继续使用 GameState v46 和存档 envelope v2。
- 普通工厂不写入速通字段；旧普通存档没有转换入口。带有不完整速通身份的导入数据会保留但标记为不可上榜。
- 新建工厂可选择普通工厂或速通工厂。速通工厂固定 `speedrun-v1` / `season_01`，创建时保存独立 `factoryId`、科技/火箭/宇宙矩阵基线。
- 三个目标使用稳定 ID：`all_technologies`、`dyson_rockets_10000`、`white_matrix_1m`。
- 全科技只统计当前规则版本的有限科技，排除已弃用科技和无限研究。
- 火箭目标使用 `dysonSphere.totalRocketsLaunched` 的真实发射统计；白糖目标使用 `totalProduced.universe_matrix` 的累计生产统计。
- 速通计时使用有效墙钟秒。暂停不计时，时间扭曲只增加模拟生产时间，不倍速速通计时，离线 Worker 的有效墙钟时间随同一次精确结算进入状态。
- 目标完成时间只写入一次，继续运行不会降低已完成成绩。
- 游戏内速通状态面板显示计时、三个目标进度、完成时间和上榜资格。
- 银河网络新增独立“速通排行”页面和三个目标切换，普通银河排行接口与速通排行数据隔离。
- 新增客户端 `fetchSpeedrunLeaderboard` / `submitSpeedrunResult` API。
- 服务端新增：
  - `GET /api/speedrun/leaderboard`
  - `POST /api/speedrun/submit`
  - 三个独立类别：`speedrun-all-technologies`、`speedrun-dyson-rockets-10000`、`speedrun-white-matrix-1m`
- 服务端从当前主云存档重新校验速通字段、规则/赛季、工厂身份、云修订、摘要、内容包、目标计数和完成时间，并限制有效计时不能超出开始时间到服务端当前时间的可验证范围。
- 速通成绩按玩家/目标保留最快成绩，重复提交幂等；同一工厂的完成时间只能保持首次有效值，后续更短时间按回滚拒绝；普通排行榜接口保持原行为。
- 速通提交记录存放在独立 `speedrunSubmissions` 数据区，云 schema 仍为 v7，SQLite layout 仍为 v2。

## 修改文件

- `src/game/types.ts`
- `src/game/speedrun.ts`
- `src/game/speedrun.test.ts`
- `src/game/engine.ts`
- `src/game/storage.ts`
- `src/components/StartMenu.tsx`
- `src/components/SpeedrunStatusPanel.tsx`
- `src/components/GalaxyWorkspace.tsx`
- `src/App.tsx`
- `src/game/cloud.ts`
- `src/styles.css`
- `server/index.mjs`
- `server/package.json`
- `server/speedrun.test.mjs`
- `tests/e2e/speedrun.spec.ts`

工作区原有的其他未提交修改保持不动，发布前应按文件审查并拆分提交。

## 验证结果

在当前工作区执行：

- `npm run typecheck`：通过。
- `npm test -- --run`：87 个测试文件通过，752 个测试通过；3 个现有文件、14 个现有测试按仓库配置跳过。
- `npm run test:server`：49 个服务端测试通过，包含速通 API 测试。
- `npm run build`：通过。Vite 生产构建成功；仅有现有大 chunk 提示。
- `npx playwright test tests/e2e/speedrun.spec.ts --workers=1`：2/2 通过，覆盖桌面新建模式/状态面板和 390x844 新版手机速通面板/独立排行 Tab。
- `npx playwright test tests/e2e/game-flow.spec.ts --grep "start menu gates simulation" --workers=1`：1/1 通过，确认普通工厂快捷入口保持兼容。
- `npx playwright test --workers=1`：在 10 分钟工具上限内未结束，未出现断言失败汇总，不能计入全量通过；详见剩余风险。
- `node --test server/speedrun.test.mjs`：2 个速通服务端测试通过。
- `git diff --check`：通过；仅有现有 `theme.css` 换行提示。

速通单元测试覆盖：普通工厂隔离、初始化基线、有限科技、真实火箭/生产计数、暂停/时间扭曲墙钟、旧存档转换拒绝、v46 envelope 往返、不可验证回滚标记。

服务端测试覆盖：当前修订和摘要校验、目标计数校验、伪造用时拒绝、时钟合理性、重复提交幂等、同一工厂回滚用时拒绝、速通榜查询、普通存档拒绝和普通榜兼容。

## 发布前剩余工作与风险

1. 当前 Playwright 使用项目配置的 Chromium/Chrome；尚未在本机单独实测 Edge、Android WebView，以及 Android 原生壳的竖横屏，发布前需补做这些平台验收。全量历史 E2E 串行套件在 10 分钟内未结束，需单独拆分或延长门禁后再完成全量验收。
2. 服务端防伪依赖速通工厂 `factoryId`、云存档修订和状态摘要。正式开放前建议增加服务端签发的一次性 run token，以进一步阻止恶意客户端伪造“首次创建”。
3. `SPEEDRUN_FINITE_TECH_IDS` 在服务端与客户端规则版本中各有一份；新增科技必须创建新 ruleset/season，并同步两侧清单。
4. 当前客户端只有在上传主云存档后才能提交正式成绩；未登录、未上传或不可验证状态只显示本地进度，不进入正式榜。
5. 本批没有修改排行榜历史数据，也没有生产环境迁移脚本。发布前应先在临时 SQLite 上完成重启、备份和回滚演练。

## 发布边界

这不是生产发布授权。Release Agent 必须先审查本交接、拆分并提交开发变更、构建不可变制品、在测试环境执行完整 E2E，然后由用户另行授权后才可部署。
