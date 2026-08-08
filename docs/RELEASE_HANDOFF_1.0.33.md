# DSPidle2 1.0.33 开发交接

> **发布状态（2026-08-07）**：1.0.33 已完成香港、上海 Web/API、上海下载页和 Android/Windows 稳定应用包发布。完整生产证据见 [1.0.33 发布记录](./releases/1.0.33.md)。
>
> 当前生产 Build ID 为 `1.0.33+2bd81de8d7f1`；两地 Web/API 回滚目标为 `1.0.32-762bf693becb`。上海下载页当前为 `download-site-1.0.33-2bd81de8d7f1-r2`，直接回滚目标为原 1.0.33 目录，更深一层状态文件指向 1.0.32-r2。
>
> 最终 r2 下载 manifest 为 9 个文件、聚合 SHA-256 `5a369e3d21181c5fb11635078a50889ecf0dcb6a28e68530d9b1a92102a78822`；最终 r2 bundle 为 10 个文件、聚合 SHA-256 `64a3a51c45b33c51f1c97aa5b08caae9c92696bb2bece57ee94d34bcf236eefc`。favicon 声明修复提交为 `262b4b43121b8435d6f095ed053a50fe352e7e35`，APK、EXE、blockmap、Web 和 API 制品未重建且哈希不变。
>
> 以下内容保留开发交接生成时的发布前语境；其中“未授权发布”和“生产仍为 1.0.32”不是当前线上状态。

> Role: develop
>
> 开发交接原始状态：开发完成且不可变制品已就绪；当时不授权连接 VPS、切换生产版本或更新公网下载页。
>
> 发布前生产基线：`1.0.32+762bf693becb`；目标：`1.0.33 / GameState v46 / envelope v2 / cloud schema v7 / SQLite layout v2`。

## 1. 交接结论

`P0-ENDGAME-FAST-SETTLEMENT-NONBLOCKING` 已实现 `fast-30s-v2` 与 `pure-idle-macro-v3`。有限和无限科研不再阻断快速离线或时间扭曲纯挂机；启动、刷新恢复和旧恢复记录迁移都会重新计算权威供电倍率。普通合同、尾验、校准或 Worker 失败只能转入有界保守宏观，不再创建覆盖完整离线/挂机时长的精确重放。

不可变制品来自 clean source commit `2bd81de8d7f16040620378d37cb73649cf09dd17`，Build ID 为 `1.0.33+2bd81de8d7f1`。完整开发门禁、Chrome/Edge 真实存档、Android 覆盖升级、Electron 隔离启动、Android v2/v3 和 Windows `NotSigned` 均已复验；149 文件 source manifest、9 文件下载目录 manifest 和 10 文件最终 bundle manifest 全部通过。后续只允许提交本文等证据文档，不能从文档提交重建或替换已经绑定 `2bd81de8...` 的二进制。

开发交接生成时，代码和制品只存在于隔离工作树 `D:\GameDev\DSPidle2-release-1.0.33`，没有修改主工作区、stash、生产节点、生产数据库或公网下载页；当时生产仍为 `1.0.32+762bf693becb`。

## 2. 共享交接字段

| 字段 | 内容 |
| --- | --- |
| Task ID / title | `P0-ENDGAME-FAST-SETTLEMENT-NONBLOCKING`：科研和复杂终局状态不得阻断离线与时间扭曲纯挂机 |
| Priority | P0 |
| Source and attachments | `docs/feedback/2026-08-07-离线与时间扭曲终局快速结算开发提示词.md`；两份 2026-08-07 玩家存档只读副本 |
| Reproduction / evidence | 1.0.32 可继承陈旧 `effectiveMultiplier=1`；活动有限/无限科研会拒绝宏观并留下冻结恢复状态；快速离线会因科研回到整段精确重放 |
| User-visible acceptance | 科研运行中仍可快速开始、停止、刷新和恢复；倍率来自实际供电；阶段、科研、现实耗时和降级原因真实显示；取消或失败不改原档 |
| Compatibility | GameState v46、envelope v2、cloud schema v7、SQLite layout v2、速通与普通排行榜口径不变 |
| Target platforms | Chrome/Edge Web、PWA、Windows Electron、Android Chrome/WebView；桌面与手机横竖屏 |
| Required tests | 全量单元/server/ops/native/build/E2E；两份真实终局夹具只读基准；取消、失败、恢复、重载和确定性 |
| Release target | `1.0.33`，由独立 Release Agent 决定和执行；本交接不授权发布 |
| Rollback | 只回滚 1.0.33 代码与入口，不回滚玩家数据、恢复旧数据库或删除恢复记录；1.0.32 必须继续读取标准 v46 存档 |

