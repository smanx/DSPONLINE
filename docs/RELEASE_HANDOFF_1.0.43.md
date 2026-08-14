# DSPidle2 1.0.43 Release Agent 交接

## 任务

| 字段 | 内容 |
| --- | --- |
| Task ID | `DSPIDLE-1043-LARGE-SAVE-HOTFIX` |
| 标题 | 35 MiB 超大存档导入、载入、保存与返回主页热修 |
| 优先级 | 1.0.43 P1 热修已发布；运行态残余升级为 1.0.44 P0 |
| 运行时提交 | `6c2df9686031fa1db68b1d862f33364cbbae95a6`（含 `35ab5746baf3` 超大存档热修） |
| 发布测试契约返修 | `7d61726c1a1bae11a63ab2217d863a4cc7da7cbd` |
| 第二轮存档/发布门禁返修 | `6c2df9686031fa1db68b1d862f33364cbbae95a6` |
| 最终源码/制品提交 | `fceca3eda51cf7e488e176e23c6119ba104b77fd`（parent `2ecd5ad1a64dfa0a48bb2e2694040f48f3860b21`） |
| 1.0.42 权威生产基线/祖先 | `e905eaf2c9856db7f1f95ffb61b67cd0feb7ad5f` |
| 真实父链 | `35ab574^=e905eaf`；`6c2df96^=2b29b64`；`e905eaf → 35ab574 → a47eb33 → 7d61726 → 2b29b64 → 6c2df96 → 2ecd5ad → 本次 docs-only tip` |
| 分支 | `codex/1.0.43-large-save-hotfix-dev` |
| 版本 | 香港 Web `1.0.43+fceca3eda51c`；香港 API/上海/Android/Windows stable 保持 1.0.42 |
| 状态 | 香港 Web-only stable 已发布；generation 13 current 1.0.43 / previous 1.0.42；生产冻结 |

## 来源与验收条件

玩家反馈：1.0.42 导入超大存档、进入游戏、保存和返回主页均明显卡顿。只读附件为 `C:\Users\WINDOWS\Downloads\dsp-idle-save-2026-08-14.json`，36,704,109 bytes、v46/v2、27,153 entities、48,917 belts；SHA-256 `cd2356ea2b9a90a47cfa32ed9533e7056bfc4202f6af777fc4f3b98faa9a81b1`。

验收条件：

- 导入/云恢复的完整检查不阻塞 UI；请求竞态不能让旧结果覆盖新选择。
- v46 迁移为 O(E+B)，真实附件检查 `<5,000 ms`。
- entity/belt 顺序、退款、material hub、black-hole port、mode/inventory/checksum/data 语义保持。
- previous backup 完整性、IndexedDB exact read-back、revision/lease/fencing 均不弱化。
- 立即保存一次提交；稳定返回一次提交；保存期间状态推进时不得漏进度。
- GameState v46、envelope v2、cloud v7、SQLite layout v2 与 IndexedDB records 不升级。

上述持久化与迁移条件均由专项自动化和正式附件生产旅程满足；完整证据见 [1.0.43 候选记录](./releases/1.0.43-candidate.md) 与 [正式发布记录](./releases/1.0.43.md)。这不等于超大工厂主动模拟已流畅：正式旅程 Continue→Pause 仍为 20,887 ms，Long Task 峰值 20,291 ms，必须进入 1.0.44 P0。

## 关键修改

| 范围 | 文件 |
| --- | --- |
| 线性迁移、checksum/backup proof | `src/game/storage.ts`, `src/game/storage.test.ts`, `src/game/largeSaveHotfix.test.ts` |
| 后台检查 | `src/game/saveInspection.ts`, `src/game/saveInspection.worker.ts` |
| 导入、云恢复、单次保存与返回 | `src/App.tsx`, `src/components/StartMenu.tsx` |
| revision/backup 浏览器回归 | `tests/e2e/game-flow.spec.ts`, `tests/e2e/v143-large-save-hotfix.spec.ts` |
| 设置权威重载与公告布局 | `src/game/storage.ts`, `src/game/storage.test.ts`, `tests/e2e/v32-buffer-settings.spec.ts`, `tests/e2e/v142-ui-review.spec.ts` |
| 版本与公告 | `package.json`, `package-lock.json`, `android/native-version.properties`, `src/i18n/releaseNotes.ts`, `src/components/ReleaseNotesDialog.tsx` |
| 架构与门禁 | `docs/PROJECT_STATUS.md`, `docs/ARCHITECTURE.md`, `docs/TESTING_RELEASE.md` |

运行时/测试树 `6c2df9686031` 相对 1.0.42 权威生产基线 `e905eaf2c985` 为 63 files、`+1,169/-174`。玩家附件位于仓库外，未进入 Git；`savePreview.ts` 相对基线无改动。

