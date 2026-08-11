# DSPidle2 1.0.39 云存档 P0 热修 Release Agent 交接

> 交接日期：2026-08-11
> 开发角色：develop
> 起点：最新 `origin/main` `096de33632e10ba615a66542a99dd2df4f980798`
> 固定 release source：`fb54f2148dd64268ee2c2f39c6774b348e6ea437`
> Build ID：`1.0.39+fb54f2148dd6`
> Release ID：`1.0.39-fb54f2148dd6`
> 开发分支：`codex/1.0.39-cloud-save-p0`
> 当前生产：香港、上海 Web/API 均为 `1.0.39+fb54f2148dd6`；上海下载页与原生 stable 保持 1.0.38
> 状态：Release Agent 已完成两地备份、副本隔离、原子切换、公网/Chrome/PWA 验收；正式证据见 [1.0.39 发布记录](./releases/1.0.39.md)

## 0. Release Agent 执行结果

用户于 2026-08-11 明确授权发布 1.0.39，并要求香港公开 previous-stable 继续保持 1.0.37。Release Agent 从固定 clean source `fb54f2148dd64268ee2c2f39c6774b348e6ea437` 复验 source 163/163、candidate 2/2、Web 128/128、API 35/35 与全部 SHA-256，在香港和上海各自的发布前备份副本上完成稀疏/稠密、非法值、模式槽位、历史恢复和重启验证后，依次切换两地 Web/API。

两地 current 均为 `1.0.39-fb54f2148dd6`，代码-only 回滚目标为 1.0.38；数据库、下载页和 native feeds 没有回滚、恢复或替换。上海下载页、Android/Windows stable 继续为 1.0.38，香港 `/canary/previous/` 继续 302 到不可变 1.0.37。稳定观察时两地服务 active、`NRestarts=0`、backup `ready`、journal error 0；香港 ready 后 26 次真实云 PUT 均为 2xx、5xx 为 0。完整备份哈希、切换空窗、公网字节、Range/cache、6 场 Chrome、PWA 与回滚指针见正式发布记录。

## 1. 交接结论

P0 已修复。1.0.38 Web、Android 和 Windows 生成的合法 GameState v46 稀疏云存档可由新 API 接受，玩家不需要清缓存或重装客户端。服务端仍先验证原 envelope checksum，再进行结构判断；验证、保存、历史恢复和下载都不规范化或改写上传正文。

排行榜复核 revision 口径问题已按要求放在独立提交中修复。它不是云上传 400 的原因：人工解除冻结后，普通与速通分别等待各自 main revision 前进，任一模式的上传或历史恢复不会提前解除另一模式等待。

开发角色没有连接香港/上海服务器，没有使用真实玩家账号、生产数据库或玩家存档做写入测试，没有修改排行榜历史、云 revision、下载页或 stable 清单，也没有读取签名材料。

## 2. 独立提交

| 提交 | 内容 |
| --- | --- |
| `23ae5fcc9db52e1be8b43186c87ccf770340cd8e` | P0：服务端接受 v46 合法稀疏默认值，新增 HTTP/重启/历史/恢复回归 |
| `74b2dd97050cbf78e3ea1f4ffa609f0e61c3328c` | 独立修复：普通/速通排行榜复核 revision 与清除口径 |
| `fb54f2148dd64268ee2c2f39c6774b348e6ea437` | 1.0.39 版本化、浏览器协议回归、文档和 release manifest 输入 |

本交接文档位于固定 release source 之后的文档提交中，因此不会造成 Git SHA 自引用，也不改变上述 Build ID。

## 3. 修改文件列表

相对起点共修改/新增 17 个文件：

### 服务端实现

- `server/index.mjs`
- `server/account-security.mjs`
- `server/package.json`

### 新增与扩展测试

- `server/cloud-save-v46-sparse.test.mjs`
- `server/leaderboard-revalidation.integration.test.mjs`
- `server/account-security.test.mjs`
- `tests/e2e/v139-cloud-hotfix.spec.ts`

### 版本、构建和文档

