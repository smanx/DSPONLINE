# DSPidle2 1.0.33 开发交接

> Role: develop
>
> 状态：开发候选；不授权连接 VPS、切换生产版本或更新公网下载页。
>
> 生产基线：`1.0.32+762bf693becb`；目标：`1.0.33 / GameState v46 / envelope v2 / cloud schema v7 / SQLite layout v2`。

## 1. 交接结论

`P0-ENDGAME-FAST-SETTLEMENT-NONBLOCKING` 已实现 `fast-30s-v2` 与 `pure-idle-macro-v3`。有限和无限科研不再阻断快速离线或时间扭曲纯挂机；启动、刷新恢复和旧恢复记录迁移都会重新计算权威供电倍率。普通合同、尾验、校准或 Worker 失败只能转入有界保守宏观，不再创建覆盖完整离线/挂机时长的精确重放。

最终 clean source commit、Build ID、不可变制品、签名结果和完整门禁将在从最终提交重建后回填本文。当前代码仍只存在于隔离工作树 `D:\GameDev\DSPidle2-release-1.0.33`，没有修改主工作区、生产节点、生产数据库或公网下载页。

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

## 4. 当前验证摘要

以下是版本化前开发迭代结果，最终 clean commit 门禁完成后必须以第 7 节为准：

- 全量 Vitest：91 文件通过、5 文件跳过；825 项通过、16 项跳过。
- server / ops / native：49/49、6/6、8/8。
- 聚焦科研、离线、纯挂机与公告：6 文件、87/87。
- 专项 Playwright：离线/纯挂机 13 项通过、3 项可选真实夹具跳过；离线报告回归 6/6。
- 全量 Playwright 首轮：262 项中只有一个既有科研端口场景因全页截图超过默认 30 秒而超时；核心断言已完成，独立重复 3/3 约 4 秒通过，场景已标记慢速并等待最终全量复跑。

## 5. 真实存档只读结果

源文件在测试前后 SHA-256 保持不变，未上传生产账号：

| 夹具 | 摘要 |
| --- | --- |
| 小档 | SHA-256 `F62454361555FCA88C96F398AA34A4BFAA482E1A90E3651ADF308ADE85334F58`；305,254 字节；225 实体；191 线路 |
| 大档 | SHA-256 `0A251ADEFA5E467C6F4FDBBA2964623D295E499A9CB48EED814A10B37B18F4E7`；3,905,264 字节；1,910 实体；4,479 线路；`matrix_compression` 263 级 |

| 场景 | 小档 | 大档 |
| --- | ---: | ---: |
| 快速离线 6,984 秒 | 0.71s | 3.50s |
| 快速离线 30,171 秒 | 0.49s | 3.08s |
| 快速离线 7 天 | 0.41s | 4.36s |
| 快速离线 30 天 | 0.42s | 5.08s |
| 30 天纯挂机 | 0.59s，请求 9x / 实际 8x | 2.85s，请求 14x / 实际 13x |

全部浏览器离线场景使用 `fast-30s-v2`，经过校准、宏观、验证并可序列化重载。大档观测主线程堆最高约 106 MB；Node 基准观测 RSS 最高约 1.08 GB。大档 30 天纯挂机中无限科研 `263 → 379`，白矩阵增加 `25,151,673,830,400`，结构点和火箭各增加 `2,258,786,649,600`，戴森发电增加约 `207,341,601,405,569,540 kW`。小档因物资守恒门禁冻结不确定产线并安全少发；两档均通过线路、实体和正式重载检查。

大档关键尾验估计误差按 6,984 秒、30,171 秒、7 天、30 天约为 `3.71% / 9.13% / 66.83% / 89.62%`。这是允许近似的诊断结果，不代表存档结构误差；负数、NaN/Infinity、非法整数、重复科研奖励和重复时间提交仍属于硬失败。

## 6. 修改范围

核心新增：

- `src/game/offlineSettlementStrategy.ts` 及测试
- `src/game/researchMacro.ts` 及测试

核心修改：

- `src/game/offlineApproximation.ts`
- `src/game/offlineSimulation.ts`
- `src/game/offlineSimulation.worker.ts`
- `src/game/pureIdleMacro.ts`
- `src/game/pureIdleMacro.worker.ts`
- `src/game/pureIdleMacroClient.ts`
- `src/game/pureIdleRecovery.ts`
- `src/game/infiniteResearch.ts`
- `src/game/engine.ts`
- `src/App.tsx`
- `src/components/StartMenu.tsx`
- `src/components/OfflineReportWorkspace.tsx`
- `src/components/TimeWarpIdleOverlay.tsx`
- 对应 Vitest、Playwright、版本公告、版本元数据和规范文档

## 7. 最终 clean commit、门禁与制品

> 待最终 clean source commit 和不可变制品生成后回填。任何 `unknown` 项都阻止 Release Agent 发布。

| 项目 | 结果 |
| --- | --- |
| Clean source commit | `unknown` |
| Build ID | `unknown` |
| `npm ci` / `npm --prefix server ci` | `unknown` |
| licenses / typecheck / Vitest | `unknown` |
| server / ops / native | `unknown` |
| build / full Playwright / diff-check | `unknown` |
| Web / API / APK / EXE / blockmap | `unknown` |
| Android v2/v3 与证书连续性 | `unknown` |
| Windows Authenticode | 预期沿用历史 `NotSigned`，待复验 |
| Release manifest / aggregate SHA-256 | `unknown` |

## 8. 未验证平台与风险

- 当前真实存档浏览器基准使用 Chrome；Edge、Android Chrome/WebView、Electron 长时真实夹具尚未完成。
- 30 天关键终局指标允许较大近似偏差；保守宏观可能为保护守恒而冻结不确定产线并少发收益。
- Node RSS 是进程级观测，不能等同于浏览器或手机实际内存；移动端大存档仍需真机验证。
- 真实生产账号云上传、生产数据库和排行榜没有测试，也不应由开发角色执行。
- Windows 沿用历史未签名策略；Android 必须复用 1.0.32 的长期证书，缺少签名环境时必须阻塞而不能生成新证书。

## 9. Release Agent 边界

Release Agent 只能在第 7 节所有必要项均有精确值、manifest 可复验、Android 签名连续且最终工作树无未预期改动后开始。发布前仍需独立检查生产备份、未激活目录、健康窗口、回滚指针、磁盘空间和公网缓存。开发交接不包含 PEM、密码、token、keystore 或任何玩家存档正文。
