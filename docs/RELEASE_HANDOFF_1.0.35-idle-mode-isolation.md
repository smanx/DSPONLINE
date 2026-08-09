# DSPidle2 1.0.35 集成补充开发交接

> Role: develop
>
> 状态：功能与自动化已完成，等待从干净源码提交生成不可变制品。本文件中的提交、清单和制品字段会在源码提交后补齐。
>
> 本交接续接既有 `1.0.35` 候选与香港 Web-only Canary。旧 Canary `1.0.35+48c74b7100dc` 不包含本补充，不能直接晋升为稳定版。

## 1. 交接合同

| 字段 | 内容 |
| --- | --- |
| Task ID / title | `1.0.35-idle-mode-isolation`：纯挂机幂等计时/资源守恒；普通与速通存档隔离 |
| Priority | P0 数据安全与结算正确性 |
| Source and attachments | 玩家反馈；截图 `372fb60b2deb7402918fe33447118afd.jpg`（只读检查） |
| Reproduction / evidence | 重复进入纯挂机后本次时间可能从历史值起跳；宏观外推在有限矿脉与缓存边界可能只增加累计生产或只扣储量，产物无法在输出/线路/库存追踪；普通与速通此前共用部分本地/云槽位语义 |
| Acceptance | 同一区间只结算一次；当前运行与历史累计分离；矿脉扣除等于可追踪产出；满缓存不丢物；两模式本地、云端、导入导出、删除和排行榜完全隔离 |
| Compatibility | 不清缓存、不覆盖玩家存档；缺少模式的旧存档只迁移为普通；迁移前保留原始普通主档；GameState v46 / envelope v2 / cloud schema v7 / SQLite layout v2 保持不变 |
| Target platforms | Web/PWA、Electron、Capacitor Android、Node/SQLite 云服务 |
| Release target | `1.0.35` 集成候选；本交接不授权部署、切换 stable、修改下载页或写排行榜历史 |
| Candidate source commit | `PENDING_SOURCE_COMMIT` |
| Build ID | `PENDING_BUILD_ID` |

开发期间没有连接生产 VPS，没有修改香港或上海数据库，没有上传测试存档，没有修改任何排行榜历史成绩，也没有部署生产环境。

## 2. 存档结构变化

### 2.1 GameState v46 的加法字段

`GameState.version` 仍为 `46`，新增字段由迁移器提供默认值：

```text
mode: "normal" | "speedrun"
idleSettlement:
  currentRunStartedAt: number | null
  currentRunElapsed: number
  lastSettledAt: number
  totalIdleTime: number
  currentRunProduction: Record<ItemId, number>
  totalProduction: Record<ItemId, number>
```

- `currentRun*` 只描述当前一次纯挂机；开始新运行时重置。
- `lastSettledAt` 是当前运行内的前向墙钟游标；相同或更小目标是 no-op。
- `totalIdleTime/totalProduction` 只累计已验证并写入主档的运行，不参与速度倍率或排行榜计时。
- `mode` 缺失、非法或无法确定时不会升级为速通；迁移结果是 `normal`。

### 2.2 Save envelope v2

envelope 仍为 v2，增加：

```text
mode: "normal" | "speedrun"
slot: "main" | 1 | 2 | 3
```

`envelope.mode` 与 `state.mode` 必须一致；模式或槽位命名空间不匹配时，预览可以显示诊断，但加载、导入和覆盖会被拒绝。导出仍包含 `formatVersion`、`savedAt`、完整状态和原有 checksum；模式和槽位现在显式可见。

### 2.3 本地键隔离

