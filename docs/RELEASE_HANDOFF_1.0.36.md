# DSPidle2 1.0.36 发布 Agent 交接

> Role：develop → release complete
> 交接日期：2026-08-10
> 当前生产：`1.0.36+e0ad49062fa3`
> 候选源码：`e0ad49062fa329040b379375b595ba74b7d23daf`
> 候选 Build ID：`1.0.36+e0ad49062fa3`
> 候选分支：`codex/1.0.36-belt-endgame-performance`
> 正式发布完成：2026-08-10；直接回滚为 `1.0.35-080844f55852`

## 1. 交接结论

1.0.36 的代码、测试、clean Web/API 归档、Windows unpacked 和 Android APK/AAB 未签名诊断制品已经完成。开发角色没有连接香港/上海 VPS，没有修改生产数据库、排行榜历史、云存档、下载页、Nginx、systemd 或发布指针，也没有读取签名私钥。

功能、确定性、守恒、旧档兼容和自动化门禁通过，但候选不是无条件稳定发布：20,164,029 字节档的 60 秒精确模拟仍为 12.19 秒，未达到需求中的 7～9 秒；10,410 线路极端星球浏览器堆仍约 407MB；没有 Android 真机或低配 Windows 物理验收。建议 Release Agent 先做受控灰度并取得明确 go/no-go，不得把局部性能提升描述成所有目标达成。

## 2. 版本与协议边界

| 字段 | 当前生产 | 1.0.36 候选 |
| --- | --- | --- |
| 应用版本 | 1.0.35 | 1.0.36 |
| Android | 1.0.35 / 1000035 | 1.0.36 / 1000036 |
| GameState | v46 | v46 |
| save envelope | v2 | v2 |
| cloud schema | v7 | v7 |
| SQLite layout | v2 | v2 |
| 排行榜协议 | 1.0.35 规则 | 不变 |

本批没有迁移脚本、数据库 DDL 或服务端协议改动。新线路默认并联数是设备级 localStorage 偏好；模拟和 Canvas 索引均为可重建运行时缓存。普通/速通本地槽、云槽、导入导出、自动保存、删除、恢复和排行榜资格继续沿用 1.0.35 隔离体系。

## 3. clean source manifest

清单：[1.0.36-e0ad49062fa3.json](../artifacts/release-manifests/1.0.36-e0ad49062fa3.json)

| 字段 | 值 |
| --- | --- |
| source commit | `e0ad49062fa329040b379375b595ba74b7d23daf` |
| clean | `true` |
| 文件数 | 160 |
| aggregate SHA-256 | `c6aa0e326fc6ce34c4fb742003aea0858e3a41de977669c2f6337c6f6d33de6d` |
| manifest SHA-256 | `d2ba39e137a55bca2c28fb138d5f7d4e95ce0cc8b3f54c5256c2e50b64a19a27` |
| source verify | 160/160 |
| Web/API 解包复验 | 160/160 |

Build ID 在 clean Web、Electron 包内 `dist/version.json` 和 Android Web 资源中均为 `1.0.36+e0ad49062fa3`。

## 4. 候选制品

目录：[artifacts/release-packages/1.0.36-e0ad49062fa3](../artifacts/release-packages/1.0.36-e0ad49062fa3)

| 文件 | 字节 | SHA-256 | 用途 |
| --- | ---: | --- | --- |
| `1.0.36-e0ad49062fa3-web.tar.gz` | 1,359,218 | `55d5d1a014b737a2157c384956d8a9410fa128e483e42c45c6daf2fd47095a6d` | Web 候选，可进入未激活目录验证 |
| `1.0.36-e0ad49062fa3-api.tar.gz` | 106,423 | `b6a0da7b432a57e60372408bed654e80ccdb96be39336ea56b8226c12fc64a4e` | API 候选；内容与 1.0.35 协议兼容 |
| `1.0.36-e0ad49062fa3-windows-unpacked-diagnostic-unsigned.tar.gz` | 150,103,411 | `68f3eb706bab597d0bb60c39fe87f315fb4b2cc225cd9f287d9856b0c82dc9a3` | 仅诊断；NotSigned；禁止 stable |
| `1.0.36-e0ad49062fa3-android-unsigned.apk` | 4,815,155 | `eb2e25cbf297001014e6095b6a9e128e7fa3ed745c58de9ec547a8e7a6773e2e` | 仅诊断；未签名；禁止 stable |
| `1.0.36-e0ad49062fa3-android-unsigned.aab` | 4,630,444 | `7336c17342c029099411a1af8e92f3641a4e865fa429b8fc2ca6831c5b0f2418` | 仅诊断；未签名；禁止 stable |