## 3. 已实现内容

### 3.1 快速离线 `fast-30s-v2`

- `offlineSimulation.worker.ts` 使用独立策略状态机区分 `fast`、`conservative`、`bounded-exact`、`invalid-source`、`cancelled` 和 `worker-failure`。
- 长时间离线只做最多 30 个模拟秒的精确校准；普通合同不可用或尾验超过门槛时转保守宏观，不再整段精确重放。
- Worker 传递约 30 秒软 deadline 与 60 秒硬 deadline，阶段遍历持续检查取消；用户取消不触发回退。
- 主线程隔离退休 Worker 的迟到消息；普通离线 Worker 异常或 deadline 只从原始状态启动一次有界零校准保守重试，该重试仍失败就明确返回且不提交候选。失败次数不跨普通离线会话持久化。
- 校准候选若出现非法结构、数值或循环游标会被完整丢弃；源存档无效使用独立 `invalid-source` 结果，不伪装成算法失败。

### 3.2 科研宏观账本

- `researchMacro.ts` 从精确校准窗口提取实际矩阵投入与科研站输入变化，不按建筑理论产能推算。
- 有限科技使用整数预算并调用现有幂等完成/队列领域函数；不会在组件或宏观通用仿射层直接改科技数组。
- 无限科技累计成本、跨级投资和余数使用 `BigInt`；等级、进度、银河评分和自动研究边界沿用现有规则。
- 科研输入池按稳定实体顺序消费并保留历史合法超容量缓存；没有活动科研时不增加普通工厂的高频工作。

### 3.3 时间扭曲 `pure-idle-macro-v3`

- 启动和恢复在独立候选上重新分配普通电网并求值时间扭曲主控，修复停止快照陈旧 `1x`。
- 请求倍率、供电允许倍率和实际倍率分离；倍率只扩大需要结算的模拟时间，不使 Worker 工作量线性放大。
- 有限/无限科研不再选择精确专用分支；普通合同失败时冻结不确定产线并保守少发，不阻塞会话。
- 实时模拟 Worker 的兼容近似路径同步升级为 `time-warp-short-calibration-v3`，短校准会建立科研账本，不再因活动科研把 8x/12x/16x 切片退回完整精确模拟。
- Worker 代次、request ID 和停止边界共同隔离迟到消息；恢复日志持久保存失败次数、统一 baseline 和降级原因。
- 旧 `pure-idle-macro-v2` 记录可继续读取；后台高倍率仍只宽限 300 秒，超出尾段交给普通快速离线结算。

### 3.4 存档和 UI

- 所有快速结算在 GameState 副本上完成；只有 normalize、结构/数值验证、`serializeEnvelope()`、`inspectSave()` 和正式重载全部通过后才写入主档。
- 离线报告和纯挂机覆盖层显示校准、宏观、保守宏观、验证、恢复等真实阶段，以及算法版本、科研、现实耗时、倍率和降级原因。
- GameState、存档 envelope、云协议和 SQLite 均未迁移；快速/保守算法标记只用于诊断与会话恢复。

## 4. 最终 clean commit 门禁

所有正式制品均从 source commit `2bd81de8d7f16040620378d37cb73649cf09dd17` 生成。构建原生包后重新执行普通 Web 构建，source manifest 与 Web/API 归档使用同一份最终 `dist`；后续文档提交不进入制品。