| 记录 | 普通模式 | 速通模式 |
| --- | --- | --- |
| 主档 | `dsp-idle-network.save.v1` | `dsp-idle-network.save.v1.speedrun` |
| 生命周期紧急镜像 | 旧主键兼容 | `dsp-idle-network.save.v1.speedrun.emergency` |
| 上一版本备份 | `dsp-idle-network.save.v1.backup` | `dsp-idle-network.save.v1.backup.speedrun` |
| 手动槽位 | `dsp-idle-network.slot.<1..3>` | `dsp-idle-network.slot.speedrun.<1..3>` |
| 自动/手动快照 | `dsp-idle-network.save.v1.snapshot.<id>` | `dsp-idle-network.save.v1.snapshot.speedrun.<id>` |
| 快照序号 | `...snapshot.sequence` | `...snapshot.speedrun.sequence` |

普通与速通自动保存请求按模式分别合并；同一事件循环内三次交错保存也不会让一个模式顶掉另一个模式。速通紧急镜像与主档同时存在时按 `savedAt` 选较新副本，主档验证成功后删除不再需要的紧急记录。

## 3. 旧存档迁移方案

1. 读取旧 envelope 或裸状态；缺少 `mode` 时迁移为 `normal`。
2. 旧状态即使残留 `speedrun.enabled`，没有明确状态模式也不能激活速通资格；残留对象只保留失格诊断。
3. 第一次用 v46 新代码改写旧普通主档前，把原始字节逐字保存到：
   `dsp-idle-network.save.v1.migration-backup.v46`。
4. 备份键已存在时不覆盖；重复迁移不会再次复制或改变原始备份。
5. 手动槽位和快照在读取时迁移、原记录不被就地改写；加载到主档前仍会创建同模式恢复点。
6. 旧文件改名、写入速通键、只改 envelope 模式或只改状态模式都不能把普通存档提升为速通。
7. 旧云端普通记录继续使用原 v7 字段。完整旧速通身份仅由服务端兼容旧客户端时识别；不确定记录仍按普通处理。

迁移不删除缓存、IndexedDB、快照、云历史或另一模式存档。空间不足导致无法保留迁移备份时，主档写入直接取消并提示导出，不用删除玩家数据换取成功。

## 4. 纯挂机计时与资源结算修复

### 4.1 幂等时间边界

- 开始：`beginIdleRun` 只为未激活运行建立开始时间和零游标；重复开始保持原游标。
- 结算：只处理 `(lastSettledAt, targetWallSeconds]`，成功后单调推进 `lastSettledAt`。
- 停止/恢复：产量使用开始检查点 `totalProduced` 与最终候选的累计差；重复停止、刷新或恢复只补尚未记录的差额。
- 完成：清除 `currentRunStartedAt`，保留本次摘要和历史累计；下一次开始才重置本次字段。
- 页面重进：存在纯挂机恢复日志时，StartMenu 不先执行普通离线结算；恢复流程先处理 5 分钟高倍率宽限，再处理普通离线余段，避免同一墙钟区间走两条路径。
- 云恢复和重复存档恢复仍受 envelope checksum、模式和恢复日志 settlement ID/checkpoint 保护。

### 4.2 有限矿脉与缓存守恒

- 宏观候选按矿脉输出变化与源端出带 `totalTransferred` 变化计算可追踪采集量。
- 有限矿脉的有效储量与隐藏十分之一余数，只能按可追踪采集量减少；`totalProduced` 必须与之对应。
- 无出带矿机在接近满仓或枯竭时只写入容量/储量允许的数量；满仓保持原矿脉储量，并由既有运行状态显示“输出缓存已满”。
- 有出带、物流或有限资源边界无法安全外推时，事务性丢弃候选并调用普通精确模拟；精确模拟按普通引擎 30 个模拟日单次上限分块覆盖完整请求，不能把截断区间标成已结算。
- 精确处理的科研秒数不会再次进入宏观科研账本；跨界后从权威状态重建宏观合同，后续调用不重复跨越同一边界。
- 初始 30 个模拟秒使用校准时得到的精确检查点；极小矿脉在校准窗口内枯竭时不会被尾段零速率误判为整段零产量。
- 无限资源跳过储量扣除，但仍遵守输出、线路、物流塔和量子库存容量。

