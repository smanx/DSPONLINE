# DSPidle2 1.0.35 开发交接

> **最终 stable 状态（2026-08-09）**：Release Agent 后续以 clean source `080844f55852995341a5f251d8f91bf090b9403f` / Build ID `1.0.35+080844f55852` 完成正式签名、两地备份、未激活目录、生产切换、上海下载页与公网验收。用户只对该精确候选豁免物理真机门禁；其余门禁通过。旧 `48c74b7` Canary 路由已移除。本文主体保留开发阶段历史，最终制品、风险和回滚以 [1.0.35 正式发布记录](./releases/1.0.35.md) 为准。

> **后续集成候选提示（2026-08-09）**：本文件主体记录 `48c74b7` 候选及其香港 Web-only Canary，均不包含后续“纯挂机守恒 + 普通/速通存档隔离”补充。未来稳定发布必须改用 [1.0.35 补充开发交接](./RELEASE_HANDOFF_1.0.35-idle-mode-isolation.md) 中的不可变源码 `1ea722641f4d413f61b98cc7da7b6d33b9216ccb`、Build ID `1.0.35+1ea722641f4d`、清单和制品；不得把旧 Canary 直接提升为稳定版。旧 Canary 与生产状态记录保留，不在开发交接中回写。

> Role: develop → release pending
>
> 交接日期：2026-08-09
>
> 开发交接时生产基线：`1.0.34+4a7d51241424 / GameState v46 / envelope v2 / cloud schema v7 / SQLite layout v2`
>
> 1.0.35 候选源码：`48c74b7100dc41cea06a076255036f9b5610cda9`
>
> 候选 Build ID：`1.0.35+48c74b7100dc`

## 0. 2026-08-09 发布后状态

用户已明确豁免 1.0.35 真机门禁，但豁免范围限定为香港 Web-only 测试入口。Release Agent 已将权威 Web 候选部署到版本化路径 `https://dsponline.cn/canary/1.0.35-48c74b7100dc/`；香港根站/API、上海 Web/API、上海下载页和 Android/Windows stable feeds 继续保持 1.0.34，未切换任何 `current` 指针，也未发布 unsigned diagnostic 原生制品。

同域 PWA 隔离通过真实 Chrome 验收：1.0.35 的根 Service Worker 注册被精确拦截，测试响应使用 `Vary: *` 阻止既有 1.0.34 worker 覆盖正式 `/index.html` 缓存；访问测试版前后正式缓存不变，断网根站仍为 1.0.34。完整制品、配置备份、公网验收、限制和回滚指针见 [1.0.35 香港 Web 测试版发布记录](./releases/1.0.35.md)。本文以下“未授权/阻塞”描述保留为开发交接时的历史事实，不应解读为稳定版或原生应用已经获准发布。

交接中尚未执行的单一玩家历史速通恢复随后于 2026-08-09 获得明确账号/时间与写入授权，并在香港 1.0.34 API 上按完整备份、独立修订证据、guard 演练、停服事务和公开榜单后验完成。该操作没有部署 1.0.35 API，也没有修改玩家云存档正文；脱敏证据见 [香港历史速通成绩恢复记录](./releases/1.0.34-speedrun-recovery-2026-08-09.md)。

## 1. 交接结论

1.0.35 的代码、自动化、桌面真实存档对照、Web/API 候选归档和原生未签名诊断构建已经完成。开发角色没有连接生产 VPS、没有修改两地数据库、没有上传玩家存档、没有切换下载页，也没有读取或复制 PEM、token、密码或签名私钥。

本候选不是“无条件可发布”：反馈交接要求的两台不同档位 Android 真机和一台低配 Windows 的 30 天离线/纯挂机、1/7/20 MiB 云上传、锁屏/后台恢复、温度与真实内存峰值尚未执行；当前开发机不能伪造这些证据。Windows 目录包和 Android APK/AAB 仅为未签名诊断制品，禁止进入稳定更新源。历史速通玩家也尚未进行生产恢复，因为交接中没有玩家账号 ID，且开发角色没有生产写入授权。

功能代码和自动化门禁已达到开发交接条件；Release Agent 只有在补齐上述真机与签名门禁、获得明确发布授权、完成两地备份和未激活目录验证后，才能原子发布。

## 2. 共享交接字段