| 命令或门禁 | 结果 |
| --- | --- |
| `npm ci` | 通过；npm audit 仍报告既有 1 个 moderate、4 个 high 依赖问题 |
| `npm --prefix server ci` | 通过；0 个已知漏洞 |
| `npm run licenses:check` | 通过；128 个运行时包一致 |
| `npm run typecheck` | 通过；0 个 TypeScript 错误 |
| `npm test -- --run` | 91 个文件通过、5 个跳过；825 项通过、16 项跳过、0 失败 |
| `npm run test:server` | 49/49 通过 |
| `npm run test:ops` | 6/6 通过 |
| `npm run test:native` | 8/8 通过 |
| `npm run build` | 通过；`dist/version.json` 为 `1.0.33+2bd81de8d7f1` |
| `npm run test:e2e` | 251 项通过、11 项显式可选夹具/基准跳过、0 失败；262 项总计 |
| Edge 真实终局专项 | 16/16 通过；`v130` 2 项 + `v132` 14 项 |
| `git diff --check` | 通过 |
| source / download / bundle manifest | 149/149、9/9、10/10 全部验证通过 |

全量 Playwright 中对 `127.0.0.1:65534` 的 API 代理连接失败是测试隔离配置，浏览器没有连接生产 API；这不是云 API 回归。首轮全量 E2E 暴露的 1.0.32 公告断言和慢速全页截图都已在最终 source commit 修复，以上 251/11/0 是修复后的完整复跑结果。

## 5. 平台与真实存档结果

### 5.1 平台矩阵

| 平台 | 结果 |
| --- | --- |
| Google Chrome | 完整 262 项矩阵为 251 通过、11 预期跳过；两份真实存档各 16/16 通过 |
| Microsoft Edge | 大型真实存档 16/16 通过；覆盖长离线、8x/12x/16x、取消、单次重启、迟到消息、恢复和 30 天纯挂机 |
| Windows Electron | `1.0.33` 解包应用使用隔离 user-data 启动并连续运行 10 秒；包内版本、Build ID、API 和更新源正确 |
| Android 36.1 模拟器 | `1.0.28 → 1.0.32 → 1.0.33` 连续 `install -r` 成功，`firstInstallTime` 保持不变；1.0.32/1.0.33 均启动且无 Fatal/ANR |

### 5.2 只读夹具

| 夹具 | 摘要 |
| --- | --- |
| 小档 | `D:\360安全浏览器下载\dsp-idle-save-2026-08-07.json`；SHA-256 `F62454361555FCA88C96F398AA34A4BFAA482E1A90E3651ADF308ADE85334F58`；305,254 字节；225 实体；191 线路 |
| 大档 | `C:\Users\WINDOWS\Downloads\dsp-idle-save-2026-08-07.json`；SHA-256 `0A251ADEFA5E467C6F4FDBBA2964623D295E499A9CB48EED814A10B37B18F4E7`；3,905,264 字节；1,910 实体；4,479 线路；无限科研 `matrix_compression` 263 级 |

两份源文件在所有测试前后保持逐字节相同，没有保存、覆盖、提交到 Git 或上传生产账号。

### 5.3 快速离线与时间扭曲

| 大档离线时长 | Chrome 往返 | Edge 往返 | 关键尾验估计误差 |
| --- | ---: | ---: | ---: |
| 6,984 秒 | 约 3.38s | 3.44s | 3.71% |
| 30,171 秒 | 约 2.92s | 3.04s | 9.13% |
| 7 天 | 约 2.96s | 3.05s | 66.83% |
| 30 天 | 约 2.94s | 3.08s | 89.62% |

小档四个离线窗口均约 `0.39～0.68s`。全部长窗口使用 `fast-30s-v2`，经过校准、宏观和验证，完整推进请求秒数并通过 envelope v2 序列化、`inspectSave()` 与 GameState v46 正式重载。上表是算法的关键尾验估计值，不是把 30 天完整精确模拟跑完后的逐字段误差；普通库存、缓存和瞬时物流允许更大偏差，结构安全与非负/有限整数仍是硬门禁。

