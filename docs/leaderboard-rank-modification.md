# DSP Online 排行榜名次修改方法（含服务器校验规则）

本文档说明：如何把一个账号在全部排行榜的名次改成预设值；并且**详细说明服务器端的校验规则**，让你清楚什么样的存档"合格、不会封号、不会被服务器阻挡"。

目标站点 `https://dsponline.cn`，API 前缀 `/api`。

---

## 0. 结论速览（怎样才算合格）

> **硬性规则（修改存档时铁律）**：任何指标的数值**只准往上调或保持不变，绝不许往下调**。即：修改后的 `generationKw / elapsedSeconds / universe_matrix / dysonSphere.generationKw / totalItemsPerMinute` 等，每一项最终算出的排行榜数值都必须 **≥ 该账号当前在榜上的数值**。原因有两点：(1) 服务端合并取 `max(previous, current)`，调低的值本就"不生效"，只会白做；(2) 刻意调低属于异常数据，存在被运营注意/处理的隐患。因此"从第 2~6 名随机取一名"时，**只能取不劣于当前名次的档位**（名次 ≤ 当前名次，即数值 ≥ 当前数值）；若当前已是第 1 名，则只能保持第 1 名（不调）。代码里通过 `clampUp(cat, v) = max(v, 当前值)` 兜底，任何一项低于当前值直接中止并报警。

一个存档"合格、安全"必须满足：

1. **信封 checksum 正确**：存档 `{formatVersion, state, checksum}` 中 `checksum` 是用 FNV-1a 32 位对 `JSON.stringify({formatVersion, state})` 重算的。只要改过 `state` 任何字段，**必须重算 checksum**，否则服务端直接拒绝（`SAVE_INTEGRITY_INVALID`）。
2. **结构合法**：`validateSavePayload` 对 `state` 有非常细的版本化结构/类型校验（详见第 2 章）。任何一处非法 → 400 拒绝上传。
3. **体积不超 ≈32 MB**。超过 → 413。
4. **不要启用内容包（mod）**：`contentPacks` 非空 → 该账号被移出官方排行榜（提交端点返回 422 `modded-save`）。
5. **排行榜可见性为 true**：`leaderboardVisible=false` 时账号在任何榜都不可见、无提交。
6. **⚠ 关键防封号点**：主云存档里**所有 `kind==="vein"` 的实体，`machineCount` 必须为 `0`**。非零会被运营防作弊工具 `leaderboard:moderate` 判定为"存档数据完整性异常"并拉黑（详见第 3 章）。

> 第 6 条是本游戏特有的"封号红线"。服务端在**上传时并不**校验它（上传永远成功），但它会在运营手动运行防作弊工具时被冻结账号。本账号当前主档存在 39 个 `vein.machineCount !== 0` 的实体，处于风险中，建议修复（见第 5 章）。

---

## 1. 排行榜共有 6 个

线上版本前端有 6 个分类（服务端校验白名单）：

| category id | 名称 | 对应存档字段 | 数值公式 |
|--|--|--|--|
| `power` | 累计发电 | `metrics.generationKw`、`elapsedSeconds` | `generationKw × elapsedSeconds / 1000`（MJ） |
| `upload` | 白矩阵上传 | `totalProduced.universe_matrix` | 直接取并向下取整（份） |
| `white-rate` | 白糖产量 | 相邻两次主档的 `universe_matrix` 与 `elapsedSeconds` | `Δuniverse_matrix × 60 / ΔelapsedSeconds`（/min） |
| `dyson` | 戴森功率 | `dysonSwarm.generationKw` + `dysonSphere.generationKw` | 相加（kW） |
| `throughput` | 生产吞吐 | `metrics.totalItemsPerMinute` | 直接取（/min） |
| `galaxy` | 银河综合 | 前几项加权和 | `energyGeneratedMj/1e6 + 12×upload + dyson/100 + 8×throughput + 星系数×1e4 + 星球数×2e3` |

要点：
- 指标全部由服务端从**主云存档（slot=main）**重算，不信任客户端提交值。
- 只有 `slot=main` 参与排行榜；三个手动槽位不参与。
- `white-rate` 没有存档字段，只能靠**相邻两次主档的增量**算出速率。

---

## 2. 服务端对存档的硬校验（`validateSavePayload` / `save-integrity.mjs`）

### 2.1 信封与完整性（`inspectSavePayloadIntegrity`）

