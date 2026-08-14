# DSPidle2 1.0.43 Release Agent 交接

## 任务

| 字段 | 内容 |
| --- | --- |
| Task ID | `DSPIDLE-1043-LARGE-SAVE-HOTFIX` |
| 标题 | 35 MiB 超大存档导入、载入、保存与返回主页热修 |
| 优先级 | P1；面向香港 1.0.43 hotfix 候选 |
| 运行时提交 | `6c2df9686031fa1db68b1d862f33364cbbae95a6`（含 `35ab5746baf3` 超大存档热修） |
| 发布测试契约返修 | `7d61726c1a1bae11a63ab2217d863a4cc7da7cbd` |
| 第二轮存档/发布门禁返修 | `6c2df9686031fa1db68b1d862f33364cbbae95a6` |
| 直接父级 | `e905eaf2c9856db7f1f95ffb61b67cd0feb7ad5f` |
| 分支 | `codex/1.0.43-large-save-hotfix-dev` |
| 版本 | package/app `1.0.43`；Android `1.0.43 / 1000043` |
| 状态 | 开发完成，未部署；Release Agent 未获本交接自动授权生产操作 |

## 来源与验收条件

玩家反馈：1.0.42 导入超大存档、进入游戏、保存和返回主页均明显卡顿。只读附件为 `C:\Users\WINDOWS\Downloads\dsp-idle-save-2026-08-14.json`，36,704,109 bytes、v46/v2、27,153 entities、48,917 belts；SHA-256 `cd2356ea2b9a90a47cfa32ed9533e7056bfc4202f6af777fc4f3b98faa9a81b1`。

验收条件：

- 导入/云恢复的完整检查不阻塞 UI；请求竞态不能让旧结果覆盖新选择。
- v46 迁移为 O(E+B)，真实附件检查 `<5,000 ms`。
- entity/belt 顺序、退款、material hub、black-hole port、mode/inventory/checksum/data 语义保持。
- previous backup 完整性、IndexedDB exact read-back、revision/lease/fencing 均不弱化。
- 立即保存一次提交；稳定返回一次提交；保存期间状态推进时不得漏进度。
- GameState v46、envelope v2、cloud v7、SQLite layout v2 与 IndexedDB records 不升级。

上述条件均由专项自动化满足；完整证据见 [1.0.43 候选记录](./releases/1.0.43-candidate.md)。

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

运行时提交相对父级为 63 files、`+1,169/-174`。玩家附件位于仓库外，未进入 Git；`savePreview.ts` 相对父级无改动。

## 已执行门禁

- typecheck；完整 Vitest 1,238/18；server 356/2；native 24/24；licenses 125。
- 本地 Chromium 聚焦 6/6，覆盖 manual revision/true backup、import Worker、current release/version、稳定 double-click return 和 in-flight simulation cleanup。
- 独立 coordination/recovery 浏览器 19/19；真实附件浏览器旅程通过。
- 发布公告返修单测 5/5、focused Chromium 1/1：当前 v143 四项、v142 历史十项、返回当前及菜单/游戏内两个设置重开入口均通过。
- 第二轮返修：相关 storage/mode/preview/coordination/store/release-note Vitest 129/129、typecheck、`v142-ui-review` + `v32-buffer-settings` 联合 Chromium 2/2；后者证明 IndexedDB backend/cache 逐字一致、manual revision +1、backup 为真旧 primary、DEV mirror 不作权威、pagehide 急救镜像生成/清理以及重载后 1 亿增产剂上限保留。
- `35ab5746baf3`/a47 的 production build/startup budget 通过，包含独立 save-inspection worker 且无循环 Worker chunk；该旧候选已作废，Release Agent 必须在新 final tip 重做 clean build。
- 玩家附件前后 bytes/SHA-256 不变；exact/gameplay differential hash 不变。

## Release Agent 后续强制步骤

1. 只从本分支最终 clean tip 构建；核对 `dist/version.json` 为 `1.0.43+<final-sha>` 且不得含 `.dirty`。
2. 复验外部 artifact manifest、Web/source 归档 SHA-256 和归档清单；不得复用任何旧 dirty `dist`。`D:\GameDev\DSPidle2-v143-release\1.0.43-a47eb33d0b84` 已因完整 Chromium No-Go 判定作废，禁止上传或部署；本轮 develop 不生成制品，只能在 Release Agent 全量通过后选择新 final SHA 命名的全新不可变候选。
3. 如面向香港灰度，先创建并验证备份、未激活目录与独立 health/readiness，再走既有原子切换和回滚门禁。
4. 如发布原生包，使用批准证书和正式 HTTPS 配置重新构建；开发工作树没有生成可发布签名包。
5. 在新不可变候选上独立重跑完整 Chromium 全量、production-preview PWA 和目标设备 35 MiB 导入/保存/返回旅程；当前 develop 交接不把完整 Chromium 记为通过，任何失败均为 No-Go。
6. 只有得到单独生产授权后才能 SSH、部署、切流或更新下载页。本开发任务未做这些操作。

## 风险与回滚

可信写时主菜单 summary index 延后至 1.0.44；1.0.43 保留完整 `JSON.parse` fallback 语义。实体 Android、低配 Windows、PWA/iOS standalone 和实体读屏器尚未验收。Windows 若后续构建仍必须明确 Authenticode 状态，不能沿用 1.0.42 文件名或哈希。

未部署时直接废弃候选。已灰度时原子恢复完整 1.0.42 Web/PWA，不回滚数据库，不删除本地/云存档、备份、快照、冲突副本、revision 或排行榜历史。由于本版无 schema migration，API/SQLite 不需要数据回滚。