Edge 大档实时兼容路径结果：8x / 12x / 16x 切片往返约 `0.93s / 0.61s / 0.61s`，使用 `time-warp-short-calibration-v3`；终止约 `256ms`，没有迟到 Worker 消息。Chrome 对应约 `0.96s / 0.61s / 0.61s`。

### 5.4 30 天纯挂机

| 夹具 | 耗时 | 倍率 | 结果 |
| --- | ---: | --- | --- |
| 小档 | 约 0.57s | 请求 9x，实际 8x | 守恒门禁冻结不确定产线并安全少发，正式重载有效 |
| 大档 | Chrome 约 2.77s；Edge 2.78s | 请求 14x，供电允许/实际 13x | `pure-idle-macro-v3`，完整推进 2,592,000 墙钟秒 |

大档无限科研从 263 级推进到 379 级；白矩阵增加 `25,151,673,830,400`，结构点和实际火箭各增加 `2,258,786,649,600`，戴森总发电增加 `207,341,601,405,569,540 kW`。实体和线路数量保持，航线 cargo/progress 合法，重复运行确定性和取消保留源状态均由自动化覆盖。

Chrome 大档观测主线程堆峰值约 106 MB；本轮 Edge 报告的最高 `usedJSHeapSize` 约 94.7 MB；Node 只读基准 RSS 峰值约 1.08 GB。RSS 是整个 Node 进程的观测值，不能直接等同于浏览器或手机内存。

## 6. 修改文件

`8653ca7..2bd81de` 共 65 个文件。精确列表可用 `git diff --name-status 8653ca7..2bd81de` 复验；主要所有权如下：

- 新增 `src/game/offlineSettlementStrategy.ts`、`src/game/offlineSettlementStrategy.test.ts`、`src/game/researchMacro.ts`、`src/game/researchMacro.test.ts`。
- 修改 `src/game/offlineApproximation.ts`、`offlineSimulation.ts`、`offlineSimulation.worker.ts`、`pureIdleMacro.ts`、`pureIdleMacro.worker.ts`、`pureIdleMacroClient.ts`、`pureIdleRecovery.ts`、`infiniteResearch.ts`、`engine.ts` 及对应单测。
- 修改 `src/App.tsx`、`src/components/StartMenu.tsx`、`OfflineReportWorkspace.tsx`、`TimeWarpIdleOverlay.tsx`、`ReleaseNotesDialog.tsx` 及公告/翻译测试。
- 修改 `package.json`、`package-lock.json`、`android/native-version.properties`，产品版本为 `1.0.33`，Android 为 `1000033`；server package 继续使用独立版本规则。
- 更新 `docs/ARCHITECTURE.md`、`GAMEPLAY_SYSTEMS.md`、`PROJECT_STATUS.md`、`TESTING_RELEASE.md` 和本开发交接。
- 更新 `tests/e2e/v130-offline-timewarp-real-save.spec.ts`、`v132-pure-idle-macro.spec.ts`，并将既有 E2E 版本断言从 1.0.32 刷新到 1.0.33。

## 7. 不可变制品

制品根目录：`D:\GameDev\DSPidle2-release-1.0.33\release\bundle-1.0.33-2bd81de8d7f1`。