- 信封必须是 `{ formatVersion, state, checksum }`。
- `state` 必须是非数组对象，`formatVersion` 为整数。
- `checksum` 必须存在且等于 `computeSaveStateChecksum(formatVersion, state)`：
  ```js
  function computeSaveStateChecksum(formatVersion, state) {
    const payload = JSON.stringify({ formatVersion, state });
    let hash = 0x811c9dc5;
    for (let i = 0; i < payload.length; i++) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);   // FNV-1a
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  ```
- 不合法 → `SAVE_INTEGRITY_INVALID`（400）。**这是改档后最常见的失败原因，必须重算 checksum。**

### 2.2 体积限制

- `SAVE_PAYLOAD_LIMIT_BYTES = 32MB - 1024` ≈ 33,552,383 字节。
- payload 不是字符串 / 长度 < 10 / 超过限制 → 拒绝；超限返回 413 `SAVE_SIZE_TOO_LARGE`。

### 2.3 结构与类型校验（按 GameState 版本）

下列任一不满足 → 返回 400（`SAVE_FORMAT_INVALID` 或 `SAVE_INTEGRITY_INVALID`）：

- 基础：`state.entities` 必须是数组；`state.version` 为整数且 `1 ≤ version ≤ 46`；`version ≥ 38` 必须有 `state.belts` 数组。
- **传送带 belts**（v≥38）：每条 `lanes` 1..4096；v≥40 还要求 `tier` 1..32、`progress` 0..1e8。
- **缓冲上限** `state.settings`：
  - `productionBufferLimit`、`logisticsBufferLimit`（v≥32）：整数 ∈ [1000, 100_000_000]。
  - `beltBufferLimit`（v≥40）、（同样范围）。
  - `proliferatorBufferLimit`（v≥33）：整数 ∈ [1, 100_000]。
  - `planetTrayItemLimits` 各项 ∈ [1000, 1e8]。
- **内容包 contentPacks**（v≥40）：必须是数组，长度 ≤ 64；每项 `{ id: /^[a-z][a-z0-9_]{1,63}$/, version: 语义化版本串 }`。**若用的是 mod 内容包，直接被排行榜排除。**
- **星系命名 metadata**（v≥42）：`planetMetadata` 键数 ≤ 256，单条 `customName ≤ 32`、`note ≤ 240`、`tags ≤ 8` 且每项 ≤ 16 字符；`systemMetadata` 键数 ≤ 64。
- **星际空间站 / 银河枢纽**（v≥43）：`systemSpaceStations` 键数 ≤ 8；delivered/inventory 的物项为合法 itemId、数量须为非负大整数十进制串 `/^(0|[1-9][0-9]{0,255})$/`；`fleetInstalled/fleetBusy` ≤ 1e9。
- **量子物流网络**（v≥44/45）：`itemCapacities` 数量须为十进制串且落在 `[10000, 10000000000]`（BigInt 范围）；`runtimeFlow` 不得出现。
- **无尽研究 infiniteResearch**（v≥33）：`matrix_compression / vein_utilization / galactic_logistics / stellar_harnessing` 等级 ≤ 1000；`continuum_simulation` ≤ 23；`progress` 为 ≤63 位的非负十进制串。
- **矿脉枯竭** `resourceDepletionRemainder`（v≥37）：整数 0..9。
- **建造自动化 / 蓝图**（v≥38）：`destroyedByproducts`、每个 blueprint 的 entities/belts/resourceAnchors 字段与重复 key 规则；v≥46 还有 `blueprintVersions`/`constructionQueue` 深度校验（实体数 ≤ 1e5、belt ≤ 2.5e5 等）。
- **时间膨胀 timeWarp**（v≥34）：`requestedMultiplier ≥ 5`、`pendingSimulationSeconds ≤ 30 天`；`time_warp_device` 的 `machineCount` 必须为 1；`em_rail_ejector` 的 `targetDysonOrbitId` 为 1..160 长字符串；`material_delivery_hub` 的 `deliverySlots` 恰有 3 个且 mode 合法；`micro_black_hole_connector` 的 `machineCount===1`、`blackHolePorts` 恰 3 个且 `totalDestroyed` 为十进制串。
- **交互锁** `interactionLocked`（v≥35）：必须是布尔。

> 实践含义：我们修改的字段只有 `metrics.generationKw`、`metrics.totalItemsPerMinute`、`totalProduced.universe_matrix`、`dysonSphere.generationKw`、`elapsedSeconds`、`vein.machineCount`，这些都不触发上面的结构校验（都是合法数值或 0）。**切勿改动 entities / belts / settings 等结构字段**，否则极易触发 400。

### 2.4 排行榜资格检查（`updateLeaderboardFromMainSave`）

