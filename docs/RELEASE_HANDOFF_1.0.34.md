# DSPidle2 1.0.34 开发交接

> Role: develop → release complete
>
> 最终状态（2026-08-08）：Release Agent 已加载受保护的既有 Android 长期签名材料并完成全部正式门禁；香港、上海 Web/API、上海下载页及 Android/Windows 稳定应用包均已发布。当前 Build ID 为 `1.0.34+4a7d51241424`，完整证据和回滚指针见 [releases/1.0.34.md](./releases/1.0.34.md)。本文后续“阻塞”“不得发布”文字保留为开发交接时的历史条件，已由第 13 节完成记录取代。
>
> 当前生产基线：`1.0.34+4a7d51241424 / GameState v46 / envelope v2 / cloud schema v7 / SQLite layout v2`；直接代码回滚为 `1.0.33+2bd81de8d7f1`。

## 1. 交接结论

本批需求已在隔离工作树 `D:\GameDev\DSPidle2-release-1.0.34` 完成。当前唯一有效源码提交为 `4a7d51241424f4289c629377e896ec70f41cbe54`，Build ID 为 `1.0.34+4a7d51241424`。此前 `9f9714f973b0` 的 Android/Web/API/Windows/下载页候选属于旧代码口径，必须作废，不得发布。开发交接当时 Web/API/Windows 诊断制品和 source manifest 已绑定新提交，但 Android 长期签名门禁尚未完成；Release Agent 后续已在授权签名环境中补齐正式 Android、下载页和不可变 bundle，并完成生产发布。

完整开发门禁（当前提交）为 Vitest `842 passed / 16 skipped / 0 failed`、服务端 `53 passed / 1 skipped / 0 failed`（设置 `DSP_GALACTIC_THROUGHPUT_FIXTURE` 后实际 19 MiB 夹具测试通过）、运维 `6/6`、原生工具 `8/8`、`npm run typecheck`、`npm run build` 和 `git diff --check` 通过。当前专项 Playwright `game-flow + v130 + v132` 为 `121 passed / 0 failed`；全量其他 E2E 的可选夹具跳过仍按前一轮记录，未伪报全量命令再次完成。150 文件 source manifest 已生成并验证；正式 9/10 文件下载/bundle manifest 因 Android 签名阻塞未生成，只有明确标记的 diagnostic/partial 清单。

三份玩家存档只在内存副本和隔离临时服务中测试，测试前后 SHA-256 保持不变。没有将玩家存档提交到 Git、上传生产账号或写入生产数据库。

以上为开发角色交接时的门禁状态。Release Agent 后续已验证与 1.0.33 连续的长期 Android 证书，重新生成正式 APK、stable feed、下载页和完整 bundle/manifest，并在用户明确授权下完成生产发布；最终结果以第 13 节和 [正式发布记录](./releases/1.0.34.md) 为准。

## 0. 当前权威补充：跨星球吞吐修复

后续提交 `4a7d51241424f4289c629377e896ec70f41cbe54` supersedes 文档中旧候选 `9f9714f973b0`。新增 `server/galactic-metrics.mjs` 与客户端同口径聚合器，完整 `planetMetrics` 使用饱和加法；非法、负数、非有限值按 0 处理，缺失 `planetMetrics` 的旧存档回退根 `state.metrics` 并标记 `legacy-active-planet-v1`。排行榜只将全星区理论值写入 `galacticThroughputPerMinute`，当前星球写入 `activePlanetThroughputPerMinute`，实际结算吞吐继续独立使用相邻主云修订 `totalProduced` 增量，避免理论值与实际值混用。

19 MiB 本机受保护夹具以只读方式核验：20,164,029 字节；当前 `abyss` 理论值约 14,503,564,442.41/min；22 颗行星合计约 189,651,877,333.02/min；前后 SHA-256 一致。实际路径和原始文件不进入仓库，也没有上传或写回该存档。

## 2. 共享交接字段