| 字段 | 内容 |
| --- | --- |
| Task ID / title | `V135-P0-P2-20260809 / 终局结算、云治理、账号安全、速通恢复与堆叠快捷档` |
| Priority | 2 项 P0/P1、5 项 P1、1 项 P2 |
| Source and attachments | [1.0.35 开发需求交接](./feedback/2026-08-09-v1.0.35-开发需求交接.md)；三张速通截图；一张检查器堆叠截图；约 5.5/7.3/20 MB 终局存档只读副本 |
| Reproduction / evidence | 截图显示累计白糖 `1,004,162 / 1,000,000` 且本地 13:42 完成，排行榜仍报告目标未完成；终局档热线程主要集中在线路、物流、生产和电力；大存档接近 30 MiB 时缺少分级预警和阶段诊断；云数据库缺少可审计裁剪/磁盘保护/账号处置闭环 |
| User-visible acceptance | 高风险离线在开始前分级和预警；大存档保存/上传阶段可见且可取消；百万白糖漏写里程碑自愈；检查器支持 ±10,000/±100,000；新设备登录只显示匿名摘要；异常榜单可复核而不改玩家存档 |
| Compatibility | GameState v46、envelope v2、cloud schema v7、SQLite layout v2 不变；旧存档、旧云档、四槽修订、expectedRevision、库存、缓存、线路、在途和排行榜身份规则保持 |
| Target platforms | Chrome、Edge、PWA、Electron、Android Chrome/WebView；桌面与移动横竖屏 |
| Required tests | 根/服务端安装与审计、typecheck、Vitest、server、ops、native、licenses、build、完整 Playwright、真实终局存档、原生构建、真机温度/内存/后台/弱网 |
| Release target | 目标 `1.0.35`；本文不授权发布，公网仍为 1.0.34 |
| Known rollback | 代码和 Web/API/下载指针回到 1.0.34；数据库不回滚。内部账号控制/审计/排行榜冻结保留，除非执行单独审计恢复；未签名诊断包不得发布 |

## 3. 八项完成状态

### 3.1 终局离线与纯挂机设备预算

- 新增运行时 `offlineComplexity` 分类器，综合实体、线路、物流站/路线、量子、流体、缓存边界、戴森、递归/建造、有限资源和设备内存/核心/指针类型，区分 `simple / stable-endgame / volatile-endgame / complex`。
- 分类只选择已有精确、快速或保守路径并设置 30/60/75 秒设备预算，不进入 GameState、不改变收益。预测峰值内存过高时在计算前提示；取消、Worker 错误或不支持时保留原始存档。
- StartMenu、离线 Worker、纯挂机恢复与离线报告共用分类结果；报告显示分类、预算、降级和回退原因。
- 开发机真实存档和自动化已完成；物理 Android/低配 Windows 温度、锁屏、后台和峰值内存仍是发布阻塞项。

### 3.2 大存档保存与云上传治理

- 统一 1/7/20/28/30 MiB 体积分级；30 MiB raw 回退、32 MiB 服务端展开限制和 expectedRevision 保护不变。
- 云上传 session 诊断只记录准备、离线、校验、压缩、网络、回退、取消和结果耗时/字节，不记录 payload。
- 自动云同步复用保存 Worker 生成的一份已校验 payload 与摘要，不再同步调用 `exportGame()` 生成第二份大字符串。
- 自动保存增加 30 分钟档，保留 10 分钟和关闭；本地自动保存与云同步继续独立。
- 新客户端访问旧 API 节点时，缺少可选登录安全记录不会使云存档控制整体崩溃，支持滚动发布。
- Android 未签名 Release 编译通过；1/7/20 MiB 真机前台/后台/弱网/取消/冲突仍须发布前验证。

### 3.3 js-yaml 高危依赖

- 根项目使用 npm override 固定 `js-yaml 4.3.1`，lockfile 和第三方许可证清单已重建。
- 根项目和服务端 `npm audit --omit=dev --audit-level=high` 均为 0。
- 完整根审计仍有 5 个只影响开发/打包工具链的既有告警（1 moderate、4 high）；不能写成生产运行依赖告警。
- Windows 目录包和 Android Release 编译均通过，未修改 node_modules。

### 3.4 单核热路径与存档分级