| bundle 相对路径 | 字节 | SHA-256 |
| --- | ---: | --- |
| `android/dsp-idle-1.0.33-1000033.apk` | 4,834,527 | `14232dd3273ad951acf36d0a97488912e978ae0cd6da3f5cf1104f82419bedeb` |
| `android/stable.json` | 636 | `9c1b5c3f010e7f88cd58089d6409f0fbdbcfc4f4401a84481a0f501a29945897` |
| `api-1.0.33-2bd81de8d7f1-clean.tar.gz` | 80,917 | `e2898587ed0387f448eadaa621ca018a227f175c52042a2dff779b917c96fbc8` |
| `download-site-1.0.33-2bd81de8d7f1.tar.gz` | 116,004,444 | `066bf8ac15e690155f9c9296ac062f29802217e3face67045e87da1be65daba2` |
| `version.json` | 94 | `25636045df43fe426785ca3f22a93bd9d2c05bdfde096eaedd0cc4f3e1fda15e` |
| `web-1.0.33-2bd81de8d7f1-clean.tar.gz` | 1,314,779 | `3e9e514088e18fc292e20e8eb093426d2116107d7aa625ccaf0e5f1eaf906b98` |
| `windows/dsp-idle-1.0.33-x64-setup.exe` | 112,324,182 | `1fa4e4c32a53fbac1ed1c91112b27455e2b8745d954e969671b98165d24c761f` |
| `windows/dsp-idle-1.0.33-x64-setup.exe.blockmap` | 118,330 | `c8a1c66e95b4394b9c01eae8999847510fcae5bf8bd648e88afd424d9240ea7a` |
| `windows/latest.yml` | 356 | `fae4dc4719465e0af8d29bd793fe7b160070462a5ec5089ddac936f7c9bf9e01` |
| `windows/release.json` | 618 | `ecd933caebad3e9c1fd9d8850342258af7703d26200f93798759bfda95bf5019` |

独立工作路径：

- Web：`D:\GameDev\DSPidle2-release-1.0.33\release\web-1.0.33-2bd81de8d7f1-clean.tar.gz`
- API：`D:\GameDev\DSPidle2-release-1.0.33\release\api-1.0.33-2bd81de8d7f1-clean.tar.gz`
- Android/Windows 更新源：`D:\GameDev\DSPidle2-release-1.0.33\release\update-feed-1.0.33-2bd81de8d7f1`
- 下载站目录：`D:\GameDev\DSPidle2-release-1.0.33\release\download-site-1.0.33-2bd81de8d7f1`
- 下载站归档：`D:\GameDev\DSPidle2-release-1.0.33\release\download-site-1.0.33-2bd81de8d7f1.tar.gz`

Web、API、下载站归档解包后分别与源目录逐文件比较，`126/126`、`23/23`、`9/9` 完全一致。API 归档使用明确白名单，不含 `node_modules`、SQLite、data、备份、环境文件或秘密材料；APK 和 bundle 同样未包含签名库或密码配置。

## 8. Manifest 与原生签名

| 清单 | 文件数 | 聚合 SHA-256 |
| --- | ---: | --- |
| `D:\GameDev\DSPidle2-release-1.0.33\artifacts\release-manifests\1.0.33-2bd81de8d7f1.json` | 149 | `0f80274b72d24aed0f3060253db7e990c0efe2468aaba1916a14a6f303d268ef` |
| `D:\GameDev\DSPidle2-release-1.0.33\artifacts\release-manifests\1.0.33-2bd81de8d7f1-download.json` | 9 | `c835a413b0c30597c77abb29ff2ae39f6685a234c38416c65b908f5943167205` |
| `D:\GameDev\DSPidle2-release-1.0.33\artifacts\release-manifests\1.0.33-2bd81de8d7f1-bundle.json` | 10 | `3a2f2161dc9918e040b7350a57f69110d296317a7e09ae19474e4abdeb2294ae` |

三份清单均已执行 `node deploy/create-release-manifest.mjs --verify`。Android 包名为 `cn.dsponline.network`，版本 `1.0.33 / 1000033`，APK Signature Scheme v2/v3 均为 true，证书 SHA-256 与 1.0.32 的批准长期证书连续。没有创建、替换或输出 keystore。Windows FileVersion 为 `1.0.33`、ProductVersion 为 `1.0.33.0`，安装包和解包主程序 Authenticode 均为 `NotSigned`，符合现行公开测试包策略。

稳定更新清单的 APK/EXE/blockmap 大小与 SHA-256 均已复算，Electron `latest.yml` 的 SHA-512 与安装包一致；下载页包含 1.0.33 两个下载入口、`icon.svg` 和 Windows 未签名提示。

