# DSPidle2 1.0.40 Development Handoff

> 交接日期：2026-08-12
> 开发角色：develop
> 范围：1.0.40 第 1 项——银河排行榜当前账号误显示“未上榜”
> 正式基线：`1.0.39-fb54f2148dd6` / `fb54f2148dd64268ee2c2f39c6774b348e6ea437`
> 开发分支：`codex/1.0.40-leaderboard-ranking`
> 固定运行时实现：`24d54c10ce6c04cade5173c1980143928c6f6fd4`
> 状态：开发与完整本地发布前门禁通过；未部署、未连接生产、未修改玩家或排行榜数据

## 1. 交接结论

本项已完成。公开银河榜仍是匿名 Top 100；登录账号通过独立认证 `/api/leaderboard/me` 获取完整公开 submission 集合中的本人真实排名。排名超过 100 时显示 `#N · Top 100 外`，没有有效 60 秒窗口时显示准确原因和已观察秒数，白糖未知为 `--`，有效零产出才显示 `0`。

服务器认证值和本地 60 秒最佳值已完全分栏。本地高值不会填进服务器成绩或排行榜名次。普通银河榜仍只由 `normal/main` 更新，速通 main 与普通手动槽均不参与。

开发过程中没有连接香港或上海服务器，没有使用真实玩家账号、真实玩家存档或生产数据库做写入测试，没有部署 Web/API，没有修改现有 submission 或排行榜历史。

## 2. 修改文件

运行时与测试固定在实现提交 `24d54c10ce6c04cade5173c1980143928c6f6fd4`：

- `server/index.mjs`
- `server/server.test.mjs`
- `src/game/cloud.ts`
- `src/game/cloud.test.ts`
- `src/components/GalaxyWorkspace.tsx`
- `src/i18n/legacyTranslations.ts`
- `src/i18n/legacyTranslations.test.ts`
- `tests/e2e/game-flow.spec.ts`

交接文档提交另更新：

- `docs/PROJECT_STATUS.md`
- `docs/feedback/2026-08-12-1.0.40-银河排行榜未上榜-Bug.md`
- `docs/DEVELOPMENT_HANDOFF_1.0.40.md`

本项尚未提升 `package.json` 版本，也未生成或覆盖 1.0.40 制品。它是 1.0.40 批次第 1 项，Release Agent 应在合并完整批次后创建唯一版本提交、Build ID 和不可变制品。

## 3. 根因与修复边界

根因有两部分：

1. 公开接口只返回 Top 100，而 1.0.39 客户端只在这 100 条里找本人；第 101 名以后统一误判“未上榜”。
2. 白糖相邻 revision 计算把“无窗口”和“有效零产出”都压成 `0`，同时 UI 在缺本人服务器条目时混入本地吞吐 ledger。

修复只涉及排行榜读取、窗口状态表达和 UI 展示。没有修改生产模拟、离线结算、纯挂机、存档读写、云上传正文、自动保存或速通校验规则。

## 4. API 契约

### 公开 Top 100

```http
GET /api/leaderboard?category=throughput&seasonId=season_01
```

- 匿名可读，旧 `entries` 响应保持兼容。
- 只返回 Top 100。
- 不因请求携带 token 而附加当前账号状态。
- 不暴露 `/me` 的 `status`、`entry`、`rank`、`totalEntries`、`serverMetrics` 或 `latestWindowState`。

### 当前账号认证状态

```http
GET /api/leaderboard/me?category=throughput&seasonId=season_01
Authorization: Bearer <token>
```

最小响应契约：

```json
{
  "status": "ranked",
  "entry": {},
  "rank": 150,
  "totalEntries": 150,
  "serverMetrics": {},
  "latestWindowState": {},
  "mode": "normal",
  "slot": "main",
  "latestCloudRevision": 5,
  "reviewResumeAfterRevision": null
}
```