| 字段 | 内容 |
| --- | --- |
| Task ID / title | `P0-CLOUD-UNIQUE-MEGASTRUCTURE-STACK-COMPAT`、`P1-ENDGAME-PURE-IDLE-SETTLEMENT-NONBLOCKING`、`P1-THROUGHPUT-METRIC-ACTUAL-VS-NOMINAL`、`P1-PURE-IDLE-EXIT-REASON-AND-RECOVERY`、`P0-ANDROID-CLOUD-GZIP-BLOB-HOTFIX`、`P2-CONNECTION-CANDIDATE-CARD-HIGHLIGHT` |
| Priority | 2 项 P0、3 项 P1、1 项 P2 |
| Source and attachments | `D:\GameDev\DSPidle2\docs\feedback\2026-08-07-下一批需求记录.md`；三份 2026-08-07 玩家存档只读副本；玩家云错误、排行榜和纯挂机截图 |
| Reproduction / evidence | 历史 `time_warp_device x3` 被服务端拒绝；Android gzip Blob 经 CapacitorHttp 桥接损坏；20 MB 终局档停止时重复校准/校验；理论峰值与实际结算量相差显著；纯挂机失败原因与保存提交边界不清；拉线只高亮端口不高亮卡片 |
| User-visible acceptance | 历史安全堆叠可云同步且新操作不再增加；Android raw 上传；Web gzip 编码错误最多同修订 raw 重试一次；纯挂机停止、失败和保存可恢复；排行榜显示实际结算吞吐；拉线高亮起点和候选建筑 |
| Compatibility | GameState v46、envelope v2、cloud schema v7、SQLite layout v2 不变；本地存档、云冲突、速通和普通排行榜身份规则保持 |
| Target platforms | Chrome、Edge、PWA、Windows Electron、Android Chrome/WebView；桌面和手机横竖屏 |
| Required tests | 全量单元/server/ops/native/build/E2E；三份真实存档；四槽云、gzip/raw、冲突、取消、恢复、Android 覆盖升级和原生签名 |
| Release target | `1.0.34`，独立 Release Agent 已于 2026-08-08 完成 |
| Rollback | 只回滚 Web/API/下载目录和应用更新指针到 1.0.33；不得恢复旧数据库、删除云修订、改写历史堆叠或清理未提交纯挂机检查点 |

## 3. 已实现内容

### 3.1 历史唯一巨构堆叠兼容

- 服务端四个云槽位允许 `time_warp_device` 与 `micro_black_hole_connector` 使用正安全整数历史堆叠，不再要求严格等于 1。
- 零、负数、小数、unsafe integer、损坏 checksum 和其他格式错误仍会拒绝；兼容没有放宽基本数值和完整性门禁。
- 客户端加载、保存、导出、重新载入和云上传均原样保留历史数量。运行能力仍按一个节点计算，不把历史 `x3` 放大成三倍时间扭曲或黑洞能力。
- 新的混合批量增加复用唯一巨构领域检查，预览和执行都会跳过这两类实体，施工托盘不扣除被跳过项目；普通建筑和传送带仍按原规则原子执行。

### 3.2 Android 云上传与 Web 安全回退

- Android 原生应用不再把 gzip Blob 交给 CapacitorHttp，云上传预先使用原始 JSON 字符串；30 MiB 明文安全上限保持。
- Web/PWA/Windows 继续使用流式 gzip。只有首次请求确实使用 gzip 且服务端返回 `400 / REQUEST_ENCODING_INVALID` 时，客户端才以相同 `expectedRevision` 补发一次 raw JSON。
- 用户取消抛出 `AbortError` 且绝不回退；409 继续进入冲突流程；网络超时仍先核对远端修订和摘要，不能误当压缩错误。
- 编码错误发生在业务正文解析前，不创建半条云修订。raw 重试仍受修订保护，失败、取消和超限不会清理或覆盖本地主档。