聚合记录：[candidate-artifacts.json](../artifacts/release-packages/1.0.36-e0ad49062fa3/candidate-artifacts.json)，SHA-256 为 `d14e98cd23833f69ae4583aa43482d0dafdfe294ce6c69efe8dbcacde2d73526`，5/5 文件大小与哈希复验通过。

Windows clean unpacked 使用独立 profile 启动 10 秒，主进程和 3 个子进程保持正常，随后只终止本次测试进程；包内版本为 1.0.36。Android `aapt` 确认 `cn.dsponline.network / 1.0.36 / 1000036 / minSdk 24 / targetSdk 36`，Gradle 413 tasks 与 lintVital 通过。APK `apksigner` 和 AAB `jarsigner` 均确认没有发布签名。

## 5. 最终门禁

| 门禁 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| Vitest | 101 文件通过、6 跳过；918 项通过、17 跳过、0 失败 |
| Playwright | 259 通过、11 条显式条件跳过、0 失败（270 总数，772.2 秒） |
| Server | 70 通过、2 条显式夹具跳过、0 失败 |
| Ops | 6/6 |
| Native tools | 8/8 |
| Licenses | 128 个运行时包一致 |
| Production dependency audit | 根项目、server 均 0 漏洞 |
| clean Web build | 通过，1,888 模块 |
| clean Electron pack/smoke | 通过，NotSigned |
| clean Android release unsigned | 通过，APK/AAB 未签名 |
| source/archive verification | 160/160、160/160 |
| `git diff --check` | 通过 |

本地代理 `127.0.0.1:65534` 的连接拒绝是 Playwright 隔离配置，不是生产 API 故障。完整功能、性能、内存和哈希证据见 [1.0.36 开发报告](./DEVELOPMENT_REPORT_1.0.36.md)。

## 6. 真实存档摘要

| 只读夹具 | 60 秒精确 | 单秒 P95 | 传送带相对基线 | 哈希/守恒 |
| --- | ---: | ---: | ---: | --- |
| 9,089,328 B / 4,779 实体 / 11,779 线路 | 8.75s | 228ms | -76.3% | `bc66537b`；玩法哈希分片一致；非法 0 |
| 20,164,029 B / 11,604 实体 / 27,669 线路 | 12.19s | 247ms | -57.5% | `c3c250aa`；玩法哈希分片一致；非法 0 |

两个原始文件 SHA-256 与开发前完全一致，没有被保存、覆盖、提交或上传。

## 7. Release Agent 必须补齐的门槛

1. 先复验 source manifest、5 个制品和 candidate JSON；Web/API 只进入未激活版本目录，不直接覆盖 `current`。
2. 明确接受或拒绝“20MiB 档整段 12.19 秒、极端画布约 407MB”的剩余风险。建议小流量灰度，采集匿名分桶的 Worker 延迟、长任务、堆和 fallback，不上传存档正文。
3. 在至少一台约 900～1,000 实体/2,000～2,500 线路可复现设备和一台更低配设备上验证暂停/运行拖动、缩放、Fit View、线路/建筑点击、蓝图、拉线、寻线与自动回退。
4. Android 必须从同一 clean source 使用既有长期证书重建；验证 APK v2/v3、证书 SHA-256 连续性、zipalign、`1.0.35 → 1.0.36` 覆盖升级、本地普通/速通存档均保留。禁止创建或替换证书。
5. Windows 根据现有发行政策重建 setup、记录 Authenticode/SmartScreen 状态并做覆盖升级；不得把本文 unpacked 诊断包直接加入更新源。
6. 香港、上海分别创建和验证生产备份。即使 API 代码无 schema 变化，也应在未激活目录使用备份副本检查 schema v7/layout v2、普通/速通同槽隔离、账号/云槽/排行榜数量和旧 1.0.35 Web 兼容。
7. 取得用户明确发布授权后才切 Web/API/下载指针。发布后核对 `version.json`、service worker、旧 hashed asset、API health、CORS、gzip/raw、四槽 revision、普通/速通隔离、下载 Range/cache 和制品哈希。
8. 不把普通存档或近似结算用于速通排行榜。任何历史成绩恢复都继续走既有人工 dry-run/备份/精确账号/停服 guard/显式确认流程，不是 1.0.36 发布步骤。

## 8. 灰度与监控建议

