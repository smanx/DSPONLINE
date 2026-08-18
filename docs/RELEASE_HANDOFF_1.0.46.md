# 1.0.46 存档稳定性、手机连续拉线与画布展示开发交接

> 状态：发布前开发门禁完成，未发布；不授权线上切换、正式签名或下载页更新。
>
> 分支：`codex/1.0.46-save-recovery`
>
> 版本：Web/Desktop `1.0.46`；Android `1000046`
>
> 默认保存协调器：1.0.43-compatible verified-primary；durable WAL 仅显式开发启用。

## Task ID / title

`DSPIDLE-1046-SAVE-STABILITY-MOBILE-BATCH-CANVAS`：修复自动保存暂停模拟、暂停后 Worker 无法恢复、纯挂机保存状态污染，重构手机连续拉线 UI、重复点击状态机与大候选列表稳定性，并把画布卡片、重叠处理和交互展开拆成独立的本机偏好。

## Priority

P0 存档/模拟稳定性 + P1 手机交互。任何修复都必须保留玩家状态、原子扣料、纯挂机恢复日志与导出边界。

## Source and attachments

- 玩家多次复现：自动保存完成或保存期间拉线后模拟自动暂停；继续模拟显示“durable 模拟 Worker 不可用，已暂停；刷新后从 recovery 精确恢复”。
- 保存设置合同：默认关闭“保存期间允许继续操作”时拒绝保存窗口内操作；开启时已接受操作保留，失败不回滚且可立即导出。
- 手机玩家反馈：连续拉线时桌面面板与底部条同时出现、遮挡地图；超过 5 条后曾显示“页面模块未能载入”，重复点击会阻断整批确认。
- 画布反馈：自动档同时出现完整卡、中等卡、一行卡和完全隐藏的重叠组，玩家无法分别控制基础卡片、重叠建筑和交互展开；重叠位置至少必须留下可识别数量入口。
- 两份本地只读玩家存档：
  - `dsp-idle-save-2026-08-14.json`：36,704,109 bytes，SHA-256 `cd2356ea2b9a90a47cfa32ed9533e7056bfc4202f6af777fc4f3b98faa9a81b1`
  - `dsp-idle-local-backup-2026-08-17 (1).json`：11,723,913 bytes，SHA-256 `f832f7fb909bad1981cd8476f28dcf0f1026c62955d822904218cee270a43d2a`

附件正文和截图不得进入 Git、制品、日志或发布交接包。

## Reproduction or observed evidence

### 默认玩家路径

1. 普通 Web 构建不设置 `VITE_DURABLE_RUNTIME_RECOVERY`。
2. 导入玩家存档，确认模拟 Worker active，并确保 `data-simulation-paused=false`。
3. 触发真实 30 秒自动保存处理器两次，串行等待 authoritative checkpoint、主档写入与读回。
4. 两份档的两次保存均保持 Worker active、`paused=false`，期间没有 `paused=true`/fallback 属性变化。
5. 刷新回菜单后，primary 完整检查有效，模式、实体数、线路数保持，持久 `paused=false`。
6. 两份源文件 bytes、mtime 和 SHA-256 前后未变化。

实测保存耗时：

| 玩家档 | 第一次 | 第二次 |
| --- | ---: | ---: |
| 36,704,109 bytes | 约 3,783 ms | 约 3,137 ms |
| 11,723,913 bytes | 约 1,169 ms | 约 1,151 ms |

### durable 显式开发路径

1. 设置 `VITE_DURABLE_RUNTIME_RECOVERY=true`。
2. 分别注入 finalize、第二次 persistence Worker、T1 后 recovery-head initialize 和 primary commit quota 故障。
3. T0 与 pending intent 保留；T1 revision 绑定生成该 payload 的权威 Worker 回执。
4. 新 Worker 清除旧 disabled latch；运行中自动保存恢复为运行态，玩家主动暂停可在同页继续。
5. 实验性编辑模式保存失败时，已接受进度、WAL 和立即导出能力都保留。

### 手机连续拉线

1. next-mobile shell 进入连续模式时，React 树中桌面 `.batch-connection-panel` 数量为 0，只有底部操作面。
2. 390×844、360×640、844×390 下默认收起不遮挡中部画布，可展开、收起并继续选择地图端口。
3. 重复或本次非法点击不增加候选、不扣料、不设置阻塞失败；此前有效候选仍可确认。
4. 6、10、50、100 条候选完整可滚动，最新优先；任意条可定位或移除，撤销仅删除最近一条。
5. 最终原子复核失败按候选定位原因，并保持线路、库存和持久状态完全不变。