- 线路 fallback 一次建立实体 Map，不再逐线路 `entities.find`。
- 物流站翘曲器补充复用站点索引和动态路线账本；量子边界上传/下载复用站点、采集器、预留和在途索引。
- 持久 Worker 只有实体/线路数组拓扑引用变化时才重建运行时索引；campaign/speedrun 同步产生的新顶层对象不再触发无意义重建。
- 新增 1/4/12/60/600 秒整段与分段、索引复用/拓扑失效测试。玩法权威状态一致；生产历史采样桶数量仍按调用分段记录，因此一次 60 秒与 60×1 秒的 `productionHistory` 数组长度不同，这是既有采样语义，不是库存/产量差异。
- 多 Worker 生产路径仍保持关闭，本批没有重新开启 P6。

### 3.5 云服务治理

- 保持单 Node + SQLite layout v2，不在本批冒险分表。新增 SQLite 主库/WAL/SHM/page/table、payload/revision、每账号修订、备份耗时/状态、请求延迟、慢请求、写队列和裁剪指标。
- 备份支持每日低流量时间窗并区分 `running / ready / failed`，健康探针不会把活动中的备份直接解释为宕机。
- 历史裁剪生成稳定预览哈希，写操作要求精确 `PRUNE_CLOUD_HISTORY` 和同一 preview ID；事务性、幂等并保留每槽最近 20 条。
- 磁盘 80% 告警、90% 云写保护已测试；90% 时 PUT 返回 507，不删除数据。
- 发布清单已补齐所有新增 API 运行时和恢复模块，避免发布 Agent 漏带文件。

### 3.6 账号安全、管理员处置与排行榜防篡改

- 新登录只保存 16 字符匿名设备/区域哈希和 clientType，保留最近 20 条，不保存原始 IP、坐标或完整指纹。
- 同一匿名失败元组 10 分钟内 5 次失败后临时锁定，成功后清除；新设备/区域只提醒，不默认阻断正常玩家。
- 管理后台可只读查看精确账号摘要，并可撤销会话、禁用/恢复登录、限制/恢复榜单、注销账号；所有动作需要 `CONFIRM:<action>:<accountId>`，注销还要求 24 小时内已验证备份时间戳。
- 高置信规则仅检测当前 v46 的时间/累计回滚、结构合法但无支撑实体的极端状态等证据；旧版存档不套用 v46 单调假设，不设置理论产能硬上限。冻结移除公开提交但不回写云存档，恢复后要求新修订。

### 3.7 百万白糖速通自愈与恢复工具

- v46 合法速通档加载时，以 `totalProduced.universe_matrix >= 1,000,000` 权威事实补齐漏写派生里程碑；普通工厂、内容包档和未达标档不补。
- 服务端提交在主云档事实达标但里程碑缺失时保守接受，并以当前有效游玩时间补记录；重复提交不产生重复成绩，也不覆盖既有更快时间。
- `server/speedrun-recovery.mjs` 支持 dry-run/apply：要求精确账号、最新主云 revision/hash、v46 速通身份、匹配 `quick_check` 备份、服务停止和 `RECOVER_SPEEDRUN:<account>:<revision>`。只写内部 speedrunSubmissions 与最小审计，不修改云 payload。
- **未执行玩家生产恢复**：反馈未提供账号 ID，本开发任务也没有生产写权限。Release/运营必须先取得玩家用户名或精确账号 ID和最新主云档，再按文档 dry-run；不得凭截图直接写榜。

### 3.8 建筑堆叠快捷档

- 桌面、经典移动和新版移动检查器均增加 ±10,000、±100,000，保留 ±1/10/100 和直接输入。
- 继续调用既有原子增加/减少命令，受施工库存、唯一建筑和 1～100,000,000 边界约束；无施工件不会部分增加，减少不会低于 1。
- 80%～200% 字号、390×844、横竖屏和既有批量入口由完整 E2E 覆盖。

## 4. 最终开发门禁

以下结果全部来自源码提交前的最终代码；提交后又从 clean commit 重建 Web、Windows 目录包和 Android 未签名 Release，源代码未再改变。