### 3.3 纯挂机停止、保存与恢复

- 点击停止后先冻结目标墙钟边界，复用当前已完成校准的 `pure-idle-macro-v3` Worker，不再创建第二个 finalizer 重跑整段校准。
- Worker 代次、request ID、`settlementId`、检查点指纹和冻结边界共同隔离重复点击及迟到消息，最终收益最多提交一次。
- `committed=true` 只在 `saveGameVerified()` 写入并读回验证成功后持久化。保存失败时保留检查点、当前 Worker、退出原因和可重试状态，不会静默返回画布。
- 覆盖层提供明确的保存失败、Worker 失败、重试和“放弃未结算时间”入口；破坏性放弃要求玩家主动确认。
- 旧恢复记录按默认值兼容。后台高倍率宽限仍为 300 秒，超过部分进入普通快速离线结算，不把关闭页面后的全部墙钟时间错误计为高倍率。

### 3.4 实际结算吞吐排行榜

- 客户端将原 `metrics.totalItemsPerMinute` 明确为理论峰值诊断，并独立展示实际结算吞吐。
- 服务端按同一账号相邻主云修订的 `totalProduced` 增量计算 `settled-total-produced-v1`；窗口至少相隔 60 个模拟秒。没有有效相邻窗口时不以理论峰值补数。
- 白糖实际产量继续使用独立累计字段；发电、戴森和其他榜单字段继续从已验证主云快照提取。
- 旧 `peakThroughputPerMinute` 仅保留 legacy/诊断用途，不与新实际吞吐峰值合并，也不再抬高新口径综合分。历史云档和公开记录没有被删除。

### 3.5 拉线候选建筑高亮

- 鼠标拖拽、单击连线和触摸连线共用现有 `connectionDraft`，起点建筑使用独立静态高亮，至少有一个兼容端口的当前行星建筑使用候选高亮。
- 候选集合复用现有接受输入、产生输出和特殊通用端口目录，并与寻线、任务及网络聚焦 class 组合显示；不每次指针移动全量重建玩法状态。
- 高亮只表示“可尝试目标”。最终连线仍执行同星球、物品、端口、线路等级、重复线路、锁定状态和施工库存校验。
- 成功、取消、Escape、点击空白、切换星球或离开画布后清除，不写入 GameState、存档或云数据。亮色、深色、移动端和终局极限模式均使用不改变卡片尺寸的静态样式。

## 4. 完整 clean commit 门禁

所有正式二进制和归档均从 clean source commit `9f9714f973b002c458c1f16ad0560f9ddd45dbce` 生成。之后的文档提交不进入制品。

| 命令或门禁 | 结果 |
| --- | --- |
| `npm ci` | 通过；根依赖仍有既有 `1 moderate + 4 high` audit 告警 |
| `npm --prefix server ci` | 通过；0 个已知漏洞 |
| `npm run licenses:check` | 通过；128 个运行时包一致 |
| `npm run typecheck` | 通过；0 个 TypeScript 错误 |
| `npm test -- --run` | 836 项通过、16 项跳过、0 失败 |
| `npm run test:server` | 51/51 通过 |
| `npm run test:ops` | 6/6 通过 |
| `npm run test:native` | 8/8 通过 |
| `npm run build` | 通过；`dist/version.json` 为 `1.0.34+9f9714f973b0` |
| `npm run test:e2e` | 254 项通过、11 项显式可选夹具/故障注入跳过、0 失败 |
| `git diff --check` | 通过 |
| source / download / bundle manifest | 149/149、9/9、10/10 全部验证通过 |

全量 Playwright 中对 `127.0.0.1:65534` 的连接拒绝是 API 隔离代理测试配置，不是生产 API 连接失败。浏览器没有连接生产 API。

## 5. 真实存档与平台验证

### 5.1 只读夹具

