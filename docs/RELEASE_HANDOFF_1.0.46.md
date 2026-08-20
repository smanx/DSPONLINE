# 1.0.46 存档稳定性、手机连续拉线与画布展示开发交接

> 状态：发布前开发门禁完成，未发布；不授权线上切换、正式签名或下载页更新。
>
> 分支：`codex/1.0.46-save-recovery`
>
> 版本：Web/Desktop `1.0.46`；Android `1000046`
>
> 默认保存协调器：1.0.43-compatible verified-primary；durable WAL 仅显式开发启用。

## Task ID / title

`DSPIDLE-1046-SAVE-STABILITY-MOBILE-BATCH-CANVAS-STATION`：修复自动保存暂停模拟、暂停后 Worker 无法恢复、纯挂机保存状态污染，重构手机连续拉线 UI、重复点击状态机与大候选列表稳定性，并把画布卡片、重叠处理和交互展开拆成独立的本机偏好；最终增量修复密集画布的半透明、悬停消失、拖动卡死、极端完整卡过载，以及空间站往返后工厂画布失去拖动、框选、拉线和正确坐标的问题。

## Priority

P0 存档/模拟稳定性 + P1 手机交互。任何修复都必须保留玩家状态、原子扣料、纯挂机恢复日志与导出边界。

## Source and attachments

- 玩家多次复现：自动保存完成或保存期间拉线后模拟自动暂停；继续模拟显示“durable 模拟 Worker 不可用，已暂停；刷新后从 recovery 精确恢复”。
- 保存设置合同：默认关闭“保存期间允许继续操作”时拒绝保存窗口内操作；开启时已接受操作保留，失败不回滚且可立即导出。
- 手机玩家反馈：连续拉线时桌面面板与底部条同时出现、遮挡地图；超过 5 条后曾显示“页面模块未能载入”，重复点击会阻断整批确认。
- 画布反馈：自动档同时出现完整卡、中等卡、一行卡和完全隐藏的重叠组，玩家无法分别控制基础卡片、重叠建筑和交互展开；重叠位置至少必须留下可识别数量入口。
- 画布二次反馈：检查线路网络后，非网络节点被降到极低透明度；选中或悬停展开仍继承 dim class，LOD 切换又缺少初始几何，表现为“悬停哪个哪个消失”。大量半透明节点同时保留 `draggable/nopan`，还会形成无法从卡片区域平移的画布死区。
- 画布最终阻断：导入大档并放置/拉线一段时间后，拖动画布或 React Flow 自动平移只更新了变换和线路层，虚拟节点窗口与 CanvasMiniMap 却等待 `onMoveEnd`；自动平移并不保证触发该回调，最终表现为视角外建筑不再挂载、小地图不动、建筑拖动/框选失效以及放置坐标看似错位。
- 一行卡反馈：密集模式应优先显示配方和产物，而不是大量相同的建筑名称。
- 空间站切换阻断：工厂位于 `ReactFlowProvider` 下，空间站曾直接挂载第二棵 `ReactFlow` 并复用同一 store；空间站 StoreUpdater 覆盖工厂节点/视口，卸载清理又重置共享 store，因此返回工厂后画布交互整体失效。空间站现使用自己的嵌套 provider 和固定 flow id，与工厂状态完全隔离。
- 生产预览直达阻断：Web 构建曾使用相对 `./assets`，浏览器直达 `/station/<id>` 时会请求 `/station/assets/*` 并白屏。Web 现固定根路径 `/`，Desktop/Android 继续使用相对路径；manifest 同样通过 `%BASE_URL%` 按平台生成。
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
| 36,704,109 bytes | 约 6,441 ms | 约 4,943 ms |
| 11,723,913 bytes | 约 1,087 ms | 约 835 ms |

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
- 选中、悬停、聚焦、拖动和连线安全目标使用高于重叠 halo 与普通邻居的交互层级；展开卡通过 `elementFromPoint()` 屏幕命中回归确认不会再被遮挡后看似消失。
- 线路/任务/生产链检查只淡化上下文节点；当前选中、悬停或其他交互目标保持不透明。上下文节点不再创建 `nopan` 死区，点击建筑或空白画布会退出临时线路聚焦。
- 一行生产卡优先显示“配方 · 产物”，例如“金伯利矿提炼 · 金刚石”；没有配方/产物的特殊建筑可靠回退到建筑名称。
- “完整 + 全部卡片”在视口节点超过 480/1,000 时统一降到中等/一行基础卡并标明“密集保护”；被选中或悬停的单卡仍完整展开，避免数千重卡让页面失去响应。
- 拖动、滚轮缩放和 React Flow 自动平移期间会实时发布带 overscan 的虚拟视口，并在 pointer 仍按下时更新小地图；手势结束强制发布最终精确视口。拖动建筑穿过旧窗口、框选、选中展开和移动后放置坐标均以同一实时 transform 为准。
- 空间站与工厂各持有独立 React Flow store。反复切换、空间站缩放或直接打开 `/station/<id>` 后返回工厂，原工厂视口不被覆盖，建筑拖动、反向框选、拉线、放置坐标和小地图仍可用。

