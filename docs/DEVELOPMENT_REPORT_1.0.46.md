# DSP极简网络 1.0.46 存档、手机拉线与画布展示本地审计报告

审计日期：2026-08-18

状态：发布前开发门禁已完成，未发布。本轮没有访问生产节点、生产数据库、账号、证书或签名密钥，也没有执行部署。两份玩家存档仅在本机临时浏览器与内存中做只读输入和本地 IndexedDB 验证，未提交 Git、未复制进制品、未输出正文。

## 结论

1.0.46 已解决本轮最主要的阻断：普通构建不再默认运行 1.0.44 的 durable recovery-head/WAL 协调器，而是恢复到 1.0.43-compatible 的 verified-primary 保存路径。模拟 Worker 先给出权威检查点，保存 Worker 再按既有 writer lease、backup、checksum 和逐字读回合同提交。自动保存前正在运行的模拟在保存期间和完成后都保持运行，玩家主动暂停则保持暂停。

durable WAL 没有被删除，但只允许通过显式开发变量启用。它的 finalize、T1、recovery-head rollover 和 Worker 重建故障都保留完整回归，防止以后继续开发时再次引入“durable 模拟 Worker 不可用，已暂停；刷新后从 recovery 精确恢复”的永久阻断。

手机连续拉线也完成重构：next-mobile shell 只挂载一个非模态、可折叠的底部操作面；全部候选可滚动查看、按最新优先显示，并可定位或移除任意一条。重复、已有线路、不兼容或缺料点击只产生短暂反馈，不会污染此前有效候选；最终提交仍由领域层严格原子复核。

画布展示现已从一个混合开关拆成三个独立设备偏好。玩家可以固定完整、中等或一行卡片，也可以独立决定重叠位置显示数量标记、代表卡或全部卡片，以及普通选择/悬停是否展开。默认数量标记会在每个重叠组留下“层叠图标 + 数量”，不再让建筑位置完全消失；它在低缩放下维持可触控的屏幕尺寸，点击后展开并选择代表建筑。

## 最终设计边界

1. **默认保存路径回到稳定协调器**：缺失、关闭或错误设置 durable 环境变量时均选择 1.0.43-compatible verified-primary；打开旧玩家档不会隐式启用 durable。空间站 v46 bridge 也强制使用稳定路径。
2. **两种编辑设置语义分开**：默认保护模式拒绝保存窗口内的玩家编辑，但不暂停模拟、不回滚保存前进度；实验性开关开启时，已接受操作保留，保存失败仍可继续并立即导出。
3. **durable 只做显式验证且可同页自愈**：T0、finalized/pending intent、T1 和 recovery head 保持严格身份与 revision 绑定；新 Worker 清除旧 disabled latch，暂停后可同页继续。
4. **纯挂机保持原子终态**：恢复日志、宏观进度、主存档验证与 Worker 接管必须全部完成后才清理；失败不伪装为成功，不删除当前进度，并保留导出边界。
5. **临时 UI 不进入存档**：连续拉线候选、展开状态、临时提示和定位状态均不新增 GameState、云同步、迁移或 IndexedDB 字段。
6. **画布三类决策互不覆盖**：基础卡片只决定普通卡片层级，重叠处理只决定同坐标组如何留下入口，交互展开只决定普通选择/悬停/聚焦；拖动、采矿和连线目标仍可按安全规则强制完整显示。三项均只写本机 localStorage。

## 两份真实玩家存档的只读验收

| 输入 | 精确字节 | SHA-256 | 第一次自动保存 | 第二次自动保存 | 结果 |
| --- | ---: | --- | ---: | ---: | --- |
| `dsp-idle-save-2026-08-14.json` | 36,704,109 | `cd2356ea2b9a90a47cfa32ed9533e7056bfc4202f6af777fc4f3b98faa9a81b1` | 3,598 ms | 3,267 ms | 两次均 Worker active、`paused=false`，刷新后主档仍为运行态 |
| `dsp-idle-local-backup-2026-08-17 (1).json` | 11,723,913 | `f832f7fb909bad1981cd8476f28dcf0f1026c62955d822904218cee270a43d2a` | 1,143 ms | 1,022 ms | 两次均 Worker active、`paused=false`，刷新后主档仍为运行态 |