| 夹具 | 字节 | SHA-256 | 用途 |
| --- | ---: | --- | --- |
| 本机受保护小档附件 | 304,662 | `6573FE78573E45FD29854DF69BCAE2A4FD8F3EE9D6FFCB9F87112BD4AF5C55D7` | 历史时间扭曲装置 `x3`、四槽云兼容 |
| 本机受保护终局附件 | 20,164,029 | `37848F48FA3764CDED937560765A6B0F91048CB22867A24BD4AADB8D2414A148` | 11,604 实体、27,669 线路终局离线/纯挂机/云准备 |
| 本机受保护小号附件 | 886,038 | `0D313BB2096C4D99CD281C968C9E9D8AD8E3B9FB12C22D450A0ACE707C965872` | 小号吞吐与 8x/12x/16x 回归 |

三份文件在最终核验后仍保持上述大小和 SHA-256。

### 5.2 Chrome 与 Edge 最大档

| 场景 | Chrome | Edge 最终隔离复验 |
| --- | ---: | ---: |
| 30 天快速离线 | 约 23.84s | 四段约 24.98s / 24.26s / 25.01s / 24.87s |
| 时间扭曲 8x / 12x / 16x | 约 5.90s / 3.34s / 3.49s | 约 7.08s / 4.65s / 5.49s |
| 30 天纯挂机 | 约 21.29s，实际 12x | 约 20.96s |
| 云上传准备 | 约 10.23s，主线程长任务 0 | 约 9.65s |
| 云专项 | 3/3 | 3/3 |

Edge 首轮在 Android 模拟器和 Gradle daemon 同时占用资源时出现一次 `30.527s`，超过 30 秒目标；第二次完整复跑的外层命令本身超时。关闭模拟器与 Gradle daemon 后，相同断言全部通过。20 MB 终局档的性能余量会受设备负载影响，因此本交接不能承诺任意设备、任意负载下恒定低于 30 秒。

### 5.3 原生平台

| 平台 | 结果 |
| --- | --- |
| Android 36.1 模拟器 | `1.0.33 -> 1.0.34` 使用 `install -r` 覆盖成功，`firstInstallTime` 不变，启动无 Fatal/ANR |
| Android 包 | `1.0.34 / 1000034`；APK Signature Scheme v2/v3 通过，与 1.0.33 批准长期证书连续 |
| Windows Electron | 安装包和主程序 FileVersion/ProductVersion 正确；正式解包应用用隔离 user-data 启动并存活 10 秒 |
| Windows 签名 | 安装包和主程序均为预期 `NotSigned`；没有创建临时证书 |

Windows 首次联网下载 Electron 43.1.1 超时；最终使用 SHA-256 与官方锁定值一致的本机缓存和项目既有 fallback 路径构建成功。`release/smoke-user-data-1.0.34` 仅是隔离启动数据，未进入 bundle、下载目录或任一 manifest。

## 6. 修改文件

`323b863..9f9714f` 共修改 63 个文件，1,378 行新增、228 行删除。精确列表可用 `git diff --name-status 323b863..9f9714f` 复验。

- 版本与文档：`package.json`、`package-lock.json`、`android/native-version.properties`、`docs/ARCHITECTURE.md`、`GAMEPLAY_SYSTEMS.md`、`NATIVE_APPLICATIONS.md`、`PROJECT_STATUS.md`、`TESTING_RELEASE.md`。
- 云与账号：`src/game/cloud.ts`、`cloud.test.ts`、`account.ts`、`account.test.ts`、`server/index.mjs`、`server/server.test.mjs`。
- 排行榜：`src/game/leaderboard.ts`、`leaderboard.test.ts`、`server/leaderboard-moderation.mjs` 及其测试、`src/components/GalaxyWorkspace.tsx`。
- 纯挂机：`src/App.tsx`、`src/components/TimeWarpIdleOverlay.tsx`、`src/game/pureIdleRecovery.ts`、`src/game/storage.test.ts`。
- 批量命令与拉线：`src/game/engine.ts`、`p2SelectionBatch.test.ts`、`src/styles.css`、`tests/e2e/game-flow.spec.ts`。
- 公告与翻译：`src/components/ReleaseNotesDialog.tsx` 及测试、`src/i18n/legacyTranslations.ts` 及测试。
- E2E 版本刷新与专项：`tests/e2e/v115-pure-idle-tutorial.spec.ts`、`v130-offline-timewarp-real-save.spec.ts`、`v132-pure-idle-macro.spec.ts` 以及既有版本断言文件。