| 命令 | 本轮准确结果 |
| --- | --- |
| `npm ci` | 通过；根 457 个包 |
| `npm --prefix server ci` | 通过；服务端 75 个包 |
| `npm run typecheck` | 通过，0 个 TypeScript 错误 |
| `npm test -- --run` | 95 文件通过、5 文件跳过；854 项通过、16 项跳过、0 失败 |
| `npm run test:server` | 67 通过、2 条显式真实夹具跳过、0 失败（69 总数） |
| `npm run test:ops` | 6/6 通过 |
| `npm run test:native` | 8/8 通过 |
| `npm run licenses:check` | 通过，128 个运行时包 |
| 根/服务端 `npm audit --omit=dev --audit-level=high` | 两侧均 0 漏洞 |
| `npm run build` | 通过，Vite 转换 1,885 模块；只有既有 >500 kB chunk 警告 |
| `npm run test:e2e` | 254 通过、11 条可选真实夹具跳过、0 失败（265 总数，705.4 秒） |
| `npm run desktop:pack` | 通过；FileVersion 1.0.35 / ProductVersion 1.0.35.0 / Authenticode `NotSigned` |
| `npm run android:release:unsigned` | 首次因 shell 未设置 `ANDROID_HOME` 停止；设置已安装 SDK 后 Gradle `bundleRelease assembleRelease` 413 tasks 成功，APK/AAB 未签名 |
| `git diff --check` | 通过；仅许可证文件 CRLF→LF 提示，无 whitespace error |
| source manifest / archive verify | 160/160 逐文件通过；Web/API 解包后再次按同一清单 160/160 通过 |

完整 E2E 中对 `127.0.0.1:65534` 的 `/api/health`、`presence`、`public-status`、`analytics` 连接拒绝来自隔离测试配置，不是生产 API 失败。浏览器测试没有连接生产服务。

11 条跳过项均要求显式真实夹具或性能环境变量：施工稳定性 2、云上传真实档 3、Canvas 真实档 1、P6 真实档 2、离线/时间扭曲真实档 2、纯挂机 30 天真实档 1。本批另以只读副本在 Node/桌面环境完成下节对照，但不能把它们标成物理真机 E2E。

## 5. 真实终局存档性能与守恒

### 5.1 同设备 1.0.34 → 1.0.35 对照

| 只读夹具与口径 | 1.0.34 | 1.0.35 | 变化 |
| --- | ---: | ---: | ---: |
| 约 7.3 MB，60×1 秒总模拟 | 4,411.92 ms | 4,217.35 ms | 总耗时 -4.41% |
| 同档单步 P95 | 168.20 ms | 152.18 ms | -9.52% |
| 同档单步最大值 | 266.48 ms | 237.68 ms | -10.81% |
| 约 20 MB，60×1 秒总模拟 | 17,820.81 ms | 14,370.11 ms | 总耗时 -19.36% |
| 同档单步 P95 | 1,023.36 ms | 697.08 ms | -31.88% |
| 同档单步最大值 | 1,211.73 ms | 920.51 ms | -24.03% |

7.3 MB 和 20 MB 最终权威状态哈希分别保持 `3346205b`、`281189b2`；保存后重新载入 checksum 有效，非法数量均为 0。测试只使用内存副本，原始附件未保存、覆盖、提交或上传。

### 5.2 1.0.35 精确 60 秒阶段剖析

| 夹具 | 总耗时 | 主要阶段 |
| --- | ---: | --- |
| 约 5.5 MB / 2,906 实体 / 6,340 线路 | 2,501.43 ms | 线路 1,160.65；物流 503.22；生产 296.24 ms |
| 约 7.3 MB / 3,978 实体 / 8,867 线路 | 3,688.19 ms | 线路 1,763.12；物流 696.71；生产 494.14 ms |
| 约 20 MB / 11,604 实体 / 27,669 线路 | 11,378.97 ms | 线路 6,485.90；生产 1,627.10；电力 850.90；物流 718.55；历史 641.44；施工 475.28；量子 288.24 ms |

这些数字说明大档优化收益主要来自索引重用，但线路仍是首要瓶颈。它们是同一桌面 Node 运行时数据，不是 Android 温度、浏览器峰值内存或任意设备“30 秒硬保证”。

## 6. 兼容性与确定性

- `GameState.version` 仍为 46；存档 envelope v2、cloud schema v7、SQLite layout v2 未升级。
- 内容定义没有写入 GameState；账号安全与治理字段只在服务端内部状态中规范化。
- 离线分类、上传诊断和设备能力属于运行时/session 状态，不进入玩家存档或排行榜。
- 云上传保持四槽独立 revision、409 冲突和 expectedRevision；失败、取消、90% 磁盘保护不创建半修订。
- 账号控制、榜单冻结、审计和速通恢复不修改云存档正文。
- 旧 Web/新 API 和新 Web/旧 API 的滚动发布均保守处理可选登录安全事件；核心会话与云存档接口失败仍显式报错。

