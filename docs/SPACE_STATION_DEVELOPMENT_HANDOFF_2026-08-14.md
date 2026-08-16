# 全星系空间站扩展开发交接

> 日期：2026-08-14；开发门禁完成：2026-08-15
> 状态：已合并进 1.0.45 候选分支，未部署、未发布
> 原工作树：`D:\GameDev\DSPidle2-space-station`
> 原分支：`codex/space-station-expansion`
> 合并分支：`codex/1.0.45-space-station`（基于 1.0.44 release candidate）
> 起始基线：`7393a7f18c66823bae00ae06093eb32e582a96e7`
> 产品需求：[全星系空间站扩展设计与开发计划](./feedback/2026-08-14-全星系空间站扩展设计与开发计划.md)
> 发布交接：[RELEASE_HANDOFF_1.0.45.md](./RELEASE_HANDOFF_1.0.45.md)

## 1. 交付结论

本分支已经实现设计计划 M1-M5 的代码范围：全存档唯一空间站、三阶段施工、行星货运终端、量子库存手动交付、每日合同、徽记/声望、纯装饰画布、公共只读主页、独立隐私、收藏与固定通讯信号。星环、自由留言、交易、赠礼、实时在线和社交奖励均未实现，也不属于本次范围。

本分支已合并进 1.0.45 候选（`codex/1.0.45-space-station`），并补上了 M0 兼容桥接代码开关。正式发布前仍需 Release Agent 完成跨端桥接 rollout、全量 Playwright、真实 Linux、原生签名和隔离数据库演练。

## 2. 已实现范围

### 本地状态与迁移

- `GameState.orbitalStation` 使用独立 stateVersion 1；历史 `systemSpaceStations`、`galacticHubNetwork` 和银河出口记录不迁入、不删除、不退款。
- v46 普通档按累计 `totalProduced.universe_matrix` 初始化为 `locked` 或 `eligible`；速通档始终得到空的锁定状态。
- 三阶段成本在状态中保存不可变快照，加载时按领域目录校正，不能通过伪造状态跳过材料。
- 轨道徽记、声望、建设投入、合同进度、结算 ID、布局、独立视口和档案完整持久化；大数量使用规范十进制字符串。
- v47 重复货运终端会合并输入缓存、累计上传和不同端口配置，并把多余建筑返还施工库存，避免吞物资。
- 当前状态的货运终端保存缺少四口、单机、合法绑定、进度或规范累计值时拒绝导出。

### 建设与物流

- 空间站入口从普通新档开局可见，位于桌面行星导航左侧；新版手机壳从“更多工作区”进入，经典移动布局仍可通过全局导航进入。
- 轨道核心完成后开放独立 React Flow 画布；离开和返回使用独立 `orbitalStation.viewport`，不会伪造 `PlanetId`。
- 新建筑 `orbital_cargo_terminal` 每颗已殖民非气态行星最多一座、禁止堆叠，蓝图和直接放置复用领域守卫。
- 四个稳定输入口共享 50 MW 和 20,000 件/分钟上传能力；绑定建设、已接受合同或不绑定。
- 终端只扣缓存、目标剩余和额度三者最小整数；暂停/断电停止，低电余数保留，目标完成和解绑保留尾货。
- 检查器显示每口缓存、线路、绑定和累计量，可取回最多 100 件到光标，也可直达空间站货运或对应合同页；单口可经二次确认安全清空，关联传送带退回施工库存、该物资缓存退回本行星托盘并释放接口，但绝不回滚已交付进度。拆除仍把全部剩余缓存保护性返还行星托盘。
- 量子库存交付要求玩家输入严格正整数、查看实际扣除预览并二次确认；领域命令按请求、库存、目标剩余取最小值，不占量子带宽，暂停时仍允许。
- 物资出口港阶段的物流运输船从 `portableFleet.logistics_vessel` 显式交付。

### 合同与经济

- 任务日使用 `Asia/Shanghai` 单调日索引；联网时复用匿名公共状态的 `serverNow` 只向前校准，离线墙钟倒退不会回退任务日。合同尚未开放时校准完全不写存档，登录与普通自动保存不会仅因扩展存在而改变旧档校验和。
- 合同生成只依赖银河种子、任务日、槽位和规则版本，不使用 `Math.random()`。
- 每日 3 份普通 + 1 份特殊合同，最多接受 3 份；已接受合同跨刷新保留，到生成日后的第 3 个任务日结算。
- 模板包含单品、组合、戴森物资、指定行星、多行星、量子专用和高级部件，并按殖民、科技、已产出与量子能力过滤。
- 终端渠道、量子渠道和来源行星由领域命令强制执行；UI 隐藏不能绕过。
- 完成合同进入待领取；到期或主动放弃按加权进度向下取整发放基础奖励，只有 100% 完成才发完成奖励。
- `settledIds` 和稳定 settlement ID 阻止刷新、重载、恢复或重复点击二次发奖。
- `orbitalMarks` 只消费于装饰；`stationReputation` 只增不减并派生等级、称号、区域边界与摆放容量。