## 7. 历史旧候选制品（已作废，不得发布）

制品根目录：`D:\GameDev\DSPidle2-release-1.0.34\release\bundle-1.0.34-9f9714f973b0`

| bundle 相对路径 | 字节 | SHA-256 |
| --- | ---: | --- |
| `android/dsp-idle-1.0.34-1000034.apk` | 4,840,401 | `9ed932dba88806927925b721c0b0e96c33ce093b7f841758f9881220dda99b03` |
| `android/stable.json` | 598 | `1a355ee2622b13993c56d73af18449c3ff52dca3360e0415202563c610ef151c` |
| `api-1.0.34-9f9714f973b0-clean.tar.gz` | 82,734 | `37aafd910755287e7e6827bbea9391ae37cf6b5f910c4346c1f802dbc3d6f8dd` |
| `download-site-1.0.34-9f9714f973b0.tar.gz` | 116,105,667 | `76d12a979ec2a89b968cdbfe729911cbc74e840f78f4216121441bf740a13e99` |
| `version.json` | 94 | `34931efe061f4750fc8e363b01fa3dcc41c821c3a759fe4a4c9a96807ffac2d0` |
| `web-1.0.34-9f9714f973b0-clean.tar.gz` | 1,320,229 | `fa68bfae2aba2cb3f58215fb8b1dbed272fb2d24c253aa8481b7b3988970dea4` |
| `windows/dsp-idle-1.0.34-x64-setup.exe` | 112,418,530 | `ddda2bde0f3f649a16cb735a4661f11bebd081de8cc65c4028decfe237740f2a` |
| `windows/dsp-idle-1.0.34-x64-setup.exe.blockmap` | 118,414 | `ddfc1fcfadec3c8e7df7eff79eeefc094386b9baf8cd284e61d9e5e3c6101ce5` |
| `windows/latest.yml` | 356 | `4895306eb0624ed7438741953423176638273207727435db2a22dd6d779ec9f2` |
| `windows/release.json` | 618 | `97708e1abe09c2cc1a42a61ac656a53c357226215d2cf29826af1be841d8e45b` |

独立路径：

- Web：`D:\GameDev\DSPidle2-release-1.0.34\release\web-1.0.34-9f9714f973b0-clean.tar.gz`
- API：`D:\GameDev\DSPidle2-release-1.0.34\release\api-1.0.34-9f9714f973b0-clean.tar.gz`
- Android/Windows 更新源：`D:\GameDev\DSPidle2-release-1.0.34\release\update-feed-1.0.34-9f9714f973b0`
- 下载站目录：`D:\GameDev\DSPidle2-release-1.0.34\release\download-site-1.0.34-9f9714f973b0`
- 下载站归档：`D:\GameDev\DSPidle2-release-1.0.34\release\download-site-1.0.34-9f9714f973b0.tar.gz`

Web、API、下载站归档解包后分别与源目录逐文件比较，`126/126`、`23/23`、`9/9` 完全一致。API 归档使用明确白名单，不含 `node_modules`、SQLite、data、备份、环境文件或秘密材料；APK、bundle 和文档均不含 keystore、密码、token 或私钥。

## 8. 历史旧候选 Manifest 与签名（仅供审计，不得发布）