## Compatibility and data-preservation constraints

- 保持 GameState v47、save envelope v2、cloud schema v8、SQLite layout v3 和 IndexedDB records 格式。
- 连续拉线候选只存在于 React UI 状态，不新增存档、云同步或迁移字段。
- 画布三个偏好只写 `dsp-idle-network.ui.canvas-detail.v1`、`dsp-idle-network.ui.canvas-overlap.v1`、`dsp-idle-network.ui.canvas-interaction-detail.v1`，不进入 GameState、云 payload、迁移或状态哈希。
- 保持 10/50/100 条原子提交、材料扣除、端口校验、顺序与确定性逻辑。
- 保持桌面连续拉线面板及 Ctrl/Shift、Enter、Escape 行为。
- 不清理或重写玩家浏览器存档，不上传附件，不访问生产数据库。

## Target platforms

Web/PWA 为本地已验证目标；Chromium、Firefox、WebKit 已跑浏览器门禁。Windows unpacked 诊断包已完成 4 进程隔离启动并确认为 `NotSigned`；Android unsigned APK/AAB 已完成 bundle、assemble 与 lintVital，版本为 `1.0.46 / 1000046`。正式签名、证书连续性和实体设备仍属于 release agent 门禁。

## Required tests and exact results

以下结果均来自保存、连续拉线、最终画布交互与空间站隔离增量合并后的固定运行时候选 `865f125e862487aedf7d7df08491867881b2b65b`：

- `npm ci`：456 packages；安装成功。
- `npm run typecheck`：passed。
- `npm test -- --maxWorkers=1`：171 files passed / 7 conditional skipped；1,423 passed / 20 skipped / 0 failed。
- `npm run test:server`：server 363 passed / 2 skipped；station 3/3。
- `npm run test:ops`：56 passed / 6 Linux-only skipped。
- `npm run release:test-switch`：29/29。
- `npm run test:native`：24/24。
- `npm run licenses:check`：125 runtime packages consistent。
- root/server `npm audit`：0 vulnerabilities。
- `npm run test:e2e:durable -- --workers=1`：7/7。
- `npx playwright test --project=chromium --workers=2`：最终固定候选 425 passed / 26 explicit conditional skips / 0 failed（451 total；10.8 分钟）。
- 空间站专项：开发服务器 6/6、生产预览 6/6；空间站关联 Chromium 合并门禁 11/11；Firefox + WebKit 12/12。8 次往返并在每轮缩放空间站后，工厂 viewport 保持，随后建筑拖动、反向框选两节点、拉线和放置坐标均通过，pageerror 与 React Flow warning 为 0。
- production preview 功能门禁 27/27；PWA 3/3。自动档性能测试在独立浏览器进程连续 3/3，通过时九次手势 P95 为 7.0～20.9 ms、max 27.8 ms、0 个 >50 ms 或 >100 ms 帧；连接 bounded entry 9.8 ms、P95 13.8 ms、max 27.9 ms。显式展开全部仍测得 max 约 111.4 ms、2 帧 >50 ms，属于已警示 override。
- 两份真实玩家档 autosave + canvas 核心、选中/悬停、实时虚拟化平移与空间站往返专项全部通过；每份各完成 19 张设置/横竖屏截图。两份空间站档均有 6 个模块，返回工厂后 viewport、平移、选择、绘制和拖动正常，pageerror 0；源 bytes、mtime、SHA-256 未变。
- 手机矩阵：390×844、360×640、844×390；80/100/125/150/200% 字体；数量标记、连续拉线和三组设置无阻断。
- 匿名 v47 fixture / release-gate contracts：12/12。
- `npm run build:web`：1,961 modules；startup 194,820 B gzip（JS 101,833 B、CSS 92,987 B、最大 JS 58,974 B）；menu 281,377 B gzip；forbidden startup modules 0；Build ID `1.0.46+865f125e8624`。生产预览直达空间站及其 `/assets/*`、`/manifest.webmanifest` 均返回 200。
- API 展开候选：临时 SQLite health 200；cloud schema/layout 8/3；归档 SHA-256 已纳入候选清单。
- Windows unsigned unpacked：`1.0.46 / 1.0.46.0`，ASAR Build ID 正确，4 个进程 smoke 均 responding，Authenticode `NotSigned`。
- Android unsigned：APK/AAB、bundle/assemble/lintVital 通过；`1.0.46 / 1000046`。首轮因当前 shell 未设置 SDK 环境停止，发现本机既有 SDK 后仅对重试命令注入 `ANDROID_HOME`/`ANDROID_SDK_ROOT` 并成功；没有创建或提交本机 `local.properties`。