## 9. 未验证项目与剩余风险

- 没有物理 Android 设备；模拟器覆盖安装和启动已通过，但 Android Chrome/WebView 上的 30 天真实存档、后台挂起、温度、耗电和低内存行为仍未验证。
- Electron 只完成正式包元数据和隔离启动，没有在 Electron 生命周期中重新运行 30 天真实存档；Chrome 与 Edge 已覆盖相同 Worker 算法。
- 没有单独采集整段 CPU 百分比和 Worker 消息总数；已采集墙钟耗时、浏览器堆、Node RSS、阶段、取消、重启和迟到消息结果。
- 30 天误差是关键尾验估计值，不是完整精确 30 天基线。当前接受近似策略下可发布，但不能宣称所有资源或瞬时物流都接近精确结果。
- 保守宏观会冻结无法证明守恒的产线并少发收益；这是存档安全策略，不是零误差结算。
- 根项目 audit 仍有 1 个 moderate、4 个 high 的既有依赖告警；本批没有升级依赖以避免扩大 P0 热修范围。
- 没有使用真实生产账号测试云上传、排行榜或生产数据库；这些不属于 development 角色权限。

## 10. Release Agent 边界与回滚

发布前 Release Agent 只使用 `2bd81de8...` 对应的已验证 bundle，不得从后续文档提交重建或在服务器上修补游戏代码；以上门禁已在本次发布中独立复验。

发布前回滚基线为 `1.0.32+762bf693becb`；发布后该版本已成为两地 Web/API 的当前回滚目标。回滚只切换 Web/API/下载目录，不恢复旧数据库、不删除玩家存档、不清理纯挂机恢复记录。

开发门禁与制品当时齐全，随后已按用户授权完成 1.0.33 发布；当前结果以本文顶部和 [1.0.33 发布记录](./releases/1.0.33.md) 为准。

## 11. 给 Release Agent 的历史交接提示词（已执行）

```text
Role: release

任务：发布 DSPidle2 1.0.33。先阅读 .codex/skills/develop-dspidle/SKILL.md、
docs/PROJECT_STATUS.md、docs/DEPLOYMENT_OPERATIONS.md、docs/TESTING_RELEASE.md 和
docs/RELEASE_HANDOFF_1.0.33.md。

生产基线是 1.0.32+762bf693becb。1.0.33 的唯一制品源码提交是
2bd81de8d7f16040620378d37cb73649cf09dd17，Build ID 是
1.0.33+2bd81de8d7f1。只能使用：
D:\GameDev\DSPidle2-release-1.0.33\release\bundle-1.0.33-2bd81de8d7f1

先验证以下清单，任何不匹配都停止：
- artifacts/release-manifests/1.0.33-2bd81de8d7f1.json
- artifacts/release-manifests/1.0.33-2bd81de8d7f1-download.json
- artifacts/release-manifests/1.0.33-2bd81de8d7f1-bundle.json

不要从后续文档提交重建二进制，不要在服务器编辑 gameplay/source 文件，不要创建新
Android 证书。Android 必须复验 v2/v3 和 1.0.32 证书连续性；Windows 必须保持并明确
标注 NotSigned。

获得用户对目标节点的发布授权后，按 1.0.32 已验证流程：分别备份并验证香港/上海
SQLite，上传到新的未激活目录，复验 149 文件 source manifest、生产依赖和隔离健康，
先香港后上海原子切换；下载站使用新的 9 文件目录。不得代理或合并两地数据库。

发布后验证 version.json、Service Worker、当前与 1.0.32 hashed assets、schema v7/layout v2、
CORS/未登录 401、Android/Windows 稳定清单、完整下载 SHA-256、Range 206、缓存头、桌面与
手机页面，并记录服务状态、NRestarts、磁盘、当前/回滚目录。失败时只回滚代码/下载指针
到 1.0.32，不恢复旧数据库。不要输出 PEM、密码、token、keystore 或玩家存档正文。
```