两份源文件的 bytes、mtime 与 SHA-256 在测试前后完全一致。专项还断言自动保存期间没有任何 `paused=true` 或 Worker fallback 状态变化，没有 durable/recovery 刷新提示，backup 与重载后的 primary 均通过完整检查。

## 手机连续拉线与运行时错误修复

- next-mobile shell 不再挂载桌面 `.batch-connection-panel`，不是依赖 CSS 隐藏；收起底栏位于底部导航和 safe area 上方，展开列表没有 backdrop，不阻断继续点地图。
- 移除 `slice(0, 5)`；6、10、50、100 条候选均完整渲染并可滚动。候选使用物品、建筑名称和目标端口作为主要识别，支持“定位”和“移除”。
- “撤销”只移除最近候选；“清空候选”与“退出连续模式”独立。重复或本次无效点击不新增、不扣料，也不禁用此前有效候选。
- 最终原子复核失败会把原因映射到候选索引，保持零创建、零扣料；领域层对畸形重复请求仍严格拒绝。
- `isDynamicImportFailure()` 不再把所有 `TypeError` 归类为 chunk 故障，只识别真实 module/chunk/CSS-chunk 加载签名。普通 React 运行时错误使用独立文案、稳定脱敏诊断码和 component stack，不记录错误正文、props、存档、云数据或玩家隐私。

## 画布展示与重叠建筑修复

- 基础卡片新增固定“中等”，形成自动、完整、中等、一行四档；自动档仍按视口原始可见节点数和 140/100、480/360 两组迟滞阈值切换，固定档不再被阈值覆盖。
- 重叠处理提供数量标记、代表卡片、全部卡片。默认数量标记每组只挂载一个 `88×44` 点击入口，可见胶囊约 `80×30`，只显示层叠图标、数量和聚合告警；完整“叠放 N”保留在无障碍名称与悬停说明中。其屏幕尺寸用 inverse zoom 补偿，低缩放不再退化成难以点击的小字。
- 交互展开提供仅选中、悬停也展开、保持基础。普通 focus/hover 不再让数量标记闪退；选中、采矿、拖动和连线 source/candidate 仍解除标记并展示真实建筑卡。
- 展开模式只让单个 halo/marker 节点持有成员数组，其他成员共享 membership token，不为每个成员复制整组引用；4,213 个 exact-overlap 的派生仍保持线性边界。
- 普通平移和缩放现在持续刷新世界视口矩形，固定中等与自动密度不会在 Fit View 或普通拖动画布后把屏内节点误判为视口外。
- 变换中的 React Flow viewport 已移除 `contain: paint`，避免线路仍在但节点层被错误裁空；一行卡及 wrapper 固定为 `96×32`，中等、数量标记和完整卡的裁剪/线路几何也按当前档位尺寸计算。
- fully-deferred 空白视角保留四个边界恢复节点，Fit View 不再因节点仓为空而失效；标准 SVG MiniMap 与低频 CanvasMiniMap 均可点击定位世界坐标。
- 本机键为 `dsp-idle-network.ui.canvas-detail.v1`、`dsp-idle-network.ui.canvas-overlap.v1`、`dsp-idle-network.ui.canvas-interaction-detail.v1`；缺失/损坏分别回退 `auto`、`marker`、`selected`，不新增任何存档字段。

## 本地验证结果

以下数字均来自当前 1.0.46 开发 tip；完整 Chromium、durable、production preview、PWA、跨浏览器、服务端、运维、原生静态和两份真实存档均已在画布增量合入后重跑。