开发 E2E 的 `/api` 代理故意指向 `127.0.0.1:65534`，其 `ECONNREFUSED` 是线上 API 隔离证据。偶发 `ResizeObserver loop completed with undelivered notifications` 目前是开发服务器非阻断诊断，不应被吞错逻辑掩盖。

## Release target and version

开发目标已形成可由 release agent 独立复验的 `1.0.46-865f125e8624` 固定源码和候选制品。旧 `1.0.46-c24a0f57efeb` 包已被本候选取代，不得发布。本交接不授权香港、上海、下载页、Android、Windows 或任何 stable channel 发布。

## Known risks / rollback

- stable 构建不得设置 `VITE_DURABLE_RUNTIME_RECOVERY=true`；durable 再次成为默认前需要重新资格审查。
- `FactoryRuntime` 和主 CSS 仍有大 chunk 警告，属于后续拆分目标，不影响当前 startup/menu 预算。
- Android/Windows 正式签名与实体设备、Linux systemd/Nginx、备份、生产健康、公开 PWA 与下载页门禁均未执行。
- 当前香港线上回退/版本由其他任务负责；development 任务不得改生产或替换线上 rollback pointer。
- 合成 506 个重卡的固定“完整”/显式“展开全部”诊断仍可出现数百毫秒到约 1.9 秒的帧；组合功能进程中的展开全部也观察到 max 111.3 ms、2 帧 >50 ms。这是玩家明确选择高细节或诊断 override 的残余成本；自动档独立三轮为绿色，“完整 + 全部卡片”另有 480/1,000 密集保护，发布说明不得混淆三者。

## Development handoff

Runtime / candidate Commit SHA: **`865f125e862487aedf7d7df08491867881b2b65b`**。Build ID：**`1.0.46+865f125e8624`**。候选来自干净固定 checkout，source gate 记录为 clean；之后的交接文档提交不改变运行时候选 SHA。

Changed files:

- 默认/实验保存选择与运行时：`src/game/runtimePersistenceMode.ts`、`src/App.tsx`、`src/FactoryRuntime.tsx`
- authoritative persistence/serialization/Worker/protocol：`src/game/authoritativeSave*`、`simulationRuntimeProtocol*`、`simulation.worker.ts`、`localSaveStore.ts`、`storage.ts`
- 纯挂机/离线/投影：`pureIdleMacro*`、`pureIdleRecovery.ts`、`offlineSimulation*`、`simulationProjection*`
- 手机连续拉线与错误边界：`src/App.tsx`、`src/styles.css`、`src/styles/mobile-factory.css`、`DynamicImportRecovery.tsx`、`dynamicImportRecovery.ts`
- 画布三组偏好与重叠标记：`canvasDensityPresentation*`、`uiPreferences*`、`FactoryNodes.tsx`、`OperationsWorkspace.tsx`、`src/App.tsx`、`src/styles.css`、`v144-canvas-density-stack.spec.ts`
- 实时虚拟化与小地图：`src/App.tsx`、`src/components/CanvasMiniMap.tsx` 及视口/拖动/框选/放置/性能/PWA Playwright 回归
- 空间站隔离与 Web 直达：`src/components/StationCanvasRenderer.tsx`、`vite.config.ts`、`index.html`、`src/versionMetadata.test.ts`、`tests/e2e/orbital-station.spec.ts`、`tests/e2e/v146-real-save-canvas-density.spec.ts`
- 服务端原子性审计：`server/cloud-payload-store.mjs`、`server/cloud-payload-recovery.mjs`、`server/index.mjs` 及其测试
- 回归：`tests/e2e/v144-*.spec.ts`、`v146-real-save-autosave.spec.ts`、`v127-selection-batch.spec.ts`、纯挂机/菜单/画布相关 E2E 与 focused Vitest
- 版本与规范：`package.json`、`src/i18n/releaseNotes.ts`、本报告及 canonical docs

发布 agent 必须从最终提交的 `git diff --name-only <baseline>...<sha>` 取得完整清单，不能把上述分组当作 manifest。

