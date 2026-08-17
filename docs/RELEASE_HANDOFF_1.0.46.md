# 1.0.46 存档恢复热修开发交接

> 状态：本地开发候选，未发布；不授权线上切换。
> 分支：`codex/1.0.46-save-recovery`
> 基线：`codex/1.0.45-space-station`
> 版本：`1.0.46` / Android `1000046`

## Task ID / title

`DSPIDLE-1046-DURABLE-RECOVERY`：修复保存期间、暂停/恢复和 Worker 故障导致的 durable 存档阻断。

## Priority

P0。玩家可能停留在暂停状态，模拟 Worker 被错误标记不可用；T0/pending intent 必须优先保留，不能用清理日志或刷新绕过一致性。

## Source and attachments

- 用户反馈：暂停模拟后显示“durable 模拟 Worker 不可用，已暂停；刷新后从 recovery 精确恢复”。
- 用户设置语义：关闭“保存期间允许继续操作（实验性）”时，保存期间操作应被拒绝；开启时操作进入 durable 队列，失败可保留并导出。
- 附件截图：`C:\Users\WINDOWS\AppData\Local\Temp\codex-clipboard-4a1257b9-e87d-45a2-b802-8147696dac98.png`，显示“模拟 revision 与 durable recovery head 不一致，已阻止滚动基线”。

## Reproduction and fix evidence

1. 启动普通工厂并等待 `data-runtime-recovery=active`、模拟 Worker active。
2. 注入第一次 persistence Worker finalize 故障，然后暂停模拟。
3. 修复后页面读取 T0 recovery，Worker 回放 finalized/pending intent，验证 T1，替换 recovery head 并安装新模拟 Worker。
4. 页面保持暂停，点击“继续模拟”后 `data-simulation-paused=false` 且 Worker active；pending intent 已清理。
5. 对正在运行的模拟加速自动保存，并在 T1 后注入一次 recovery-head initialize 故障；页面重建 Worker 后保持 `data-simulation-paused=false`。
6. 验证修复成功后 `.save-emergency-warning` 不存在，避免纯挂机“保存与恢复”继续显示已处理的 transient 保存失败。
7. 连续三次加速自动保存时，recovery head 使用生成该检查点的 revision；保存窗口内若有较新的回执，重新取得权威检查点并验证新的 T1，模拟始终保持 `data-simulation-paused=false`。

已覆盖：

- `tests/e2e/v144-runtime-wal-integration.spec.ts`：6/6，覆盖 durable finalize failure 同页恢复、二次 persistence Worker failure、T1 已验证但 recovery-head 替换失败后的自动修复、运行中自动保存恢复、WAL/pagehide/undo/redo/viewport/activity。
- `src/game/*durable*`、startup recovery、UI preference focused Vitest 21/21。

## User-visible acceptance criteria

- finalize、recovery persistence 或模拟 Worker 单次失败不会要求玩家必须刷新；当前页可在安全暂停状态发起精确恢复。
- 恢复期间 T0、pending intent、纯挂机恢复日志和宏观进度不被删除；T1 未完成前不清理旧 recovery。
- 恢复完成后“继续模拟”可用；新 Worker 不继承旧实例的 disabled 状态。
- 自动保存前正在运行时，恢复 head 的验证修复完成后自动继续；手动保存的暂停意图保持不变。
- 已验证的替换 T1/recovery head 会清除旧 transient 保存失败提示，纯挂机恢复面板不再把已修复检查点显示为待处理。
- 默认保护模式仍拒绝保存期间编辑，但 revision/head 竞态不会显示阻断错误或把会话锁死。
- recovery head 的 revision 必须与其 T1 payload 的精确 Worker 检查点相同；后到回执必须生成新的 T1，不能仅提升 head revision。
- 实验性开关开启时，已接受操作保留在 durable 队列；保存失败时当前进度仍可继续或导出。
- 纯挂机终态仍要求主存档验证、Worker 接管、恢复日志提交全部完成后才清理日志。

## Compatibility and data preservation