## 7. 修改文件

候选提交修改 85 个文件，新增 3,135 行、删除 260 行。精确清单可用：

```powershell
git show --stat --name-status 48c74b7100dc41cea06a076255036f9b5610cda9
```
主要范围：

- 离线、保存、云与引擎：`src/game/offlineComplexity.*`、`saveSizePolicy.*`、`offlineSimulation*`、`save.worker.ts`、`cloud.*`、`storage.*`、`engine.ts`、`singleCoreIndexing.test.ts`。
- 前端与交互：`src/App.tsx`、`StartMenu.tsx`、`OfflineReportWorkspace.tsx`、`CloudAccountSecurity.tsx`、`AdminDashboard.tsx`、桌面/移动检查器、样式、1.0.35 公告和英文映射。
- 服务端：`server/index.mjs`、`account-security.*`、`cloud-governance.*`、`leaderboard-integrity.*`、`security-governance.integration.test.mjs`、`speedrun-recovery.*`、`speedrun.test.mjs`。
- 发布与依赖：根/server package files、`android/native-version.properties`、许可证文件、`deploy/create-release-manifest.mjs`。
- 文档：`ARCHITECTURE.md`、`GAMEPLAY_SYSTEMS.md`、`TESTING_RELEASE.md`、`DEPLOYMENT_OPERATIONS.md`、`NATIVE_APPLICATIONS.md`、`PROJECT_STATUS.md` 和原反馈交接。
- 浏览器回归：36 个 Playwright 文件的版本基线刷新，以及云、公告、速通、堆叠和移动端专项。

本批跨越同一引擎、云协议和共享 E2E，最终形成一个集成候选提交；未用空提交伪造“每项独立提交”。因此逐项 Git 回滚粒度没有达到反馈文档的理想建议，回滚应以完整 1.0.35 → 1.0.34 为边界。

## 8. 候选制品与清单

源码清单：

- [1.0.35 source manifest](../artifacts/release-manifests/1.0.35-48c74b7100dc.json)
- 文件数：160
- 聚合 SHA-256：`4eab81d0025112e9ae177bfa5f11592cdede6e5233140e6537476d64a2921552`
- 清单文件 SHA-256：`9c5f96939f583f87e88dd9a21e35fa9198f1e5223611bceb91936985a6df6e27`

候选目录：[artifacts/release-packages/1.0.35-48c74b7100dc](../artifacts/release-packages/1.0.35-48c74b7100dc)

| 文件 | 字节 | SHA-256 | 状态 |
| --- | ---: | --- | --- |
| `1.0.35-48c74b7100dc-web.tar.gz` | 1,331,284 | `db25d7c15226256470083a6cecbaae24c1d890e7f6632428035ca4beb9e6ea54` | Web 候选，可进入未激活目录验证 |
| `1.0.35-48c74b7100dc-api.tar.gz` | 101,610 | `5d93e08fe9ba31f1fb6a2b43984f1d36ba1f45aba35bcec6188fcb15e2ed78a9` | API 候选，可进入未激活目录验证 |
| `windows-unpacked-diagnostic-unsigned.tar.gz` | 150,076,246 | `1a64003aed297a6a674c8b741812719d295d2944e28bcf108dbac83b373f9b74` | 仅诊断，NotSigned，禁止稳定发布 |
| `android-unsigned.apk` | 4,787,675 | `3bea0d3c2ffd496228612cf09ee9b900d5cf52cae95868eacf0f7d55af780600` | 仅诊断，未签名，禁止安装到稳定用户 |
| `android-unsigned.aab` | 4,602,965 | `18dd50d32cbe7fee2a5a7d4e4301c0806ec0c9a1b27ecf442dc2338e89781483` | 仅诊断，未签名，禁止稳定发布 |

`candidate-artifacts.json` 记录相同字段。Web/API 归档解包后使用 source manifest 再次核对 160/160；归档不含 node_modules、数据库、`server/data`、备份、环境文件、真实存档、PEM、keystore、密码或 token。

## 9. Release Agent 阻塞与发布门槛