| 范围 | 结果 |
| --- | --- |
| TypeScript | `npm run typecheck` 通过 |
| 全量 Vitest | 171 files passed / 7 conditional skipped；1,421 passed / 20 skipped / 0 failed；其中 canvas density / UI preferences 9/9 |
| 服务端与空间站 | server 363 passed / 2 skipped；station 3/3 |
| 运维与切换模拟 | ops 56 passed / 6 Linux-only skipped；release switch 29/29 |
| 原生静态安全 | 24/24 |
| durable WAL | 7/7 |
| 默认 runtime protocol | 5 passed / 3 条真实大档条件跳过；相同三条在 durable 大档模式 3/3 |
| 默认保存进度 | 2/2；保护模式和实验模式分别验证 |
| 纯挂机教程与宏 | 20 passed / 1 条真实夹具条件跳过 |
| 手机连续拉线 | 21/21，含 6/10/50/100 候选、390×844、360×640、844×390 与 80%～200% 字体 |
| 完整 Chromium | 418 passed / 23 explicit conditional skips / 0 failed（441 总项） |
| Firefox / WebKit | 2/2 |
| Production preview | PWA、连接视口与画布 22/22；自动档三轮 P95 7.0 / 7.0 / 20.9 ms、0 个 >50 ms 帧；另行连续重复性能门禁 3/3 |
| 真实存档专项 | 两份档的自动保存 + 画布核心 4/4；各 17 张设置/横竖屏截图，pageerror 0；前者空白 Fit View 恢复 0→33 并显示 1,000 重叠组，后者 Fit View 后约 31 个可见节点 |
| 匿名 v47 发布夹具 | 12/12 |
| 许可证与依赖 | 125 个运行时包一致；root/server `npm audit --audit-level=high` 均 0 漏洞 |
| Web 构建 | 1,961 modules；startup 194,838 B gzip；menu 280,997 B gzip；forbidden startup modules 0 |

Chromium 的 23 条跳过均由用例内显式条件控制，包括未提供的其他真实夹具、durable-only 或 production-preview-only 场景；它们不是失败。两份用户指定玩家档已由独立 opt-in 用例实际运行，不包含在这些跳过项里。开发 E2E 的 `/api → 127.0.0.1:65534` 拒绝是线上 API 隔离，不是产品故障。

## 审计中额外处理

- 修正保存失败 E2E 的注入位置：现在拦截真正写主档的 authoritative persistence Worker `commit`，并正确返还 transferable payload；已证明连续 quota 失败时实验性编辑仍保留、可导出、刷新后精确恢复且不暂停。
- 修正 production Web 构建门禁：`npm run build:web` 强制 Web 平台，release gate 在构建后执行 PWA 生命周期，避免 Android/Desktop 的旧 `dist` 被误当 Web 候选。
- 更新匿名 v47/空间站发布夹具及服务端持久化原子性回归；根与 server 高危依赖审计均为零。
- 保留开发服务器偶发的 `ResizeObserver loop completed with undelivered notifications` 为非阻断诊断；候选稳定性专项没有 pageerror、dynamic-import-fatal 或 runtime render error。后续若处理，应先在 production preview 独立采样，不能用吞错掩盖真实异常。

## 残余风险与优化方向

1. durable WAL 仍是开发实验路径，发布构建不得设置 `VITE_DURABLE_RUNTIME_RECOVERY=true`；若未来要重新默认启用，必须重新完成真实大档、故障注入和跨浏览器全矩阵。
2. `FactoryRuntime` 约 695 KB minified，主 CSS 约 608 KB，Vite 仍报告大 chunk 警告。后续优先从 `App.tsx` 拆出 persistence lifecycle、Worker lifecycle 与 batch-connection presentation，但不得改变权威状态边界。
3. Android/Windows 正式签名、实体设备、Linux systemd/Nginx 备份与切换、线上 smoke、下载页更新均未执行，不能视为已发布或已签名。
4. 固定源码、候选归档、manifest、SBOM 与 provenance 只证明开发侧输入与输出一致；正式证书、生产备份、目标节点与受保护切换仍属于 release agent。
5. “完整”与连接“展开全部”会按玩家明确选择挂载更多重卡片；在 500 个同时可见的合成压力场景仍可能出现秒级长帧。自动档已满足当前门禁，后续优化应继续拆分重卡内容，而不是静默改写玩家的固定档选择。

## 发布交接原则

开发侧会从干净、固定 SHA 生成并复验 Web/API/source、未签名原生诊断制品、manifest、SBOM 与 provenance，再把路径和哈希写入发布交接。release agent 仍必须独立复算，并在签名、目标节点、备份 evidence、回滚指针和公开 smoke 齐备后才能发布；本报告本身不授权部署。