## User-visible acceptance criteria

- 自动保存不再自动暂停正在运行的模拟；手动暂停意图不被自动开启。
- 暂停/继续不会因旧 Worker disabled 状态永久卡死。
- 默认保护模式拒绝保存期间编辑但不暂停模拟；实验模式保留已接受操作，失败可继续和导出。
- 纯挂机恢复日志、宏观进度和主档验证正常时不再显示已过期“保存与恢复”警告。
- next-mobile shell 同时只存在一个连续拉线操作面，底栏无 backdrop、不阻断地图。
- 重复、已有线路、不兼容或缺料点击不污染有效候选；最终领域事务仍严格原子。
- 6/10/50/100 候选无 pageerror、runtime fatal 或 dynamic-import 误报。
- 普通运行时异常与真实 chunk/module 加载故障使用不同的脱敏错误界面。
- 基础卡片提供自动、完整、中等、一行；只有自动档由可见节点数和迟滞切换。
- 重叠建筑提供数量标记、代表卡片、全部卡片；默认数量标记始终留下 `88×44` 点击区和约 `80×30` 的“层叠图标 + 数量”可见胶囊，低缩放手机画面仍可触控，点击后可选择真实建筑。
- 交互展开独立提供仅选中、悬停也展开、保持基础；拖动、采矿和连线安全目标不受关闭限制。
- React Flow 变换层不再使用会裁空世界坐标子节点的 paint containment；一行卡及 wrapper 固定 `96×32`，各档裁剪与线路端点统一使用当前展示尺寸。
- fully-deferred 空白视角保留四个 Fit View 边界锚点；标准 SVG MiniMap 与低频 CanvasMiniMap 均可点击恢复到建筑区。

## Compatibility and data-preservation constraints

- 保持 GameState v47、save envelope v2、cloud schema v8、SQLite layout v3 和 IndexedDB records 格式。
- 连续拉线候选只存在于 React UI 状态，不新增存档、云同步或迁移字段。
- 画布三个偏好只写 `dsp-idle-network.ui.canvas-detail.v1`、`dsp-idle-network.ui.canvas-overlap.v1`、`dsp-idle-network.ui.canvas-interaction-detail.v1`，不进入 GameState、云 payload、迁移或状态哈希。
- 保持 10/50/100 条原子提交、材料扣除、端口校验、顺序与确定性逻辑。
- 保持桌面连续拉线面板及 Ctrl/Shift、Enter、Escape 行为。
- 不清理或重写玩家浏览器存档，不上传附件，不访问生产数据库。

## Target platforms

Web/PWA 为本地已验证目标；Chromium、Firefox、WebKit 已跑浏览器门禁。Windows/Android 完成共享代码、静态工具与未签名诊断构建；正式签名、证书连续性和实体设备仍属于 release agent 门禁。

## Required tests and exact results

以下结果均来自保存、连续拉线和画布增量合并后的当前 1.0.46 tip：

- `npm ci`：456 packages；安装成功。
- `npm run typecheck`：passed。
- `npm test -- --maxWorkers=1`：171 files passed / 7 conditional skipped；1,421 passed / 20 skipped / 0 failed。
- `npm run test:server`：server 363 passed / 2 skipped；station 3/3。
- `npm run test:ops`：56 passed / 6 Linux-only skipped。
- `npm run release:test-switch`：29/29。
- `npm run test:native`：24/24。
- `npm run licenses:check`：125 runtime packages consistent。
- root/server `npm audit`：0 vulnerabilities。
- `npm run test:e2e:durable -- --workers=1`：7/7。
- `npm run test:e2e -- --project=chromium --workers=4`：418 passed / 23 explicit conditional skips / 0 failed（441 total）。
- `npm run test:e2e:nightly -- --workers=1`：Firefox/WebKit 2/2。
- production preview PWA + connection viewport + canvas：22/22；自动档三轮无 >50 ms 帧；性能用例另行连续重复 3/3。
- 两份真实玩家档 autosave + canvas 核心：4/4；每份各完成 17 张设置/横竖屏矩阵，pageerror 0，源 bytes、mtime、SHA-256 未变。
- 手机矩阵：390×844、360×640、844×390；80/100/125/150/200% 字体；数量标记、连续拉线和三组设置无阻断。
- 匿名 v47 fixture / release-gate contracts：12/12。
- `npm run build:web`：1,961 modules；startup 194,838 B gzip；menu 280,997 B gzip；forbidden startup modules 0。