| 清单 | 文件数 | 聚合 SHA-256 |
| --- | ---: | --- |
| `D:\GameDev\DSPidle2-release-1.0.34\artifacts\release-manifests\1.0.34-9f9714f973b0.json` | 149 | `a98f633452e671e40424637735b6ae0ae1eaeeceb8c186c796997f2ad1e5ceee` |
| `D:\GameDev\DSPidle2-release-1.0.34\artifacts\release-manifests\1.0.34-9f9714f973b0-download.json` | 9 | `043c2e9e2e3fdce10b7641eaeab28d93c6284bfd1ce5df7b65b2dddf8acbe6fa` |
| `D:\GameDev\DSPidle2-release-1.0.34\artifacts\release-manifests\1.0.34-9f9714f973b0-bundle.json` | 10 | `59ceea847f5bfb7653c089e22730f741656f42e270ecc523afbc6c72378d3bfc` |

三份清单均已执行 `node deploy/create-release-manifest.mjs --verify <manifest>`。Android 包名为 `cn.dsponline.network`，版本为 `1.0.34 / 1000034`，APK v2/v3 和长期证书连续性通过；没有创建、替换或输出 keystore。Windows FileVersion 为 `1.0.34`，ProductVersion 为 `1.0.34.0`，安装包和解包主程序 Authenticode 均为 `NotSigned`。

## 9. 未验证项目与剩余风险

- 没有物理 Android 设备。Android 36.1 模拟器覆盖升级和启动通过，但真实 Android Chrome/WebView 的 1/2/7/20 MiB 隔离云服务上传、低内存、锁屏、温度和耗电未完成。
- 没有使用生产测试账号执行云写入，也没有向生产数据库上传夹具。Release Agent 若获单独授权，只能使用专用测试账号和新建非玩家存档，且必须避免覆盖现有主云档。
- Electron 只完成正式包元数据和隔离启动，没有在 Electron 生命周期中重新运行 20 MB 的 30 天真实存档；相同 Worker 算法已由 Chrome 与 Edge 覆盖。
- Edge 首轮在高系统负载下曾出现一次 30.527 秒；最终隔离复验通过，但不能将 30 秒描述为任意硬件上的硬保证。
- 20 MB Android raw JSON 超过 7 MB 常见档很多，虽然低于 30 MiB 客户端上限，但真机桥接峰值内存和上传耗时仍需发布前后重点观察。
- 实际结算吞吐需要两次至少相隔 60 个模拟秒的主云修订。新口径上线初期部分玩家会显示尚无有效窗口，榜单数字也可能显著低于旧理论峰值；这是口径修复，不应通过回填理论值掩盖。
- 根项目 audit 仍有 1 个 moderate、4 个 high 的既有依赖告警；本批没有在 P0 热修中升级依赖。

## 10. Release Agent 边界与回滚（发布前历史要求）

Release Agent 只能使用下方第 12 节列出的当前 source commit `4a7d51241424...` 制品；文档中旧 `9f9714f...` bundle 全部作废。不得从本交接的后续 docs-only 提交重建二进制，不得在服务器上编辑源码，不得创建新 Android 证书。当前 Android 签名门禁未完成，禁止发布。

发布前生产基线和直接回滚目标均为 `1.0.33+2bd81de8d7f1`。发布需要分别备份香港与上海 SQLite 并验证，不得代理、复制或合并两地数据库。回滚只切换代码和下载指针，不恢复旧数据库，不删除新云修订，不改写玩家历史巨构堆叠，也不清理客户端纯挂机恢复记录。

## 11. 给 Release Agent 的交接提示词（已执行）