认证缺失返回 `401`。私有响应为 `no-store`。`rank` 在完整公开 submission 集合中计算，`entry` 只可能是当前账号；隐藏、限制、复核等待或无有效 entry 时返回 `null`。

顶层 `status` 严格使用：

```text
ranked
hidden
restricted
revalidation_required
missing_main_save
missing_adjacent_revision
interval_too_short
elapsed_not_increasing
valid_zero_production
unavailable
```

白糖和实际结算吞吐的 `latestWindowState` 使用同一结构：

```text
status, valid, value, metricVersion,
requiredSeconds, observedSeconds, remainingSeconds,
productionDelta, fromRevision, toRevision
```

未知/无效窗口必须 `value=null`；有效零产出必须 `valid=true`、`status=valid_zero_production`、`value=0`。

## 5. 数据结构、迁移与只读保证

| 层 | 结果 |
| --- | --- |
| GameState | 保持 v46 |
| save envelope | 保持 v2 |
| 本地/IndexedDB 存档 | 无字段、索引或迁移变化 |
| cloud schema | 保持 v7 |
| SQLite layout | 保持 v2 |
| submission | 不新增窗口诊断字段，不修改历史值 |
| 模式与槽位 | 继续使用既有 `normal/speedrun + main/1/2/3` 隔离 |

窗口诊断仅保存在最多 2,048 项的服务进程内 Map。普通 main 更新时填充；冷启动回填或缓存未命中时可从当前与相邻 revision 只读重算。测试在 `/me` 前后逐对象比较云档元数据和 submission，结果完全相同。

旧存档无需迁移。旧版本存档的读取、默认普通模式规则、云 checksum、revision、历史恢复和导入导出均未改动。

## 6. UI 行为

- 排名大于 100：`#N · Top 100 外`。
- 缺普通 main：明确提示普通主云档缺失，速通主档和手动槽不参与。
- 缺前序：提示完成第二次有效同步。
- 59 秒：显示已观察 59 个模拟秒、还需 1 秒。
- 计时未增长：明确本次不更新成绩。
- 有效零产出：显示“有效窗口，当前无产出”。
- 白糖未知：`--`；有效零产出：`0`。
- 服务器白糖、服务器实际结算吞吐、本地白糖 60 秒最佳、本地实际结算吞吐 60 秒最佳分别成行。
- 当前没有可靠的本地白糖 60 秒持久指标，因此显示“本地尚未记录”。
- `/me` 暂时不可用时，公开榜仍显示；认证区明确报错，本地值不会伪装成服务器成绩。

## 7. 测试证据

### 新增/扩展覆盖

- 150 个合成账号；本人第 150 名时 `/me` 返回真实名次，公开榜仍只有 100 条。
- 公开接口即使带 token 也不返回本人私有字段；未认证 `/me` 返回 401。
- 无普通 main、无前序 revision、59 秒、60 秒、计时不增长、有效零产出、有效正产出。
- 白糖和实际结算吞吐分别验证数值、增量和窗口状态。
- hidden、restricted、revalidation_required。
- 普通 main、普通手动槽、速通 main 在榜单形成前后均不串榜。
- `/me` 读取不修改云存档或 submission。
- 旧客户端继续按原公开接口读取。
- 本地 196 亿/min、服务器无窗口时 UI 分栏；白糖未知 `--` 与有效零产出 `0` 分别验证。
- 390×844 移动视口无横向溢出；新增中英文文案均有回归。

### 完整门禁结果

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 951 passed / 18 skipped；107 文件通过 / 6 条件文件跳过 |
| `npm run test:server` | 76 passed / 2 optional skipped |
| `npm run test:ops` | 6/6 |
| `npm run test:native` | 8/8 |
| `npm run licenses:check` | 128 个运行时包一致 |
| `npm run build` | 通过；1,893 modules |
| `npm run test:e2e` | 283 passed / 11 optional skipped；294 total；退出码 0 |
| 根项目 `npm audit --omit=dev` | 0 vulnerabilities |
| server `npm audit --omit=dev` | 0 vulnerabilities |