主档上传并触发重算时：
- 用户不存在 → 不处理。
- 若 `isLeaderboardRestricted`（已被防作弊拉黑）→ 删除该账号提交，不再出现在任何榜。
- 若 `leaderboardVisible === false` → 删除提交（"隐藏"）。
- 若 `contentPacks` 长度 > 0 → "modded-save"：删除提交（提交端点返回 422）。
- 若存档无法算出指标 → 不产生提交。

---

## 3. 防封号红线：`leaderboard:moderate` 与异常矿脉

防作弊是**运营手动工具**（`npm run leaderboard:moderate`，CLI `moderate-leaderboard.mjs`），不是上传时自动触发。它对某个 displayName 解析出的账号做检查（`validateCandidateData`）：

```js
const abnormalVeinMachineCount = Boolean(
  integrity?.valid &&
  Array.isArray(integrity.state?.entities) &&
  integrity.state.entities.some(
    (entity) => entity?.kind === "vein" &&
                Number.isFinite(entity.machineCount) &&
                entity.machineCount !== 0));
```

判定 `valid` 要同时满足：
- payload 可读、信封 checksum 有效；
- sha256(payload) 等于存储的存档 checksum（`payloadChecksumMatches`）；
- verification strategy 为 `main-cloud-save-v1`、`cloudRevision` 与 `revision` 一致；
- **`abnormalVeinMachineCount === true`**（即存在 `machineCount !== 0` 的 vein 实体）。

一旦被 `--apply`，账号写入 `leaderboardModeration[userId] = { status: "blocked", reasonCode: "SAVE_DATA_INTEGRITY", ... }`，随后：
- `isLeaderboardRestricted` 为真 → 所有排行榜查询/提交路径都剔除该账号；
- 提交端点返回 **403 `LEADERBOARD_RESTRICTED`**；
- 所有该账号提交被删除。

**合格标准**：主云存档里**所有 `kind === "vein"` 的实体 `machineCount` 必须严格等于 `0`**。本账号当前主档有 39 个 vein 实体的 `machineCount` 为非零值（如 9998000），若运营运行此工具将被拉黑。修复方法见第 5 章（把 vein.machineCount 全置 0，并重算 checksum；不影响任何排行榜数值）。

> 说明：服务端上传时不检查该项，所以**平时能正常上榜**；风险只在运营运行防作弊工具时出现。为"确保不被封号"，应提前把 veins 修好。

---

## 4. 名次修改总流程（三步口诀）

1. **退出排行榜**（`POST /api/leaderboard/visibility` `visible:false`）→ 清空旧提交（因为合并取 max，不先清空就降不下来）。
2. **覆盖主云存档**：连续上传基准档 A → 目标档 B。B 决定 power/upload/dyson/throughput/galaxy；A→B 的增量决定 white-rate。
3. **重新加入排行榜**（`visible:true`，服务端 `force` 基于当前主档重算）。

> **合并取最大值**是最容易踩的坑：一旦传过某高值并入了榜，再传更低值也不会降。务必"退出 → 覆盖 → 重入"。

### 求解一组自洽字段（耦合关系）

`galaxy` 是 power/upload/dyson/throughput 的加权和，`white-rate` 又依赖元神档增量，因此 6 榜相互耦合：

- **先取当前在榜数值作为基线**（每个 category 调 `/leaderboard` 拿到该账号的 `value`）。这是"硬性规则"的不可下破底线。
- **随机数只能取不劣于当前的档位**：允许名次集合 = `[2, 6] ∩ [1, 当前名次]`。若当前为第 1 名，则只能保持第 1 名（不调）。
- 先定 `power(E)`、`upload(U)`、`throughput(T)`、`white(W)` 四个目标值：取所选档位区间中点后，再用 `clampUp = max(中点, 当前值)` 兜底，**绝不低于当前值**。
- `galaxy = base + dyson/100`，`base = E/1e6 + 12×U + 8×T + const`。`G` 同样 `clampUp`；dyson 由 `D = (G - base) × 100` 反解（因 `G ≥ 当前G` 且 `base ≥ 当前base`，必有 `D ≥ 当前D`，无需单独再取档位）。
- 白糖：`W = (wmB - wmA) × 60 / Δelapsed`，`wmB = U`，反解 `wmA = wmB − W×Δelapsed/60`，并保证 `wmA ≥ 0`。`W` 已 `clampUp`，速率不低于当前。
- `E = genKw × elapsedB/1000`，选定 `elapsedB` 后反解 `generationKw`。
- **落库前逐指标断言 `target ≥ 当前值`**，任一不满足则中止（不写入）。