```text
Role: release

任务：发布 DSPidle2 1.0.34。先完整阅读：
- .codex/skills/develop-dspidle/SKILL.md
- docs/PROJECT_STATUS.md
- docs/DEPLOYMENT_OPERATIONS.md
- docs/TESTING_RELEASE.md
- docs/NATIVE_APPLICATIONS.md
- docs/RELEASE_HANDOFF_1.0.34.md

当前生产基线是 1.0.33+2bd81de8d7f1。当前开发源码提交是
4a7d51241424f4289c629377e896ec70f41cbe54，Build ID 是
1.0.34+4a7d51241424。当前只有 partial/diagnostic 目录，不能发布：
D:\GameDev\DSPidle2-release-1.0.34\release\bundle-1.0.34-4a7d51241424-partial

在 Android 长期签名凭据加载前不得执行发布。凭据加载后必须从当前 clean source commit
重新生成正式 APK、stable feed、下载页和完整 bundle，再独立验证三份清单，任一大小、SHA-256、文件数、聚合哈希或 Build ID
不匹配都立即停止：
- artifacts/release-manifests/1.0.34-4a7d51241424.json
- 凭据加载后新生成的 `1.0.34-4a7d51241424-download.json`
- 凭据加载后新生成的 `1.0.34-4a7d51241424-bundle.json`

不要从后续文档提交重建二进制，不要在 VPS 热改 source/gameplay，不要创建新 Android
证书。Android 必须复验 APK v2/v3、1.0.33 -> 1.0.34 长期证书连续性和覆盖升级保档；
Windows 必须保持并明确标注 NotSigned。

只有上述三份正式清单、Android v2/v3 和 1.0.33→1.0.34 证书连续性均通过，并取得用户对目标节点和下载页的明确发布授权后，才可分别对香港和上海执行发布前 SQLite
Backup API 备份及 quick_check，记录账号、主云档、修订、正文、排行榜等摘要。上传到新的
未激活目录，复验 149 文件 source manifest、生产依赖和备份副本隔离健康；先香港后上海
原子切换。两地数据库必须保持独立，不得复制或合并。下载站使用新的 9 文件目录。

发布后验证 version.json、Service Worker、当前和 1.0.33 hashed assets、schema v7/layout v2、
CORS、未登录 401、四槽云读取、Android raw 云上传、Web gzip 上传与编码拒绝 raw 回退、
本地生成的 time_warp_device x3 合成夹具专用测试账号上传、实际吞吐新窗口、APK/EXE/blockmap
完整下载哈希、Range 206、immutable/no-cache、桌面和手机页面。不要上传玩家真实存档，
不要覆盖已有主云档。

在此之前只记录阻塞，不连接 VPS。门禁齐全后记录服务 active/NRestarts、磁盘、当前目录、回滚目录、发布前后数据库摘要及下载目录。
失败时只回滚代码和下载指针到 1.0.33，不恢复旧数据库。不得在日志、文档或回复中输出
PEM、密码、token、keystore、证书私钥或玩家存档正文。
```

## 12. 开发交接时的提交、制品与阻塞（历史）

- Git：`4a7d51241424f4289c629377e896ec70f41cbe54`；Build ID：`1.0.34+4a7d51241424`；工作树代码在 `D:\GameDev\DSPidle2-release-1.0.34`。
- Source manifest：`D:\GameDev\DSPidle2-release-1.0.34\artifacts\release-manifests\1.0.34-4a7d51241424.json`，150 文件，聚合 SHA-256 以该清单为准，已执行 verify。
- Web 归档：`D:\GameDev\DSPidle2-release-1.0.34\release\web-1.0.34-4a7d51241424-clean.tar.gz`，1,321,163 字节，SHA-256 `3b496395bffffc69885212bdacdf04f64350aee7a0b712b801cc4932ba5cb7a6`。
- API 归档：`D:\GameDev\DSPidle2-release-1.0.34\release\api-1.0.34-4a7d51241424-clean.tar.gz`，84,461 字节，SHA-256 `faf55d48265bdaeba71ccb503440346d4f74af64e1bfcf2c7dcbbc51bfc5f7f5`；白名单不含 node_modules、SQLite、data、备份、环境文件或秘密材料。
- Windows 诊断包：`D:\GameDev\DSPidle2-release-1.0.34\release\build-1.0.34-4a7d51241424\dsp-idle-1.0.34-x64-setup.exe`，103,255,059 字节，SHA-256 `97c46f2de17539cc79886f10eeba0b3a9c94083671624b88f22970ab500f112f`；blockmap 110,926 字节，SHA-256 `40a5d812827a4343a816e766697277aaace9cb3d4ca5a461307f670d29eacaff`；Authenticode `NotSigned`，符合历史策略。
- Android 诊断包（禁止发布）：`D:\GameDev\DSPidle2-release-1.0.34\release\bundle-1.0.34-4a7d51241424-partial\diagnostic\android\dsp-idle-1.0.34-1000034-unsigned.apk`，4,776,895 字节，SHA-256 `3e30d7b2e0e908178afb985b6f7814699ebf68e3e0f77fd59ae6299c2bb253f9`。它仅证明当前代码可构建，不满足长期证书、v2/v3 正式发布门禁。
- Partial manifest：`D:\GameDev\DSPidle2-release-1.0.34\artifacts\release-manifests\1.0.34-4a7d51241424-partial.json`，8 文件，已 verify；diagnostic 下载页清单为 `...-diagnostic-download.json`，10 文件，已 verify。两者都不是发布清单。