- `package.json`
- `package-lock.json`
- `android/native-version.properties`
- `deploy/create-release-manifest.mjs`
- `CHANGELOG.md`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT_OPERATIONS.md`
- `docs/PROJECT_STATUS.md`
- `docs/TESTING_RELEASE.md`
- `docs/releases/1.0.39-candidate.md`

代码差异总计为 926 行新增、31 行删除；未重写 1.0.38 客户端玩法实现。

## 4. 云上传 400：复现与修复

### 修复前复现

合成 v46 envelope 的内部 FNV checksum 有效，普通/速通 mode 也正确，但普通线路省略 `lanes/tier/progress`、实体省略 `interactionLocked=false` 时：

- `PUT /api/cloud-save` → `400`
- code → `SAVE_FORMAT_INVALID`
- 同一状态补齐稠密默认字段后 → `200`

新增测试先在未修代码上运行并稳定得到上述 400，再修改验证器；不是先写实现后补一个只会通过的测试。

### 修复后规则

仅 GameState v46 且字段缺失时，结构验证局部读取：

| 字段 | 缺失时读取 |
| --- | ---: |
| `belt.lanes` | `1` |
| `belt.tier` | `1` |
| `belt.progress` | `0` |
| `entity.interactionLocked` | `false` |

以下仍拒绝：

- 显式 `null`。
- 数字字符串等错误类型。
- 非法 JSON 中的 `NaN`；JSON 可表示的非有限值会变成 `null` 并拒绝。
- `lanes/tier=0`、负数或越界。
- `progress<0` 或超过 `100,000,000`；显式 `progress=0` 必须合法，以兼容 1.0.37 稠密存档。
- 损坏或不匹配的 envelope checksum。

完整性顺序没有改变：`inspectSavePayloadIntegrity(payload)` 成功后才进入结构检查。默认值只保存在函数局部变量中；没有在完整性检查前后修改 `payload` 或解析后的 state。

### 原文保持证据

专项逐字比较并通过：

- 上传请求 payload 与下载 `cloudSave.payload` 完全相同。
- envelope 内原始 checksum 完全相同。
- 云元数据 checksum 仍是原 payload 的 SHA-256。
- 普通/速通、main/手动槽 revision 都从各自 1 开始，互不影响。
- 第二修订、历史列表、恢复为新修订、服务重启后正文均保持原样。

## 5. `saveProjection.ts` 全字段审计

| 类别 | 结论 |
| --- | --- |
| 普通传送带 `lanes/tier/progress` | 与服务端显式必填直接冲突，已兼容缺失默认值 |
| 实体 `interactionLocked=false` | 审计额外发现的直接冲突，已兼容缺失默认值 |
| `machineCount/minerCount` | 服务端本来就是可选；显式非法值仍拒绝；时间扭曲/黑洞等要求正堆叠的建筑仍有专用校验 |
| `resourceDepletionRemainder` | 可选；显式值仍限制在 0–9 |
| `quantumTarget` | 可选并受端点类型约束；非默认真值没有被投影丢失 |
| 实体电网、功率、站点诊断、喷涂、空输入输出/路线 | 服务端不强制，迁移可精确重建默认值 |
| 线路 sorter/priority/stack/monitor/累计/拥堵/流量/routeMode | 普通线路服务端不强制，迁移可重建；非默认值仍保留 |
| 蓝图线路 | 不经过普通线路稀疏化；v46 `lanes/tier/priority` 继续显式存在并严格校验 |
| 云摘要 | 读取 mode/version/savedAt/elapsed/entity count/科技/戴森/累计白糖/checksum，不依赖省略默认值 |
| 普通排行榜完整性 | 读取累计生产、elapsed、实体存在性和云 revision/checksum，不依赖省略默认值 |
| 速通校验 | 读取 speedrun 身份、mode、规则、内容包、禁用状态、里程碑、revision/checksum，不依赖省略默认值 |

没有发现其他 `saveProjection.ts` 省略字段与服务端摘要或排行榜完整性检查冲突。

## 6. 排行榜复核 revision 独立化

内部 `accountControls` 增加可选字段：

```text
leaderboardResumeAfterRevisionByMode: {
  normal?: number,
  speedrun?: number
}
```

兼容规则：

- 旧 `leaderboardResumeAfterRevision` 继续解释为普通模式阈值。
- 新写入同时保留该普通模式标量别名，保证代码回滚后旧 API 仍能执行普通榜等待规则。
- `restore-leaderboard` 分别读取普通 main 与速通 main 当前 revision。
- 普通 main 上传/恢复只清普通阈值；速通 main 上传/恢复只清速通阈值。
- 手动槽不解除排行榜复核。
- 隐藏状态不阻止完成复核，但完成后仍保持隐藏。
- `leaderboardModeration` 永久冻结不被上传或历史恢复删除；只能由明确的管理员复核动作解除。

现有旧标量无法可靠反推历史速通阈值，因此不会自动拿普通 revision 再去阻塞速通；这是修正旧串口径的必要兼容选择。若运营要求旧个案重新审核速通，必须按明确账号再次执行正式限制/恢复流程，不能直接编辑数据库。

## 7. 存档结构与迁移

### 玩家存档

没有结构变化：

| 层 | 版本 |
| --- | --- |
| GameState | v46 |
| save envelope | v2 |
| IndexedDB | 不升级 |
| cloud schema | v7 |
| SQLite payload layout | v2 |
| 模式 | `normal` / `speedrun`，不变 |

本热修不会重新保存、迁移或覆盖任何玩家正文。旧裸状态、旧 envelope、v45 稠密和 v46 稠密/稀疏继续按已有迁移链读取；缺失 mode 的旧档仍默认为普通，不会获得速通资格。

### 服务内部账号控制

`leaderboardResumeAfterRevisionByMode` 位于已有 JSON account controls 内，是可选字段，不新增表、列或 SQLite migration。规范化幂等；旧标量安全迁移为普通模式语义。代码回滚时旧 API 忽略新映射，并继续读取同步保留的普通标量。

## 8. 纯挂机、资源结算与模式隔离

1.0.39 没有改纯挂机计时、离线结算、倍率、矿脉扣除、缓存、传送带、物流塔、量子库存或物资托盘逻辑。1.0.35～1.0.38 的当前运行/历史累计分离、结算游标幂等、满缓存不扣矿和普通模拟共用规则保持原样，并随 950 项 Vitest 与 282 项 Playwright 完整回归。

普通/速通本地槽、自动保存、快照、导入导出、云 `mode + slot` 和排行榜资格也未改。新增的只是服务内部排行榜复核等待点按 mode 分开；云正文和 mode 隔离测试确认普通/速通同槽仍不会串档。

## 9. Web/API/Android/Windows 兼容矩阵

| 组件 | 与 1.0.39 API | 是否必须更新 |
| --- | --- | --- |
| API 1.0.39 | P0 修复载体 | **必须部署**才能恢复稀疏上传 |
| Web 1.0.38 | 合法 v46 稀疏正文变为 200 | 不需要清缓存或更新；可直接继续使用 |
| Android 1.0.38 / 1000038 | raw JSON 协议不变 | 不需要重装或新 APK |
| Windows 1.0.38 | envelope/mode/revision 协议不变 | 不需要重装或新 setup |
| Web 1.0.39 候选 | Build ID 与 API 一致，完整构建通过 | 可选；不是 P0 恢复前置条件 |
| 1.0.37 客户端/稠密 v45 | 显式默认字段继续 200 | 保持兼容 |

`android/native-version.properties` 同步到 `1.0.39 / 1000039` 只用于源码版本一致性和未来重建。开发角色没有构建或发布 Android/Windows 1.0.39 制品；本次不需要替换稳定原生清单。

## 10. 新增测试与结果

### P0 稀疏上传

- v46 普通、速通。
- main、手动槽。
- 三个传送带字段全部缺失和逐类非法显式值。
- `interactionLocked=false` 缺失及非法显式值。
- 非法 JSON/NaN。
- v45 稠密正文。
- 原 payload、envelope checksum、云 SHA-256、revision、下载正文。
- 普通/速通隔离。
- 第二修订、历史、恢复、服务重启。

### 排行榜复核

- 普通上传、速通上传。
- 普通历史恢复、速通历史恢复。
- 模式阈值只清除自身。
- 旧 accountControls 标量兼容。
- 隐藏排行榜保持隐藏。
- 永久冻结在上传/恢复后仍阻断普通榜和速通榜。

### 最终门禁

| 门禁 | 结果 |
| --- | --- |
| 根 `npm ci` | 通过；458 个包 |
| server `npm ci` | 通过；76 个包 |
| typecheck | 通过 |
| Vitest | 107 文件通过/6 跳过；950 通过/18 跳过 |
| server 源码 | 75 通过/2 可选夹具跳过 |
| server 解包候选 | 75 通过/2 可选夹具跳过 |
| ops | 6/6 |
| native tools | 8/8 |
| licenses | 128 个运行时包，当前 |
| root/server `npm audit --omit=dev` | 均为 0 漏洞 |
| clean Vite build | 通过；仅既有 >500 kB chunk 警告 |
| Playwright 专项 | 2/2 |
| Playwright 最终全量 | 282 通过/11 条条件夹具跳过/0 失败；293 总项；838.3 秒 |

Playwright 首次全量有一条既有“矩阵研究线路移动”用例在 90 秒瞬时超时；同一目标随后 4.0 秒通过，第二次完整 293 项全量为 0 失败。该事实必须保留在发布记录中。

## 11. 性能影响

- v46 结构验证仍是既有 O(entities + belts) 单次扫描；新增工作只是每个实体/线路最多四个缺失判断和局部默认值，不增加 JSON parse、序列化、深拷贝或数据库写入。
- 成功上传仍只保存原始字符串一次，不创建规范化大对象副本；23 MB 量级峰值内存不会因本修复额外复制 payload。
- 排行榜阈值读取/清除为单账号 O(1)，只在管理员动作、main 上传、main 恢复或提交入口触发。
- 模拟、离线和纯挂机热路径没有变化，因此不预期影响产量、结算时间、Canvas 或 FPS。

## 12. 未解决风险

1. 开发角色按要求未使用生产数据库备份副本；Release Agent 仍须在两节点各自备份副本上隔离启动验证。
2. 没有用真实 23 MB 玩家存档写入测试；专项使用同结构合成 v46，避免真实数据风险。
3. 1.0.39 Android/Windows 未重建或签名，因为客户端更新不是 P0 前置条件；若未来决定发布，全部签名连续性与覆盖升级门禁需重新执行。
4. 旧单值复核记录只可确定普通模式语义，不能无证据推导历史速通阈值；需要个案重新审核时必须走管理员流程。
5. 首次 Playwright 完整运行出现一条瞬时超时，虽然后续目标和完整全量均通过，仍应在发布记录中保留。
6. API 回滚到 1.0.38 会重新出现稀疏上传 400；回滚是安全停止新代码的手段，不是故障解决方案。

## 13. 不可变发布清单与制品

### Source manifest

- 路径：`artifacts/release-manifests/1.0.39-fb54f2148dd6.json`
- 字节：27,570
- 文件：163
- aggregate SHA-256：`d31e607f9c8200fa986d6e61d8728f96e784c41237135912a3a2df1505bc4af4`
- manifest SHA-256：`d21a80b96765047f526f2dc1210696bab9b069d80e79925b93066a112a921d4d`
- clean Git：`true`
- 复验：163/163

### Candidate artifacts

目录：`artifacts/release-packages/1.0.39-fb54f2148dd6`

| 文件 | 字节 | SHA-256 | 用途 |
| --- | ---: | --- | --- |
| `1.0.39-fb54f2148dd6-api.tar.gz` | 112,716 | `e826c1d784f7cb11eccde535a3eca712641acda6538f9533d2be7e6d96df4fff` | P0 API 候选，优先部署对象 |
| `1.0.39-fb54f2148dd6-web.tar.gz` | 1,380,269 | `2dd638a4d7482d429139c2b4a99947e4e76a50c6fd14de65774d4dac6b29620a` | 可选 Web 候选；不是恢复上传前置条件 |
| `candidate-artifacts.json` | 810 | `e67627e9a96315277a26cc121b6bb5d4381fcb7bd2856610d9639afc26e6b06b` | 两制品不可变清单 |

`candidate-artifacts.json` 的两文件 aggregate SHA-256 为 `7ac07264790575b51301067be4485d30b1f46b3a39ba399132f8d3d0f033bdcc`，2/2 复验通过。

归档独立解包后：Web 128/128、API 35/35；缺失、额外、大小/哈希不匹配均为 0；API 禁止路径扫描为 0，不含 `node_modules`、数据库、`server/data`、备份、环境文件、PEM/密钥或原生签名材料。Web `version.json` 为 `1.0.39+fb54f2148dd6`，index 11 个本地引用全部存在，PWA worker 与 manifest 存在。

## 14. Release Agent 必做

1. 从固定 commit `fb54f2148dd64268ee2c2f39c6774b348e6ea437` 建立全新 clean worktree，复验 source manifest、candidate manifest 和上述 SHA-256。不要从本交接文档提交重建后复用旧 Build ID。
2. 不连接生产写测试。先在本地临时 SQLite 复跑 P0 与复核专项；再分别对香港、上海创建 SQLite Backup API 快照并验证 `quick_check`、权限和哈希。
3. 将 API 解包到新的不可变未激活目录；在各节点自己的备份副本和隔离端口启动。不得跨节点复制数据库。
4. 合成验证普通/速通 main 与手动槽、稀疏 200、非法值 400、稠密 v45 200、原始正文/checksum/revision、历史恢复、服务重启和模式隔离。
5. 在副本中验证旧 accountControls、普通/速通复核阈值、隐藏状态与永久冻结；不得修改排行榜历史成绩。
6. 使用现有 1.0.38 Web 协议、Android raw JSON 形状和 Windows envelope 形状验证候选 API。恢复故障不得要求玩家清缓存或重装。
7. 获得用户明确发布授权后，优先只灰度一个 API 节点；Web、Android、Windows 可保持 1.0.38。观察 `PUT /api/cloud-save` 的 2xx/400、`SAVE_FORMAT_INVALID`、checksum 失败、冲突、进程重启和延迟/内存。
8. 单节点稳定后再切第二 API 节点。不要切下载页或 stable 原生清单；除非另有明确发布范围和完整签名/覆盖升级验收。
9. 生产 smoke 只使用获准的合成测试账号；不得上传玩家存档或编辑数据库。确认后清理合成账号须走受保护删除流程，不能直接删表。
10. 写正式 `docs/releases/1.0.39.md`，记录备份、隔离启动、授权、原子切换、公网结果、监控窗口和回滚证据。

## 15. 回滚方案

- 未切流：废弃新的未激活 API 目录，生产保持 1.0.38。
- 已灰度：将 API 代码指针原子切回现有不可变 1.0.38 API 目录并重启；Web、Android、Windows 无需动作。
- **只回滚代码，不恢复生产数据库。** 本版没有 schema/layout migration，新内部字段对旧代码可忽略；恢复数据库反而会丢失灰度期间合法云修订和账号状态。
- 不删除浏览器/App 缓存，不覆盖玩家本地或云存档，不补发物资，不跳过收益，不修改排行榜历史。
- 回滚后稀疏上传 400 会复现，应明确告知并重新评估修复，不得把回滚描述为已解决故障。

## 16. Go / No-Go

以下条件已全部满足，1.0.39 已由 No-Go 转为 Go 并完成发布：

- 两节点备份及备份副本隔离启动通过。
- 固定源码、Build ID、163 文件和两候选归档哈希全部匹配。
- 现有 Web/Android/Windows 1.0.38 协议矩阵通过。
- 稀疏/稠密、非法值、正文不变、重启/历史/恢复、模式隔离和复核阈值测试通过。
- 发布监控与代码-only 回滚路径准备完成。
- 用户明确授权生产灰度。

未观察到 payload 改写、revision/checksum 异常、普通/速通串档、永久冻结失效、数据库异常或进程重启。发布后的代码回滚边界仍按第 15 节执行。

## 17. 历史 Release Agent 提示词（已完成）

以下提示词只保留作发布审计；两地已按第 0 节完成，不得据此重复创建备份或再次切流。

```text
请按 DSPidle2 1.0.39 API P0 热修交接执行发布前复验；没有用户明确授权前不要部署。