## 已执行门禁

- typecheck；完整 Vitest 1,238/18；server 356/2；native 24/24；licenses 125。
- 本地 Chromium 聚焦 6/6，覆盖 manual revision/true backup、import Worker、current release/version、稳定 double-click return 和 in-flight simulation cleanup。
- 独立 coordination/recovery 浏览器 19/19；正式附件浏览器旅程的导入/进入/保存/返回持久化链通过，并明确记录运行态 20.887 秒卡顿残余。
- 发布公告返修单测 5/5、focused Chromium 1/1：当前 v143 四项、v142 历史十项、返回当前及菜单/游戏内两个设置重开入口均通过。
- 第二轮返修：相关 storage/mode/preview/coordination/store/release-note Vitest 129/129、typecheck、`v142-ui-review` + `v32-buffer-settings` 联合 Chromium 2/2；后者证明 IndexedDB backend/cache 逐字一致、manual revision +1、backup 为真旧 primary、DEV mirror 不作权威、pagehide 急救镜像生成/清理以及重载后 1 亿增产剂上限保留。
- Release Agent 在 clean `2ecd5ad1a64d`（与 final docs-only tip 相同 runtime/test tree）运行完整 Chromium：364 total，356 passed / 8 explicit env-gated skipped / 0 failed，1,039.2 s；`.last-run.json` 为 passed。
- final clean `fceca3e` production build 通过：1,929 modules，startup gzip 185,923 B，forbidden startup modules 0，Build ID 无 `.dirty`；独立 save-inspection worker 与 client 引用存在。`35ab574`/a47 旧候选保持作废。
- 玩家附件前后 bytes/SHA-256 不变；exact/gameplay differential hash 不变。

## Release Agent 执行结果

1. 从 clean `fceca3e` 生成全新不可变 `1.0.43-fceca3eda51c` 候选；source/Web 归档、122 文件 Web manifest、candidate metadata 与 SHA256SUMS 经开发、Release Agent、Audit 独立复算。旧 `1.0.43-a47eb33d0b84` 未覆盖、未上传、未部署。
2. production-preview PWA/version/current-v143/history-v142 与 compiled black-box 通过；首次误将 DEV-only `/src` 内省用例用于 preview 的失败已保留为 harness-incompatible 诊断，未掩盖或弱化测试。
3. 香港未激活 Web 目录完成 server-local 哈希/HTTP 验证。generation 9→10 因物理绑定出口的单次 TLS 前超时安全回滚；同一制品随后经 server-local、正常公网、Chrome 和 1.0.42 同尺寸 control 证明无误。generation 11→12 因探针错误要求 manifest 为 `application/manifest+json` 再次安全回滚；线上 1.0.42 与候选实际均为精确 `application/octet-stream` 继承契约。
4. 第三次显式 Web-only 切换于 `2026-08-14T15:24:14Z` 完成 generation 13：current `web-1.0.43-fceca3eda51c`、previous `web-1.0.42-c24e6247d257`；API 继续 1.0.42，PID/`NRestarts=0`、proxy、pending、health/ready 均不变。
5. normal public、physical controls、fresh Chrome h2+gzip、3 个 PWA context、正式附件临时 profile 与约 1 小时 47 分观察均完成。严格本地 API shim、unique-UA Nginx 窗口和隐私扫描证明没有真实账号/云/telemetry/玩家数据写入或附件副本。
6. 上海、Android/Electron/Windows、下载页、API、数据库和 Nginx 配置均未更改；原生正式版本继续是 1.0.42。

## 风险与回滚

最高优先级残余是超大工厂主动模拟：正式附件 Continue→Pause 为 20,887 ms，Long Task 峰值 20,291 ms；玩家独立反馈运行接近不可玩。1.0.43 只修复迁移/导入初次进入、manual save 与 return 的重复持久化链，不得描述为解决全部卡顿。可信写时主菜单 summary index 与运行态优化均进入 1.0.44 P0；1.0.43 保留完整 `JSON.parse` fallback 语义。实体 Android、低配 Windows、PWA/iOS standalone 和实体读屏器尚未验收。

当前 generation 13 下，只有只读复核仍为 current 1.0.43 / previous 1.0.42、API 1.0.42、pending 为空时，才可按已验证 evidence 执行 `--rollback-last`；预期下一 generation 恢复 current 1.0.42 / previous 1.0.43。状态漂移时必须停手重新审计。回滚只原子恢复完整 1.0.42 Web/PWA，不回滚数据库，不删除本地/云存档、备份、快照、冲突副本、revision 或排行榜历史。`manifest.webmanifest` 当前精确 MIME 是继承的 `application/octet-stream`，不是 `application/manifest+json`；后续需独立 Nginx 热修。完整步骤与证据见 [正式发布记录](./releases/1.0.43.md)。