- 保持 GameState v47、save envelope v2、cloud schema v8、SQLite layout v3、IndexedDB records 和空间站 M0-M5 语义。
- 不迁移、不重写玩家云存档，不访问生产数据库，不改变排行榜历史。
- 1.0.45 空间站候选作为历史代码基线保留；线上回退/发布由其他会话负责。

## Target platforms

Web/PWA、Chromium/Firefox/WebKit、Windows unpacked/desktop、Android WebView。当前开发会话只验证本地 Web 与可生成的诊断制品。

## Required tests

- `npm run typecheck`
- `npm run build:web`
- `npm test`
- `npm run test:server`
- `npm run test:ops`
- `npm run test:native`
- `npm run licenses:check`
- 空间站专项、`npm run test:e2e:fast`、全量 Chromium；可用时 Firefox/WebKit 与 production-preview PWA。
- `git diff --check`、版本一致性、release manifest/hash 检查。

## Release target and version

仅本地 `1.0.46` 开发候选；本交接不授权发布、下载页更新、生产切换或签名制品进入 stable。

## Known risks / rollback

- 超大真实存档 fixture 未提供时，真实大档纯挂机/保存性能只能报告跳过，不能宣称完成。
- Android 长期签名证书、Windows 签名环境未在本会话提供；unsigned 诊断 APK/AAB/EXE 不可作为稳定制品。
- 若发布前门禁失败，代码回退到本分支父级 1.0.45 候选；不要清理 T0/recovery，也不要回写线上数据。

## Development handoff

Commit SHA: the clean source SHA recorded by the immutable release manifest is authoritative. Do not infer it from a working-tree `dist` directory.

Changed files: `src/App.tsx`, `tests/e2e/v144-runtime-persistence-progress.spec.ts`, `tests/e2e/v144-runtime-wal-integration.spec.ts`, `docs/PROJECT_STATUS.md`, `docs/DEVELOPMENT_REPORT_1.0.46.md`, `docs/RELEASE_HANDOFF_1.0.46.md`.

Artifact paths: create and retain them from an isolated clean checkout: Web `dist/`, expanded API directory from `node deploy/prepare-api-release.mjs --output <empty-directory>`, plus manifest/SBOM/provenance. Signed native artifacts are intentionally absent.

Manifest and aggregate hash: create only after `npm run build:web` in a clean checkout, then verify with `npm run release:verify -- <manifest.json>`. A native-platform or dirty Web build is not a valid release candidate.

Tests with exact counts:

- `npm run typecheck`: passed
- `npm test -- --maxWorkers=1`: 1,406 passed / 20 skipped (168 files passed, 7 skipped)
- `npm run test:server`: 357 passed / 2 skipped; station profile 3/3
- `npm run test:ops`: 56 passed / 6 Linux-only skipped
- `npm run release:test-switch`: 29/29 passed
- `npm run test:native`: 24/24 passed
- `node --test scripts/generate-synthetic-save-fixtures.test.mjs scripts/release-gate.test.mjs`: 12/12 passed; v47/space-station fixture contracts
- `npm run licenses:check`: 125 runtime packages consistent
- `npm audit --audit-level=high` and `npm --prefix server audit --audit-level=high`: 0 vulnerabilities
- `npm run build:web`: 1,959 modules; startup/menu gzip budgets passed
- `npm run test:e2e -- --workers=4`: Chromium 408 passed / 14 skipped / 0 failed
- production-preview performance set: 19/19 passed (serial worker gate)
- production-preview PWA: 1/1 passed
- Firefox/WebKit compatibility: 2/2 passed

Release-process hardening:

- `package.json` provides `npm run build:web`, which forces `VITE_APP_PLATFORM=web`.
- `.github/workflows/release-gate.yml` uses that command and runs the production-preview PWA lifecycle test after the Web build. Do not reuse a `dist` directory produced by `build:desktop` or `build:android`.

Unverified gaps: Android/Windows signed artifacts and physical-device gates, real large-save fixture (the optional fixture remains skipped), production deployment/rollback checks, and public download-page update.