- 首先仅灰度 Web，不发布未签名原生诊断包。
- 观察 20MiB 以上存档的 1 秒 Worker P95、主线程 long task、浏览器堆、自动保存耗时、纯挂机退出保存和 Canvas fallback。
- 核对传送带休眠/唤醒后生产、矿脉、缓存、物流、量子和在途物资没有异常变化。
- 若出现玩法哈希/库存差异、负数、Worker OOM、Canvas 无法点击或保存失败，立即停止灰度；不能通过清缓存、跳产量或补物资掩盖。
- 多 Worker 和存档紧凑化在 1.0.36 继续关闭，不在发布时临时开启。

## 9. 回滚

- 代码、Web/API 和下载指针回到已发布的不可变 1.0.35；数据库不回滚。
- 本批没有 schema/存档迁移，不能以恢复旧数据库作为代码回滚步骤。
- 不删除玩家缓存、不重写玩家存档、不重算排行榜。
- 设备级并联偏好在 1.0.35 中不会被读取，可原样保留。
- 回滚后验证 1.0.35 Build ID、API health、普通/速通云槽、自动保存、下载清单和旧资源。

## 10. 可直接交给 Release Agent 的提示词

```text
Role: release

任务：验收 DSPidle2 1.0.36 候选；只有取得用户明确授权且门槛满足后才发布。

先完整阅读：
- .codex/skills/develop-dspidle/SKILL.md
- docs/PROJECT_STATUS.md
- docs/TESTING_RELEASE.md
- docs/NATIVE_APPLICATIONS.md
- docs/DEVELOPMENT_REPORT_1.0.36.md
- docs/RELEASE_HANDOFF_1.0.36.md
- docs/DEPLOYMENT_OPERATIONS.md

当前生产仍是 1.0.35+080844f55852。
候选 clean source：e0ad49062fa329040b379375b595ba74b7d23daf
Build ID：1.0.36+e0ad49062fa3

先验证：
D:\GameDev\DSPidle2\artifacts\release-manifests\1.0.36-e0ad49062fa3.json
160 files；aggregate SHA-256：
c6aa0e326fc6ce34c4fb742003aea0858e3a41de977669c2f6337c6f6d33de6d

候选制品：
D:\GameDev\DSPidle2\artifacts\release-packages\1.0.36-e0ad49062fa3
按交接表复验 5 个文件和 candidate-artifacts.json。

Windows unpacked 与 Android APK/AAB 都是未签名诊断制品，禁止进入 stable feed。
Android 只能使用既有长期证书从同一 clean source 重建；不得创建新证书。

开发门禁全绿，但性能只有部分达到目标：20,164,029 B 档 60 秒精确仍为
12.19 秒，极端 10,410 线路星球浏览器堆仍约 407MB。必须先取得风险接受，
建议小流量灰度并完成 Android/低配 Windows 物理验收；不得写成“所有目标达成”。

GameState v46、envelope v2、cloud schema v7、SQLite layout v2 不变。
香港和上海分别备份、分别在未激活目录验收，不合并数据库、不热改源码。
发布后验证版本、API、四槽、普通/速通隔离、保存、PWA、下载哈希与回滚指针。

不要修改排行榜历史；速通人工恢复不是发布步骤。回滚只切回 1.0.35 代码和
下载指针，不恢复数据库、不删除玩家缓存、不重写存档。
```

## 11. Release Agent 收口

用户明确豁免 `1.0.36-e0ad49062fa3` 的 Android 真机、低配 Windows 与覆盖升级门禁，接受本交接记录的 12.19 秒和约 407MB 残余风险，并授权香港、上海和下载页发布。该豁免没有被记录为测试通过，也不适用于后续版本。

Release Agent 使用既有长期 Android 证书从同一 clean source 重建正式 APK/AAB，生成 Windows `NotSigned` setup、stable feeds 和下载页；两地分别完成 Backup API、未激活目录、70/2 服务测试、备份副本隔离启动、原子切换和稳定观察。香港/上海 Web/API 与上海下载页均为 `1.0.36-e0ad49062fa3`，直接回滚均为完整 1.0.35。

香港上一稳定版 Web 已更新为不可变 `/canary/1.0.35-080844f55852/`，`/canary/previous/` 302 指向它；当前 1.0.36 worker、Cache Storage 和离线根页在访问回退入口前后保持。完整制品哈希、备份、在线证据、独立 Nginx 回滚指针和残余风险见 [1.0.36 正式发布记录](./releases/1.0.36.md)。