固定源码：fb54f2148dd64268ee2c2f39c6774b348e6ea437
Build ID：1.0.39+fb54f2148dd6
source manifest：artifacts/release-manifests/1.0.39-fb54f2148dd6.json
候选目录：artifacts/release-packages/1.0.39-fb54f2148dd6
交接：docs/RELEASE_HANDOFF_1.0.39.md

先复验 163/163 source、Web 128/128、API 35/35、candidate 2/2 与全部 SHA-256。API 是 P0 必需更新；现有 Web/Android/Windows 1.0.38 无需清缓存或重装，Web 1.0.39 仅为可选候选，不生成或切换新原生 stable 制品。

分别创建香港/上海生产备份并只在各自备份副本隔离启动。使用合成账号和临时/副本 SQLite 验证 v46 稀疏普通/速通 main+手动槽 200、非法值 400、v45 稠密 200、原 payload/checksum/revision/历史/恢复/重启不变，以及普通/速通复核阈值、隐藏状态和永久冻结。不得使用玩家存档写测试，不得修改排行榜历史。

获得明确授权后只先灰度一个 API 节点，观察云 PUT 状态码、SAVE_FORMAT_INVALID、完整性、冲突、延迟、内存和重启，再切第二节点。不要要求玩家清缓存，不切下载页或原生 stable feed。回滚只切回旧 API 代码并重启，绝不恢复生产数据库。
```