### 装饰与展示

- 13 项首发装饰、4 个主题和 6 级声望目录集中在 `stationDecorations.ts`。
- 购买获得永久许可；普通装饰可重复摆放，奖杯/纪念物可设为唯一；移除不退款也不删除许可。
- 最多 256 个实例，同时受等级软上限、区域、固定模块碰撞、旋转、层级和变体校验。
- 浏览与编辑模式分离；移动、旋转、层级、样式和删除均需显式编辑模式，手机详情接入现有返回栈。
- 同一只读渲染器用于站主总览和访客页；内容包未知装饰在本地安全保留，但公开快照只输出官方白名单装饰。
- 档案允许选择最多 4 项公开指标和 8 项当前存档已解锁成就；服务端再次核对成就确实已解锁。

### 公开主页与轻社交

- `src/main.tsx` 在初始化本地存档前识别 `/station/:publicId`；直接链接只加载公共页面和严格只读渲染器。
- 普通主云档上传或显式发布时，服务端解析自己的云正文并生成 `station-showcase-v1`；发布 API 只接受空对象，拒绝客户端自制快照。
- 公共快照只含不透明 public ID、显示名、空间站档案、等级/声望、官方安全布局、精选成就/合同和安全聚合指标，不含存档正文、库存、线路、账号 ID、邮箱、token、checksum 或徽记余额。
- `stationVisibility` 默认 public 且与 `leaderboardVisible` 完全独立；私密、不存在和管理撤下均在公共读取返回 404。
- 排行榜只在存在公开快照时附带 `stationPublicId`，不把空间站点数、声望、收藏或信号加入排名公式。
- 收藏和四种固定通讯信号要求登录、幂等、禁止对自己操作并分别限流；账号删除清理双向关联。
- cloud schema v8 / SQLite layout v3 增加独立 profile、favorite、signal、moderation 表，`app_state` 不再携带这些集合。
- 删除普通主云档或用账号归档替换云档会立即清空公开快照；手动槽与速通槽不能发布。
- schema v8 账号归档可以自导出/自导入，上一代 schema v7 归档继续兼容，schema v6 仍在读取正文前拒绝；展开式 API 候选包已包含 `station-profile.mjs` 并通过临时 SQLite 启动检查。

## 3. 关键模块

| 领域 | 主要文件 |
| --- | --- |
| 状态、建设、量子交付 | `src/game/orbitalStation.ts`, `src/game/stationMath.ts`, `src/game/types.ts` |
| 合同与任务日 | `src/game/stationContracts.ts` |
| 装饰目录与放置 | `src/game/stationDecorations.ts` |
| 行星货运终端 | `src/game/stationCargoTerminal.ts`, `src/game/engine.ts`, `src/game/content.ts` |
| 迁移与投影 | `src/game/storage.ts`, `src/game/saveProjection.ts`, `save-field-contract.json` |
| 本地 UI | `src/components/OrbitalStationWorkspace.tsx`, `StationCanvasRenderer.tsx`, `src/styles/station.css` |
| 公共直达页 | `src/game/applicationRoute.ts`, `src/main.tsx`, `src/components/PublicStationPage.tsx` |
| 云客户端 | `src/game/cloud.ts` |
| 服务端/SQLite | `server/station-profile.mjs`, `server/index.mjs` |
| UI/E2E | `tests/e2e/orbital-station.spec.ts` |

## 4. 确定性与性能边界

- `SimulationLookupContext.orbitalCargoTerminals` 只在拓扑建立时索引终端；空旧档不会在每步扫描实体。
- 绑定终端使会话遵守既有五秒安全边界；实时、持久 Worker、离线精确路径和单/多核编排最终调用同一上传结算函数。
- 四口分配按端口公平游标执行。整轮批量算法在端口稀疏或某口耗尽时也更新到与逐件分配相同的下一游标，保证 1 秒与批量分段状态一致。
- 轨道终端被加入离线近似拒绝集合，因此含终端的档默认走确定性精确结算，不以近似换取吞吐。
- 公共访问、收藏、信号和可见性全部在服务端独立状态中，不进入本地模拟。

## 5. 当前验证证据

以下结果均在本工作树于 2026-08-15 最终收尾状态重新执行，不引用 1.0.42 或其他工作树的历史数字：