本隔离工作树已按锁文件安装依赖，锁文件未修改。构建只有既有 `FactoryRuntime` 大 chunk 警告。Playwright 的 `127.0.0.1:65534` 拒绝日志来自既有云端故障注入测试，最终退出码为 0。

## 8. 兼容矩阵

| Web/API 组合 | 结果 |
| --- | --- |
| 1.0.39 Web + 新 API | 原匿名 Top 100 完全兼容；旧客户端不调用 `/me` |
| 新 Web + 新 API | 完整 1.0.40 行为 |
| 新 Web + 1.0.39 API | 公开榜可用；认证区显示不可用，不混入本地值 |
| Android/Windows 旧客户端 + 新 API | 不需重装即可继续旧 Top 100、云存档和生产流程 |
| 未来 1.0.40 Android/Windows + 新 API | 与 Web 使用同一认证 `/me` 契约 |

建议发布顺序：API 先，Web 后。新接口不要求数据库迁移。原生客户端只有在需要新 UI 时才需要新制品；本服务端改动不会迫使 1.0.39 原生客户端重新安装。

## 9. 性能影响

- 匿名公开榜无额外认证或响应体开销。
- 已登录银河页面每次分类切换增加一个小型 `/me` 请求。
- `/me` 排名计算当前为完整公开集合排序，`O(n log n)`；150 账号测试稳定。若未来账号数显著增长，应复用服务端排序快照或数据库 rank 查询。
- 窗口缓存最多 2,048 条小对象。冷缓存只读解析最多当前和相邻普通 main revision，可能增加首个 `/me` 延迟，但不会写数据或影响正确性。
- 客户端仅增加小型状态对象；对模拟帧、离线结算、纯挂机和大存档内存没有影响。

## 10. 未解决风险

- 本地白糖 60 秒最佳没有独立持久 ledger；本版选择显示“未记录”。若以后新增，应作为本地指标单独设计，不能回填服务器榜。
- 排行榜规模远超当前量级时，两个接口各自排序可能成为服务端热点；发布观察应记录 `/api/leaderboard/me` 延迟和错误率。
- API 与 Web 错序发布会短暂显示“认证状态不可用”，但不会错误显示本地服务器成绩，也不会影响云存档。
- 真实低速公网、超大生产数据库下的 `/me` P95 需要 Release Agent 在隔离副本和候选环境只读验证；开发阶段没有触碰生产数据。

## 11. Release Agent 操作边界

1. 从本分支 clean tip 或固定实现提交构建完整 1.0.40 批次，不复用 1.0.39 Build ID。
2. 先在临时 SQLite 与合成账号上复验 API，再按正常备份流程发布 API，最后发布 Web。
3. 确认公开接口仍为 Top 100、`/me` 必须认证、Top 100 外真实排名正确。
4. 观察 `/api/leaderboard` 与 `/api/leaderboard/me` 的 2xx/4xx/5xx 和延迟，但不得打印 token、玩家正文或私有 entry。
5. 不修改排行榜历史、现有 submission、生产数据库内容或玩家存档。
6. 1.0.40 其他需求合并后必须重新跑完整门禁；本交接结果不能替代最终候选复验。

## 12. 回滚

- 首选代码回滚到不可变 `1.0.39-fb54f2148dd6`；不要恢复生产数据库。
- 本分支包含前置实现 `4a78ae715e395de98b535db9923bed1b82c29e0e` 和严格契约修正 `24d54c10ce6c04cade5173c1980143928c6f6fd4`。若用 Git revert 回滚，必须按逆序撤销两者；只撤销严格修正会重新启用已废弃的公开响应内嵌 `self` 方案。
- 因无 schema、存档或排行榜数据迁移，回滚后无需数据补偿；云 checksum、revision、历史和 submission 保持原样。