没有用删除缓存、跳过产量、缩短已声明区间或凭空增加物资来通过守恒检查。

## 5. 普通/速通存档隔离

### 5.1 本地与 UI

- 主菜单同时显示普通/速通主档、三组独立手动槽位和带模式标签的快照。
- 存档管理只读取当前工厂模式；删除对话框显示模式、槽位、时间并要求两次确认。
- 普通存档没有转为速通的 API 或 UI。
- 速通主档/槽位可显式复制到一个空普通槽位；复制使用深拷贝，设置 `mode=normal` 并移除速通状态，原速通存档不变。目标普通槽已有任意数据（包括损坏记录）时拒绝覆盖。
- 模式不匹配的导入、救援、云恢复和手动槽下载给出明确错误，写入前先校验，因此失败不会破坏现有存档。

### 5.2 云端与 SQLite

- API 的上传、下载、历史、恢复和删除接受 `mode`；省略时保持旧客户端的普通模式语义。
- 普通记录继续使用 SQLite slot `main/1/2/3`；速通使用 `speedrun:main/speedrun:1..3`，同用户同槽同 revision 也不会碰撞。
- 账户摘要同时返回两模式四槽；旧 `cloudSave/cloudSaves` 字段继续表示普通模式，保证滚动兼容。
- 每个“模式 + 槽位”独立维护 revision、历史、冲突标记和同步标记。删除要求精确 `DELETE_CLOUD_SAVE:<mode>:<slot>` 与当前 revision。
- JSON/旧 layout 迁移到 SQLite 时，正文行和元数据均使用复合 storage slot；新增测试会关闭并重新打开数据库复核两种同 revision 正文。
- 账号导出和管理员摘要纳入两模式；账号删除仍删除该账号所有模式数据。删除普通主云档不会删除速通存档或速通历史成绩。

### 5.3 排行榜

- 普通排行榜只读取普通主云档。
- 速通提交只读取 speedrun 主云档，要求状态模式明确、速通结构/赛季/规则/工厂身份有效。
- 无限资源、非标准难度、极限模式、内容包/MOD 和实验/近似结算标记均拒绝进入速通正式榜。
- 普通存档即使达到白糖或科技条件也返回速通存档缺失/未启用，不创建成绩。
- 本开发没有调用历史恢复脚本，也没有修改 `speedrunSubmissions`、普通排行榜或任何生产数据。

## 6. 本地与云兼容性

- 新客户端读取旧普通存档：支持，默认普通并保留一次迁移前原始备份。
- 旧客户端读取新普通主档：envelope/state 为加法字段，原键和 envelope v2 保持；发布前仍须在上一正式客户端副本上做只读回退检查。
- 旧客户端看不到新速通键，不会覆盖它；不得用旧客户端上传速通存档。
- 新客户端连接旧 API：普通模式继续使用无 `mode` 的旧接口；速通云隔离需要新 API，滚动发布期间应先部署兼容 API 再开放速通云操作。
- 新 API 接受旧普通客户端；完整的旧速通身份走受限兼容路径，不会把不确定旧档自动晋升。
- 两地数据库继续独立；本补充没有跨节点迁移、合并或覆盖。

## 7. 修改文件

最终精确清单以候选源码提交为准。主要文件：