Artifact root：`D:\GameDev\DSPidle2\artifacts\release-bundle\1.0.46-865f125e8624`。其中 10 个文件已经 candidate manifest 独立复验，总计 170,165,264 bytes。辅助元数据位于：

- `artifacts/release-manifests/1.0.46-865f125e8624.json`：Web `dist` + API source manifest，251/251，aggregate `add763de2864d6a98cf57e417da90bb9aada9d5ba6b682236671d2f003c89f59`。
- `artifacts/release-manifests/1.0.46-865f125e8624-candidate.json`：bundle 10/10，aggregate `c8a5d5f5e7fc7b806c05f47affbce4d428af6daa1ec714d9bdff89a3ac8f295d`。
- `artifacts/release-manifests/1.0.46-865f125e8624-provenance.json`：3/3 subjects verified against runtime SHA。
- `artifacts/release-manifests/1.0.46-865f125e8624-SHA256SUMS.txt`：12 个交接文件逐项 SHA-256，已复算 12/12。
- `artifacts/release-gate/1.0.46-865f125e8624-{source-gate,sbom.cdx,gate-report}.json`：clean source、CycloneDX SBOM 与含 19 条条件跳过声明的脱敏门禁报告。

| 制品 | 字节 | SHA-256 |
| --- | ---: | --- |
| source archive | 6,722,785 | `3c6367b7f33c6462f07df11df19cc6e63457b72cabd4e7b27c950d9070888360` |
| Web archive | 1,736,926 | `fb3f5274b7b684432a6249b353e882c3964e3a2240dd358d790c29a9a6b475d6` |
| API archive | 668,728 | `8ead606d88ed38c1b9a4beb9356dfef134deb921668132e046be73326262e1df` |
| Windows unpacked unsigned diagnostic | 150,515,152 | `1dac812327ef51fc3cc692c75ad54e4762ff356c049c0537a76b90e16719026a` |
| Android unsigned APK | 5,124,493 | `847a0ac5c92874d30dc28cfb1d0e00f90ea02c8abb6d682ce746d11812a9e044` |
| Android unsigned AAB | 4,940,898 | `3a02c68f000db0abe0ee997c0856b94fe69d215b02801027e60ac14e22bc853f` |
| source manifest | 42,721 | `783032ff110dd02d2cab970ae8f89398905d471add25352f2e18589194718025` |
| source gate | 176 | `82b52305ae8c218dbdeedf399b52e645bd18e133f864cc43a99ffa643c46026d` |
| SBOM | 407,391 | `592dbe6be5558c26a5662dcc4c8a1ebbd406051f9a6f03d2026800679ae9bbaf` |
| gate report | 5,994 | `135ed37f76b0b5e082032f6f141cc437248b8a8e95f7629105024ea2c5364b54` |

六种归档及 Windows ASAR 内层共扫描 7,788 个条目，未发现真实 `.env`（无凭据 `.env.example` 除外）、数据库、私钥、证书/签名容器或玩家存档正文。Web/API/Windows/Android 运行时内容扫描也未发现玩家本机路径、存档文件名或密钥标记。source archive 仅作内部交接，19 个历史文档/脚本仍含玩家存档文件名或本机路径的文字引用，但不含存档正文、数据库或密钥/证书，因此不得作为公开下载制品。两份真实存档最终只读复核的 bytes、mtime 与 SHA-256 均与测试前完全一致。

Unverified gaps：正式 Windows/Android 签名与证书连续性、Android 实体设备、真实 Linux/systemd/Nginx、生产备份和切换、公开 PWA/API/download smoke、下载页更新与观察窗口。Windows/Android 诊断制品明确不可进入 stable feed。

## 给 release agent 的下一跳

只有用户明确批准发布后才能继续：

1. 从 runtime SHA `865f125e862487aedf7d7df08491867881b2b65b` 建立新的隔离 checkout，并复核本交接的版本、默认环境与完整测试结果；不得把后续 docs-only commit 当成运行时制品 SHA。
2. 先按 `SHA256SUMS`、candidate manifest 和 provenance 独立复算当前候选，再执行 `npm ci`、`npm run build:web`、production-preview PWA 与完整 release gate；不得复用 Android/Desktop 覆盖后的 `dist/`。
3. 使用批准证书重建并验证 Windows/Android 正式制品；检查证书连续性、时间戳、APK/AAB 签名和 Android 实体设备。当前 unsigned 诊断制品只能用于比对，禁止发布。
4. 若包含 API，先在临时 SQLite 和展开后的发布目录启动验证；生产写入前取得并验证备份 evidence。
5. 证书、签名、目标节点、previous-stable pointer、回滚命令或健康门禁任一缺失即停止，不得绕过。