1. 在至少两台不同档位 Android 和一台低配 Windows 上完成要求的 30 天离线、30 天纯挂机、8x/12x/16x、1/7/20 MiB 上传、弱网、取消、409、锁屏/后台恢复，并记录墙钟、Long Task、峰值内存、温度和降级原因。
2. 从 clean source commit 使用正式 HTTPS API/更新地址重新构建原生包。Android 必须加载既有长期证书，验证 v2/v3、证书连续性和 `1.0.34 -> 1.0.35` 覆盖升级保留本地数据；禁止创建新证书。Windows 必须明确记录 Authenticode 状态。
3. 重新生成完整下载目录、stable feeds 和 download/bundle manifests；不能把本文的 unsigned diagnostic 文件加入稳定清单。
4. 香港、上海分别创建并验证 SQLite Backup API 备份，检查 schema v7/layout v2、账号/四槽/历史/排行榜数量。两地不可合并或互相覆盖。
5. 在未激活 API 目录用生产备份副本隔离启动，运行服务端 67/2、运维 6/6，验证备份 active 状态、裁剪 preview、80/90 水位、旧/新 Web 滚动兼容、账号控制和审计；不得对生产账号做测试写入。
6. 取得用户明确发布授权后才原子切换。发布后核对 `version.json`、service worker、CORS、gzip/raw、登录安全摘要、四槽 revision、管理员指标、磁盘水位和下载哈希；回滚只切代码/下载指针，不恢复数据库。
7. 玩家速通恢复必须另获精确账号和操作授权。先 dry-run；只有最新主云档事实、备份、服务停止和确认文本全部匹配才 apply。未知账号时保持未处理，不能猜测。

## 10. 给 Release Agent 的交接提示词

```text
Role: release

任务：验收并在明确授权后发布 DSPidle2 1.0.35。先完整阅读：
- .codex/skills/develop-dspidle/SKILL.md
- docs/PROJECT_STATUS.md
- docs/DEPLOYMENT_OPERATIONS.md
- docs/TESTING_RELEASE.md
- docs/NATIVE_APPLICATIONS.md
- docs/RELEASE_HANDOFF_1.0.35.md

开发交接当时生产仍为 1.0.34+4a7d51241424。候选源码提交：
48c74b7100dc41cea06a076255036f9b5610cda9
候选 Build ID：1.0.35+48c74b7100dc

先验证 source manifest：
D:\GameDev\DSPidle2\artifacts\release-manifests\1.0.35-48c74b7100dc.json
160 files，aggregate SHA-256：
4eab81d0025112e9ae177bfa5f11592cdede6e5233140e6537476d64a2921552

Web/API 候选归档位于：
D:\GameDev\DSPidle2\artifacts\release-packages\1.0.35-48c74b7100dc
先按交接中的大小和 SHA-256 复验并在未激活目录隔离启动。

该目录中的 Windows unpacked、Android APK/AAB 都是未签名诊断制品，禁止发布。
必须从 clean source commit 使用正式 HTTPS 地址重新构建；Android 只能使用既有长期证书，
不得创建或替换证书。完成 1.0.34→1.0.35 覆盖升级、本地存档保留、APK v2/v3、
Windows 签名状态、完整下载目录和 download/bundle manifest 后，才具备应用包发布资格。

当前还有强制真机门槛：两台不同档位 Android + 一台低配 Windows，覆盖 30 天离线、
30 天纯挂机、8x/12x/16x、1/7/20 MiB 云上传、弱网、取消、冲突、后台/锁屏、内存和温度。
未完成时不要描述为“全部真机达标”，不要切换稳定下载源。

API 仍使用 cloud schema v7 / SQLite layout v2，但新增内部账号安全、治理、榜单复核状态。
香港和上海分别创建并验证备份；未激活目录使用备份副本跑 server/ops 和治理 smoke。
不得合并两地数据库，不得用测试数据写生产，不得在服务器热改源码。

玩家速通成绩恢复不属于自动发布步骤。只有用户提供精确账号并单独授权后，才按
server/speedrun-recovery.mjs 的 dry-run→匹配备份→停服→精确确认→apply 流程执行；
不得凭截图或显示名直接写榜。

用户随后已明确授权精确候选、香港、上海和下载页，Release Agent 已完成原子发布。回滚只切回 1.0.34 代码/下载指针，
不恢复旧数据库。最终报告备份、旧/新目录、原子切换、公网健康、安装包签名与哈希、
下载 Range/cache、回滚指针和未验证风险；不得输出 PEM、密码、token、证书私钥或存档正文。
```