### Release Agent 阻塞（历史，已解除）

开发交接当时的环境没有加载 1.0.33 使用的 Android 长期签名凭据，因此该阶段不能生成正式 `dsp-idle-1.0.34-1000034.apk`、稳定 Android JSON、正式下载页、9 文件下载清单和 10 文件 bundle 清单。发布阶段未使用 VPS SSH 密钥或新建证书替代；Release Agent 已在授权签名环境中从当前 commit 重建 Android，验证 v2/v3、证书连续性与覆盖升级保档，并补齐正式清单后完成发布。

## 13. Release Agent 完成记录（最终权威）

- 最终源码仍为 clean commit `4a7d51241424f4289c629377e896ec70f41cbe54`；发布目录和 Build ID 为 `1.0.34-4a7d51241424` / `1.0.34+4a7d51241424`。
- 正式 source/download/bundle manifests 分别为 150、9、10 文件，聚合 SHA-256 为 `fe8844da07294e91f8938715fb8c1b861c5785129854a653c8c0e8f1c3da6581`、`e1d215eeea62374439a28d24081852b40a80f8231464a81f12e092d169b414d6`、`701d73f20dbd5c589d4a1ca827e8f039e511b78f806c5fc50a704a5c0f6fd370`。
- 正式 Android APK 为 4,841,083 字节、SHA-256 `d556e6f3690cbe709d0f493019b55fdadc20658ef865bef9cbc71b1b1511a49e`；v2/v3、zipalign、批准证书连续性和 1.0.33→1.0.34 覆盖升级通过。没有创建新证书，也没有使用 VPS PEM 签名应用。
- 正式 Windows installer 为 103,255,059 字节、SHA-256 `97c46f2de17539cc79886f10eeba0b3a9c94083671624b88f22970ab500f112f`；blockmap SHA-256 为 `40a5d812827a4343a816e766697277aaace9cb3d4ca5a461307f670d29eacaff`。两者按历史策略保持 `NotSigned`。
- 香港、上海 Web/API 当前均为 `1.0.34-4a7d51241424`，直接回滚为 `1.0.33-2bd81de8d7f1`；上海下载页当前为 `download-site-1.0.34-4a7d51241424`，直接回滚为 `download-site-1.0.33-2bd81de8d7f1-r2`。
- 两地发布前 Backup API 快照、未激活目录、生产依赖、隔离启动、原子切换、公网 9 文件完整哈希、Range/cache、当前/历史资源和五场 Chrome smoke 均通过。香港大库启动窗口的 502/504 已收敛，最近 15 分钟为 0；两地服务 active、`NRestarts=0`。
- 最终、可审计且包含备份路径、制品哈希、观察窗口和回滚命令的记录见 [1.0.34 正式发布记录](./releases/1.0.34.md)。