- `npm run build`：通过；其中 `tsc -b` 通过、Vite 转换 1,938 个模块，启动闭包 187,053 B gzip、完整菜单闭包 283,308 B，forbidden startup modules 为 0。空间站 26.35 KB CSS 随空间站页面按需加载，没有抬高预算。
- `npm test`：151 个文件中 145 通过、6 个条件跳过；1,287 项中 1,269 通过、18 跳过、0 失败。
- `npm run test:server`：核心 359 项中 357 通过、2 个可选夹具跳过；空间站专项 3/3；合计 360 通过、2 跳过、0 失败。
- `npm run test:ops`：55 通过、6 个真实 Linux 专属门禁跳过、0 失败；包含展开式 API 包 `npm ci`、schema v8/layout v3 临时 SQLite health 和加密备份恢复。
- `npm run test:native`：24/24 通过；`npm run licenses:check`：125 个运行时包清单一致。
- `DSP_E2E_PORT=4337 npm run test:e2e`：Chromium 共 367 项，358 通过、9 个显式条件夹具跳过、0 失败，耗时 991.1 秒；`.last-run.json` 为 `passed` 且失败列表为空。
- 空间站 E2E 5/5 包含在完整套件中，覆盖 1366×768、1920×1080、390×844、844×390、合同/装饰/返回闭环、44px 移动触控、公开直达不初始化本地存档和私密统一 404。QA 截图仅保留在被忽略的 `artifacts/qa`，未进入源码提交。

所有服务端写测试均使用合成账号与临时 SQLite；浏览器 API 代理故意不连接生产。本轮没有部署、生产数据库访问、玩家存档读取、发布切换、原生签名制品、Firefox/WebKit、PWA production-preview 或真实 Linux systemd/Nginx 演练。后四类仍属于最终发布候选而非本隔离开发分支的门禁。

## 6. 与并行 1.0.43 的合并顺序

1. 先让 1.0.43 存档优化分支完成、验证并进入共同主线；不要把该工作树的未提交文件复制到本分支。
2. 从最新共同主线建立新的合并工作树，把 `codex/space-station-expansion` rebase 或 merge 进去；不要在任一原工作树上强制重置。
3. 检查最新 GameState、cloud schema 和 SQLite layout。若 1.0.43 已占用 v47/schema v8/layout v3，空间站必须整体顺延到“当前 + 1”，同时修改类型、迁移、服务端校验、共享字段契约和所有版本夹具，禁止保留并行同号语义。
4. 按以下冲突顺序处理：领域新文件 → `types.ts/content.ts` → `engine.ts` → `storage.ts/saveProjection.ts/save-field-contract.json` → `cloud.ts` → `server/index.mjs`/schema/layout → `App.tsx`/移动路由 → UI 样式 → 文档和 package scripts。
5. 对 `storage.ts` 与 `server/index.mjs` 不接受“选择 ours/theirs”整文件解决；逐段合并双方迁移、清理、账号归档、云删除和持久化逻辑。
6. 在合并结果上重新生成或审计共享字段契约，运行全部迁移夹具，再运行完整高风险矩阵。
7. 合并完成仍不等于可发布；先完成下节兼容桥接和跨端覆盖升级。

### 高冲突文件

- `src/game/types.ts`：GameState 版本、实体字段、公共类型。
- `src/game/storage.ts`：版本迁移、实体修复、旧资产拒绝规则。
- `src/game/saveProjection.ts` 与 `save-field-contract.json`：稀疏投影和当前态 fail-closed。
- `src/App.tsx`：工作区状态、任务日校准、桌面/手机导航和检查器回调。
- `server/index.mjs`：schema、layout、上传、云删除、账号归档和管理员动作。
- `package.json` / `server/package.json`：测试脚本；不得丢失并行分支新增门禁。

## 7. 兼容桥接发布门禁

当前功能分支不是设计计划 M0 所说的桥接版本，因为它会把普通档迁移并写成 v47。正式启用前必须另做桥接切片：

1. 桥接客户端能够读取、保存并原样保留未来空间站命名空间，但功能关闭。
2. 桥接客户端读取现有 v46 时继续写 v46，不得仅因打开或自动保存就升级。
3. Web、Windows、Android stable 都验证能读取未来状态后，才允许空间站功能写入新版本。
4. 空间站正式版的代码回滚目标是桥接版，不是无法识别新状态的 1.0.42/1.0.43 旧客户端。
5. 服务端并行接受旧版与新版普通云档；代码回滚保留 layout v3 表和私有快照，不恢复旧数据库备份覆盖新数据。

未满足以上五项时，本分支只能继续作为开发/试玩工作树，禁止部署 Web、API、Windows 或 Android stable。

## 8. 回滚与关闭

- 客户端功能开关只能停止新交互，不能删除 `orbitalStation` 或终端缓存。
- 关闭公共入口时统一返回 404，但保留站主私有快照和本地空间站。
- 服务端代码回滚必须继续识别 schema v8/layout v3；数据库表不回删。
- 任一失败阶段保留建设投入、合同进度、徽记、声望和装饰许可，不以清档、退款量子库存或恢复旧数据库作为普通修复。
- 本交接没有授权连接生产、上传玩家存档、修改排行榜历史、更新下载页或生成正式签名制品。

## 9. 后续非阻塞事项

- 三阶段成本、合同数量权重/奖励、等级阈值和首发装饰仍应在白糖初期、中期、超后期三类真实试玩档上平衡。
- M4/M5 上线前还需真实隔离 Linux、长期限流与备份恢复演练；当前开发测试只使用临时 SQLite 和合成账号。
- 公开精选、自由留言、举报/屏蔽、关注和星环应另行立项，不能夹入合并冲突处理中。