- 状态/迁移/本地保存：`src/game/types.ts`、`engine.ts`、`idleSettlement.ts`、`storage.ts`、`localSaveStore.ts`、`save.worker.ts`、`savePreview.ts`、`saveSummary.worker.ts`。
- 纯挂机/离线：`src/game/offlineApproximation.ts`、`pureIdleMacro.ts`、`offlineSimulation.ts`、`offlineSimulation.worker.ts`、`src/App.tsx`、`TimeWarpIdleOverlay.tsx`。
- 云与服务端：`src/game/cloud.ts`、`server/index.mjs`。
- UI：`StartMenu.tsx`、`GalaxyWorkspace.tsx`、`CloudSaveSlotsPanel.tsx`、`CloudSaveConflictDialog.tsx`、`SaveDeleteDialog.tsx`、`SpeedrunCopyDialog.tsx`、`src/styles.css`。
- 测试：`idleSettlement.test.ts`、`idleResourceSettlement.test.ts`、`storageMode.test.ts`、`cloud.test.ts`、`quantumLogisticsNetwork.test.ts`、`server/server.test.mjs`、`tests/e2e/v135-idle-mode-isolation.spec.ts`。
- 文档：`CHANGELOG.md`、`ARCHITECTURE.md`、`GAMEPLAY_SYSTEMS.md`、`PROJECT_STATUS.md`、`TESTING_RELEASE.md`、两份 1.0.35 交接文档。

## 8. 新增回归与结果

### 8.1 新增主题

- 5 分钟停止后重新挂机、页面退出重进、暂停恢复、快速开始/停止、重复停止、重复存档恢复。
- 1x/4x/8x/12x；供电不足按实际倍率；普通模拟与纯挂机相同模拟秒对照。
- 矿机空仓、近满、满仓、有限/无限矿脉、堵塞传送带、满量子仓、无电。
- 30 天无出带枯竭/满仓边界常数时间；有出带长区间精确跨界、合同重建与科研单结算。
- 普通/速通主档、备份、槽位、快照、紧急镜像、导出导入、单向复制、并发自动保存。
- 模式伪造/改名拒绝、旧档幂等迁移与原始备份、损坏主档回退。
- 两模式云上传/下载/历史/恢复/删除、同 revision SQLite 迁移重启、多设备 revision 冲突。
- 普通存档拒绝速通榜；合格速通提交通过；MOD/无限/极限/实验标记拒绝。
- 浏览器同时显示两模式、复制提示、源档不变、删除不跨模式。

### 8.2 最终开发矩阵（源码提交前）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过，0 TypeScript 错误 |
| `npm test` | 98 文件通过、5 文件跳过；887 通过、16 跳过、0 失败（903 总数） |
| `npm run test:server` | 70 通过、2 条可选真实夹具跳过、0 失败（72 总数） |
| `npm run test:ops` | 6/6 |
| `npm run test:native` | 8/8 |
| `npm run licenses:check` | 128 个运行时包一致 |
| 根 `npm audit --omit=dev` | 0 vulnerabilities |
| server `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run test:e2e` | 255 通过、11 条条件夹具跳过、0 失败（266 总数，756.2 秒）；`.last-run.json` 为 `passed` 且 `failedTests=[]` |
| `git diff --check` | 通过 |

Playwright 中 `127.0.0.1:65534` 的 API 连接拒绝是测试配置故意验证离线降级，不是生产 API 健康检查。本轮没有连接生产服务。

构建、PWA、桌面和 Android 结果将在不可变源码提交后补入本文件。

## 9. 性能影响评估

- `idleSettlement` 是两个小型数字映射与四个标量，不进入每个模拟 tick。
- 有限矿脉守恒扫描按矿脉实体与出带数量线性执行，只发生在纯挂机宏观候选提交边界。
- 30 天无出带边界测试强制低于 1,000 ms；当前包含 13 个资源场景的聚焦文件总耗时约 1.8 秒。
- 有出带不安全边界使用普通精确模拟保证正确性；请求超过普通引擎单次 30 日上限时分块覆盖。复杂终局工厂恰逢大量有限资源边界时可能增加停止结算耗时，但不会截断、跳过或伪造收益。
- 跨界后重建合同，避免后续每次停止都重放已经枯竭的矿脉。
- 模式过滤和 checksum/模式复核发生在保存、摘要和云请求边界；并发保存队列按两种模式维护，最多增加一个待处理主档，不进入生产热循环。
- `saveVerifiedPayload` 在最终落盘前多做一次完整模式/结构检查，增加一次恢复/云写边界解析，换取目标命名空间安全。