开发 E2E 的 `/api` 代理故意指向 `127.0.0.1:65534`，其 `ECONNREFUSED` 是线上 API 隔离证据。偶发 `ResizeObserver loop completed with undelivered notifications` 目前是开发服务器非阻断诊断，不应被吞错逻辑掩盖。

## Release target and version

开发目标是形成可由 release agent 独立复验的 `1.0.46` 固定源码和候选制品。本交接不授权香港、上海、下载页、Android、Windows 或任何 stable channel 发布。

## Known risks / rollback

- stable 构建不得设置 `VITE_DURABLE_RUNTIME_RECOVERY=true`；durable 再次成为默认前需要重新资格审查。
- `FactoryRuntime` 和主 CSS 仍有大 chunk 警告，属于后续拆分目标，不影响当前 startup/menu 预算。
- Android/Windows 正式签名与实体设备、Linux systemd/Nginx、备份、生产健康、公开 PWA 与下载页门禁均未执行。
- 当前香港线上回退/版本由其他任务负责；development 任务不得改生产或替换线上 rollback pointer。
- 固定完整与连接“展开全部”在 500 个同时可见重卡压力场景仍可能出现秒级长帧；自动档已通过当前门禁，发布说明不得把高成本固定档描述成自动性能结论。

## Development handoff

Commit SHA: **unavailable**。当前仍是等待用户真人验收的工作树，不能把未提交或 dirty tree 当作可发布 SHA。

Changed files:

- 默认/实验保存选择与运行时：`src/game/runtimePersistenceMode.ts`、`src/App.tsx`、`src/FactoryRuntime.tsx`
- authoritative persistence/serialization/Worker/protocol：`src/game/authoritativeSave*`、`simulationRuntimeProtocol*`、`simulation.worker.ts`、`localSaveStore.ts`、`storage.ts`
- 纯挂机/离线/投影：`pureIdleMacro*`、`pureIdleRecovery.ts`、`offlineSimulation*`、`simulationProjection*`
- 手机连续拉线与错误边界：`src/App.tsx`、`src/styles.css`、`src/styles/mobile-factory.css`、`DynamicImportRecovery.tsx`、`dynamicImportRecovery.ts`
- 画布三组偏好与重叠标记：`canvasDensityPresentation*`、`uiPreferences*`、`FactoryNodes.tsx`、`OperationsWorkspace.tsx`、`src/App.tsx`、`src/styles.css`、`v144-canvas-density-stack.spec.ts`
- 服务端原子性审计：`server/cloud-payload-store.mjs`、`server/cloud-payload-recovery.mjs`、`server/index.mjs` 及其测试
- 回归：`tests/e2e/v144-*.spec.ts`、`v146-real-save-autosave.spec.ts`、`v127-selection-batch.spec.ts`、纯挂机/菜单/画布相关 E2E 与 focused Vitest
- 版本与规范：`package.json`、`src/i18n/releaseNotes.ts`、本报告及 canonical docs

发布 agent 必须从最终提交的 `git diff --name-only <baseline>...<sha>` 取得完整清单，不能把上述分组当作 manifest。

Artifact paths: **none**。当前 `dist/` 是本地验证输出，不是不可变发布制品；没有生成 APK、AAB、EXE、release archive、SBOM 或 provenance。

Manifest and aggregate hash: **unknown / intentionally not generated**。需等待真人验收、干净提交和明确制品授权。

Unverified gaps: 生产目标与授权、不可变 commit/manifest、签名原生制品、实体设备、真实 Linux/备份/切换、公开 smoke、下载页更新和观察窗口。

## 给 release agent 的下一跳

只有用户明确批准发布后才能继续：

1. 从 development 最终干净 SHA 建立隔离 checkout，并复核本交接的版本、默认环境与完整测试结果。
2. 执行 `npm ci`、`npm run build:web`、production-preview PWA、完整 release gate；不得复用本工作区 `dist/`。
3. 生成并独立验证 source/Web/API manifest、aggregate SHA-256、SBOM 与 provenance。
4. 若包含 API，先在临时 SQLite 和展开后的发布目录启动验证；生产写入前取得并验证备份 evidence。
5. 证书、签名、目标节点、previous-stable pointer、回滚命令或健康门禁任一缺失即停止，不得绕过。