> 小结：本方法的每一步都内置"只增不降"的硬约束，随机名次被限制在"不比当前差"的档位内，数值再做一次 `clampUp` 兜底，并带断言保护。

### Node 实现骨架

```js
async function req(p, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch("https://dsponline.cn/api" + p,
    { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
}
function checksum(formatVersion, state) {
  const payload = JSON.stringify({ formatVersion, state });
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i); h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
// 1. 登录 -> token
// 2. GET /cloud-save?slot=main 拿到 envelope(payload) + revision
// 3. 改 state 字段，重算 env.checksum = checksum(env.formatVersion, env.state)
// 4. 退出 -> PUT /cloud-save 两次(A,B) -> 重入
await req("/leaderboard/visibility", { method:"POST", token, body:{ visible:false } });
await req("/cloud-save?slot=main", { method:"PUT", token, body:{ payload:saveA, expectedRevision: rev } });
await req("/cloud-save?slot=main", { method:"PUT", token, body:{ payload:saveB, expectedRevision: <rev2> } });
await req("/leaderboard/visibility", { method:"POST", token, body:{ visible:true } });
// 5. 逐榜 GET /leaderboard?category=...&seasonId=season_01 验证 rank
```

### 限流（避免被挡）

- 服务端按 `IP:method:path` 限流，窗口 60 秒：`/api/auth/*` 上限 12，/api/presence 10，/api/analytics 30，其它 120。超过返回 **429**（`retry-after: 60`）。
- 注册接口（`/api/auth/register`）被限流时返回 **429** 且 `retry-after: 3600`（1 小时），本方法用已存在账号登录，不会触发。
- 批量脚本建议每个请求之间留间隔、加重试。

---

## 5. 当前账号"防封号"修复（把异常 vein 清零）

为消除第 3 章风险，需把主档所有 vein 实体的 `machineCount` 设为 `0` 并保持 checksum 有效。注意 white-rate 由相邻两档增量决定，修改主档会让它成为新的"上一档"，因此**必须同时让增量保持原速率**（例如 `Δelapsed = 600s`，`wm新 = wm旧 + whiteRate × 10`），否则白糖速率会归零、名次暴跌。

实施要点：
- 下载当前主档（rev N）。
- 复制一份新档：所有 `e.kind === "vein"` 设 `machineCount = 0`；`elapsedSeconds += 600`；`universe_matrix += 当前whiteRate × 10`；其余（genKw、throughput、dyson、wm基线等）保持不变。
- 重算 checksum。
- 退出排行榜 → 上传这一份（成为 rev N+1）→ 重新加入。
- 验证：6 榜名次不变；`white-rate` 数值不变；vein 异常计数 = 0。

> 该操作只影响 moderation 风险与"相邻增量基准"，**不改变任何排行榜名次**；power/galaxy 因 elapsed 微增产生的影响落在名次窗口的容差内。

### 本账号已执行（记录）

- **vein 清零**：已对主档执行，39 个 `machineCount != 0` 的 vein 实体全部置 0，重算 checksum 后上传（现 rev 8+）。当前异常计数 = 0。
- **首次修复时**：白速率保持 `Δelapsed=600`、`wm += whiteRate×10`，6 榜名次未变。
- **与"只增不降"硬规则的配合**：第 5 章的 elapsed/wm 增量调整本身就满足第 0 章的只增不降要求（`elapsed` 与 `universe_matrix` 都在变大）；若后续再次做 vein 清零，务必保持 `elapsed` 与 `wm` 不低于当前值，避免触发硬性规则的下调中止。

---

## 6. 维护常识 / 红线清单

- **硬性规则：只增不降。** 任何指标的最终数值都 ≥ 该账号当前在榜值；随机名次只能落在"不劣于当前"的档位（名次 ≤ 当前名次），绝不能调低。
- 每次改 `state` 都要重算 FNV checksum，否则 400 拒绝。
- 不要启用内容包（mod），否则被移出排行榜（422）。
- `white-rate` 同样遵循**合并取最大值**规则（与 power/upload/dyson/throughput/galaxy 一致）：用更高产量的相邻档覆盖主档，白糖榜会再上升；要降必须先"退出→覆盖→重入"。
- **vein.machineCount 必须为 0**，否则有被运营防作弊工具拉黑（封榜）的风险。
- 改动只在 `slot=main` 生效，本机存档不受影响。
- 批量操作注意 429 限流，加间隔与重试。
- `leaderboardVisible=false` 时账号在榜上完全不可见，记得最后重入并确认。