## 10. 未解决风险与发布阻塞

1. 旧缺模式速通文件按普通模式打开，这是公平性优先的有意兼容选择；不能靠改文件名恢复速通资格。
2. 极大终局工厂在有限矿脉/多级物流边界触发精确回退时，停止结算仍可能比纯仿射路径慢；需用发布 Agent 的脱敏真实终局副本继续测 2/8/24/72 小时、7/30 天和峰值内存。
3. 当前没有两台 Android 和低配 Windows 的锁屏、后台、温度、耗电、30 分钟内存趋势证据；旧 Canary 的真机豁免不自动覆盖本候选。
4. Android/Windows 正式签名制品尚未生成；开发阶段只允许未签名诊断构建，禁止进入 stable feed。
5. 新 Web 的速通云隔离依赖新 API；滚动发布顺序和旧 API 下的明确禁用提示需在未激活目录验证。
6. 服务器仍不重新模拟完整速通工厂；结构、时间、模式与禁用标记校验不能替代服务端权威模拟。
7. 香港旧 1.0.35 Canary 仍是 `48c74b7`，不含本修复；发布 Agent 必须创建新版本化目录，不能覆盖旧 Canary 取巧。

## 11. 回滚方案

- 功能回滚以本候选源码提交的父提交为代码边界；不使用 `git reset --hard` 清理用户工作树。
- 生产回滚只切 Web/API 版本目录和下载指针，不恢复旧数据库，不删除新模式记录，不清浏览器 IndexedDB/localStorage。
- GameState/envelope/schema/layout 版本未升级，新字段均为加法；旧代码忽略未知状态字段。速通独立键和 v7 模式映射应保留，等待修复版重新读取。
- 如新 API 需回滚，先停用新 Web 的速通云写入口；旧 API 只继续普通模式，不能把速通 payload 上传到普通槽。
- 保留 `migration-backup.v46`、普通/速通主档、备份、快照和云历史。任何数据库恢复都必须是另行授权的灾难恢复，并先备份当前数据库。
- 排行榜历史成绩不属于代码回滚对象；本批未修改历史数据。

## 12. 不可变制品（提交后补齐）

| 项目 | 路径 / 值 |
| --- | --- |
| Source manifest | `PENDING_SOURCE_MANIFEST` |
| Source file count | `PENDING_SOURCE_FILE_COUNT` |
| Source aggregate SHA-256 | `PENDING_SOURCE_AGGREGATE_SHA256` |
| Web archive | `PENDING_WEB_ARCHIVE` |
| API archive | `PENDING_API_ARCHIVE` |
| Desktop diagnostic | `PENDING_DESKTOP_ARTIFACT` |
| Android unsigned APK/AAB | `PENDING_ANDROID_ARTIFACTS` |
| Candidate artifact manifest | `PENDING_CANDIDATE_MANIFEST` |

所有归档必须排除 `node_modules`、数据库、`server/data`、备份、环境文件、玩家存档、PEM、keystore、密码和 token。未签名原生制品只能用于构建诊断。

## 13. Release Agent 操作边界

1. 先验证本交接中的源码提交、source manifest 和每个候选归档哈希；任何不一致都停止。
2. 在隔离未激活目录运行 server/ops、版本文件、PWA、模式云槽和 SQLite 迁移重启 smoke；不对生产账号写测试数据。
3. 两地分别创建并验证 SQLite Backup API 备份；不得合并香港/上海数据库。
4. 使用正式 HTTPS API/更新地址和既有长期 Android 证书重新构建正式原生包；不得创建新证书。
5. 完成 1.0.34→新 1.0.35 覆盖升级并验证两模式 IndexedDB 存档均保留。
6. 用户未明确授权具体节点、下载页和 stable feed 前，不执行生产切换。
7. 不运行排行榜历史恢复脚本；本需求的速通公平修复只影响未来提交校验。
8. 回滚只切代码/下载指针，不恢复数据库、不删除玩家存档。
