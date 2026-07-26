# 系统架构

## 1. 总体拓扑

```mermaid
flowchart LR
  U["浏览器 / PWA / Electron / Android"] --> F["React 19 + React Flow 前端"]
  F --> W["Web Worker 确定性模拟"]
  W --> E["game/engine.ts"]
  F --> L["localStorage 本地存档"]
  F -->|"HTTPS /api"| N["Nginx"]
  N --> S["Node 云服务 :4320"]
  S --> D["SQLite cloud.sqlite"]
  S --> B["6 小时备份目录"]
```

前端是游戏运行时和本地数据的主载体；后端只负责账号、云存档、排行榜和运营数据，不参与每个生产周期的权威模拟。

## 2. 前端分层

### 启动层

- `src/main.tsx`：安装客户端监控，初始化原生运行时并挂载 React；仅 Web 生产环境注册 PWA，普通入口按需加载 `GameLauncher`，管理员入口独立加载后台。
- `src/nativeApp.ts`、`src/components/NativeUpdateCard.tsx`：统一 Electron/Android 平台识别、生命周期、系统返回、网络状态、应用版本和更新状态；这些信息属于设备 UI，不进入 `GameState`。Android 更新清单和账号深链 origin 必须由构建环境显式注入，社区构建没有官方回退地址。
- `src/game/apiTransport.ts`：Web/Android 沿用 Fetch 语义；Electron 的绝对 HTTPS API 请求改走受限主进程桥，渲染进程不关闭 Web 安全策略。
- `src/game/fileExport.ts`：Web/Electron 使用下载链接，Android 使用 Capacitor Filesystem 与系统 Share sheet 导出 JSON。
- `src/GameLauncher.tsx`：主菜单、版本公告和工厂启动边界；只有玩家进入工厂或执行存档操作时才继续加载存档迁移器与工厂运行时。
- `src/i18n/locale.tsx`、`legacyTranslations.ts`、`catalogEnglish.ts`：设备级语言上下文、现有界面文案映射和目录英文派生层。`?lang=en` 只更新独立语言偏好；英文目录进入工厂后懒加载，不修改核心目录 ID、`GameState` 或云存档。
- `src/FactoryRuntime.tsx`：按需加载 React Flow Provider 与 `FactoryGame`，避免主菜单提前下载画布 JavaScript 和模拟器。React Flow 基础 CSS 在 `styles.css` 最前合并，以保留自定义端口覆盖的稳定级联顺序。
- `src/hooks/usePlayerPresence.ts`、`src/game/presence.ts`：进入工厂后的匿名心跳、可见性节流与本机稳定 ID；不读取游戏存档。
- `src/game/analytics.ts`：页面访问、活跃时长和白名单关键事件的会话级批处理；页面加载、LCP 和静态传输量只上传隐私分桶，不上传原始时序、URL 参数或游戏存档。
- `src/game/savePreview.ts`：主菜单只读存档索引，只解析摘要、设置和原始 payload；不迁移、不推进模拟、不写入存档，正式校验仍由 `storage.ts` 在载入时执行。
- `src/components/AdminDashboard.tsx`：独立 `/admin` 路由，只使用浏览器会话中的管理员 token 读取聚合运营数据。
- `src/components/StartMenu.tsx`：开始/继续、槽位、导入、云账号、邮箱验证/密码重置链接和主菜单设置。
- `src/components/CloudAccountSecurity.tsx`、`CloudSaveConflictDialog.tsx`、`CloudSaveSlotsPanel.tsx`：主菜单与银河工作区共用的账号安全、邮箱绑定、设备会话、数据导出、四槽云存档和云冲突选择界面。
- `src/components/ReleaseNotesDialog.tsx`：版本公告单一数据源、首次展示偏好和主菜单/游戏内设置共用弹窗。
- `src/game/onboarding.ts`、`src/components/OnboardingCoach.tsx`：独立于 `GameState` 的 5 步基础操作和 13 步渐进教学偏好、真实命令里程碑判定及设备/线路卡点诊断；教学关闭状态不会随存档或云同步改写。
- `src/App.tsx`：顶层会话和工厂编排。它管理工作区、画布交互、连接、选中状态、存档定时器和模拟 Worker。

### 展示与交互层

- `src/components/FactoryNodes.tsx`：矿脉、生产、电力、仓储、分流器和物流站节点。
- `src/components/FactoryEdges.tsx`：线路路径、标签、层级、监测和连接虚影。
- `src/components/GamePanels.tsx`：资源栏、行星导航、检查器、制造与施工托盘。
- `src/components/mobile/`：阶段 0-3 的可选手机壳层、顶栏、五项导航、更多工作区、三档抽屉、移动建造/物资/检查器、放置状态条和选择上下文条。它只调用现有命令和 selectors，不拥有生产规则。
- `src/components/RecipeWorkspace.tsx`、`CodexSections.tsx`：统一生产资料库。物品/配方沿用现有正反查与聚焦链；建筑、物流、电力、星球、戴森和科研页只从运行时内容目录、行星档案与引擎 selectors 派生，不维护另一套数值常量。
- `src/components/*Workspace.tsx`：科技、生产资料库、统计、星图、蓝图、戴森规划、战役、银河和运营中心。
- `src/components/CatalogPicker.tsx`：配方和物品的面板式选择器。新增长列表选择应优先复用它；打开时按 compact 视口决定焦点，桌面自动聚焦，手机等待玩家主动点击以免弹出软键盘。
- `src/hooks/`：`useCompactLayout` 只按视口判定 compact/medium/desktop，`useMobileUiPreference` 保存独立的手机壳偏好，`useMobileNavigation` 管理移动路由、覆盖层和浏览器返回；粗指针仍只负责手势、吸附和命中区。
- `src/styles.css`：桌面与经典手机基线，包含字体倍率和动效降级规则。
- `src/hooks/useResolvedTheme.ts` 与 `src/theme.css`：把 `dark / light / system` 解析为根节点主题并集中覆盖桌面、React Flow、工作区和新版手机壳；主题模式属于 `GameSettings`，不复制玩法规则。
- `src/theme.css` 以语义主题变量统一开始菜单、账号、云存档、排行榜、工作区、模态和两套手机壳；异步加载的工作区样式也消费同一变量层，避免亮色模式回落到硬编码深色。
- `src/styles/mobile-shell.css`：新版手机壳、顶栏、底栏和路由边界；`mobile-factory.css`：阶段 2 的三档抽屉、建造/物资/检查器和画布模式；`mobile-workspaces.css`：阶段 3 的单滚动工作区、移动列表/详情和大字适配；`codex.css`：生产资料库桌面主从布局及限定在新版壳层下的移动列表/详情规则。

React Flow 的持久真相仍来自 `GameState`。手机横竖屏切换只重新计算视口平移以保持原世界中心；触摸端的扩大吸附、连接虚影和低性能 LOD 都是瞬时展示状态，不写入存档。第二根触摸指针由画布捕获层接管，先取消第一指未提交的节点拖动、连线、采矿、放置、区域草稿和长按，再以双指中心与距离直接更新 React Flow 视口。生产区域的矩形、名称与颜色保存在 `GameState.canvasRegions`，但区域草稿和编辑器选择仍是瞬时 UI 状态。

桌面与移动端共用节流后的 `canvasGame` 展示快照：确定性模拟继续按真实时间推进，节点、端口和线路按设备级生产画面刷新偏好发布；选中对象和检查器优先追上真实 Worker 状态。科技树、统计、星图等全屏工作区打开或页面进入后台时，底层画布快照冻结，关闭工作区后一次性追上最新 `GameState`。该快照绝不能反向写回游戏状态。

阶段 0-3 的新版手机壳由 `?mobileUi=next` 或独立的 `dsp-idle-network.mobile-ui.v1` 偏好启用；`legacy` 仍保留为回退路径。偏好、移动路由、抽屉高度、画布模式、连续放置开关、工作区详情栈和最近使用列表都不进入 `GameState` 或云存档。`useMobileNavigation` 同时管理 `peek / half / full`、工作区 subview 栈和浏览器历史，因此界面返回、Android 返回与浏览器返回按相同顺序收起抽屉、退出详情和返回工厂。

移动画布显式区分 `browse / place / connect / select / layout / region`。节点只在 `layout` 模式允许拖动；放置数量和连续扩建由移动状态条控制；端口连接继续调用 React Flow 与现有 `canConnectBelt/connectBelt` 路径，保留 56px 粗指针吸附和真实 handle 几何。建造、物资和 `peek/half` 检查器使用移动专用呈现；`full` 检查器把事件透传给原完整检查器，从而复用配方、物流槽、电网、升级和回收命令。

阶段 3 的科技、生产资料库、星图和蓝图使用路由化列表/详情；科技与资料库返回列表时恢复筛选和滚动位置，资料库可在物品、建筑、科技和行星详情间替换当前详情路由，星图支持恒星系→行星两级返回。统计/生产管理使用移动概览、分段导航和展开行卡；其余工作区由隔离样式层统一为不透明单纵向滚动页。`ResizeObserver` 在壳层网格变化时按旧画布尺寸计算世界中心，避免横竖屏切换漂移；React Flow 始终位于新版画布网格的有效行。

工厂运行时和大型工作区都由 `React.lazy` 按需加载。主菜单首屏不再静态依赖 React Flow、`engine.ts`、`storage.ts` 或工厂工作区；生产构建必须检查入口 HTML 没有提前 preload 这些 chunk。

### 领域层

- `src/game/types.ts`：领域 ID、实体、线路、科研、银河、蓝图和 `GameState` 类型。
- `src/game/content.ts`：物品、建筑、配方、施工成本、科技和内容闭合审计。
- `src/game/galaxyCatalog.ts`：16 种生态模板、8 种恒星类型、各行星模板池和星区基础坐标；只保存稳定内容定义，不读取运行时时钟。
- `src/game/galaxy.ts`：由持久化种子确定性生成 8 系 22 星的恒星参数、二维坐标、生态、矿物、海洋、能源、殖民成本和工业档案；加载时优先保留已保存档案，缺字段才回退生成值。
- `src/game/engine.ts`：确定性生产、电网、运输、科研、手搓、戴森与状态变更命令。
- `src/game/recursiveCrafting.ts`：手工快制、施工快制和建筑制造中心共用的纯递归材料规划器；先证明完整链可完成，再返回原子库存结果、确定性步骤和高级配方回退原因。
- `src/game/productionLocator.ts`：按当前持久状态派生物品生产设备及完整上游线路集合；只生成定位结果，不修改选择、建筑或模拟状态。
- `src/game/stellarIndustry.ts`：全星区物流快照、真实中转路径、枢纽供电诊断、行星分工与星系汇总。
- `src/game/network.ts`：线路占用、吞吐预测、连续网络与瓶颈诊断。
- `src/game/statistics.ts`、`productionManagement.ts`、`planning.ts`、`alerts.ts`：统计、全星球设备诊断、目标产能反推和故障聚合。生产管理快照完全由 `GameState` 派生，不写回存档。
- `src/game/campaign.ts`、`progression.ts`、`endgame.ts`：任务、成就和终局 progression。
- `src/game/productionRefresh.ts`、`quantityFormat.ts`、`infiniteResearch.ts`、`galacticActivity.ts`：设备级画面发布策略、精确大数显示、BigInt 无限科研曲线和银河活动时间域。前三者不读取墙上时间；活动时钟只接受服务器校准后持久化的单调时间。
- `src/game/storage.ts`：迁移、校验和、离线结算、槽位、备份与快照。
- `src/game/cloud.ts`：同源 `/api` 客户端、会话和 8 秒请求超时。账号与云存档只允许 HTTPS 或本地开发入口；匿名只读 `/health`、`/public-status` 和 `GET /leaderboard` 可在上海 HTTP 同源读取节点状态、活动时钟和公开排名，且不会附带 token。打包的 Electron/Android 只有在构建时显式配置 `VITE_API_BASE_URL` 才启用云功能，社区包默认离线。Capacitor 的内部页面 origin 固定为 `https://localhost`；生产 API 白名单需精确允许它，以覆盖原生 HTTP 补丁不可用时的标准 Fetch 回退，未知 origin 仍拒绝。
- `src/game/mods.ts`、`contentPacks.ts`：内容包格式校验、依赖和运行时目录注入。

## 3. 状态与模拟流

1. 主菜单调用 `loadGame()` 或加载指定槽位，得到 `LoadedGame`。
2. `1.0.3` 的 `FactoryGame` 以 `GameState` v36 作为唯一持久游戏状态；v1-v35 由连续迁移链归一到 v36，存档 envelope 仍为 v2。
3. 工厂每 1 秒累计并向模拟 Worker 提交真实经过时间。模拟步长、状态发布和视觉动画彼此独立；画面档位绝不能改变 `1x/2x/4x` 累计秒数、生产、物流、科研、戴森或确定性顺序。
4. 浏览器支持 Worker 时，状态、模拟秒数和可信墙钟秒数分别提交给 `src/game/simulation.worker.ts`；Worker 调用 `advanceSimulation()`。普通倍率与时间扭曲只放大模拟预算，活动资格和倒计时只消费墙钟预算。暂停时停止重复回传完整状态，Worker 不可用或报错时使用同一个函数回退到主线程。
5. `canvasGame` 是只读展示快照。设备级 UI 偏好 `dsp-idle-network.production-refresh.v1` 提供自动、100/200/500/1000/1500/3000 ms 档位；自动档桌面从 200 ms、粗指针设备从 500 ms 开始，并依据 FPS、Worker 延迟和积压以迟滞窗口逐档调整。固定档不会被自动策略覆盖。
6. 选中实体、选中线路和检查器需要在真实 Worker 状态到达时优先刷新；普通屏幕内容按全局档发布。`useProductionVisualClock()` 以最多 200 ms 的 UI 时钟在两个真实快照间计算周期进度，填充、文本和 ARIA 共用同一数值；库存数字永远来自最近真实状态。
7. 返回的新状态驱动 React UI；全屏工作区或页面后台期间冻结底层画布快照，关闭后追上最新状态。
8. 按设置中的 30/60/120 秒间隔自动保存；切后台、`pagehide`、卸载和返回主菜单立即保存。旧 2/10 秒偏好在 v29 迁移为 30 秒。

模拟器应保持纯状态输入和确定性输出。新增随机机制必须从持久化 seed 派生，不能直接依赖 `Math.random()` 或墙上时钟，否则基准哈希、离线结算和云存档会分叉。

行星矿储、能源、航程和专长倍率保存在 `GameState.galaxy.profiles`，恒星类型、亮度和二维坐标保存在 `GameState.galaxy.systemProfiles`。普通“开始新游戏”只生成一次随机 seed；之后所有生态与路线计算都从该 seed 和持久状态派生。`migrateGame()` 会验证并恢复已有倍率，而不是只用 seed 重抽，因此首次保存、云端往返和跨设备加载不会改变同一工厂。

## 4. 内容模型

核心内容使用字符串联合 ID 和 `Record<ID, Definition>`：

- 物品：名称、符号、颜色、固体/流体/矩阵类型和说明。
- 配方：设备、周期、输入、输出和可选科技要求。
- 建筑：类型、速度、缓存、电力、等级和设备族。
- 科技：矩阵成本、层级、前置和解锁说明。
- 施工定义：制造成本、产量和科技要求。

修改内容时必须运行 `validateContentCatalog()` 和 progression audit。新内容不能只加显示项，还要闭合 ID 类型、定义、来源/用途、解锁、制造和迁移引用。

内容包会在模块加载阶段先恢复注册表并修改运行时目录，然后才迁移存档。不能把这一次序颠倒，否则包含扩展 ID 的存档会在迁移时丢失引用。

## 5. 画布与物流

React Flow 只负责可视节点、边、视口和交互；真实生产库存与运输状态都在 `GameState` 中。显示层通过实体和线路派生 Node/Edge，不应把 React Flow 的临时对象当作存档真相。

`GameState.constructionAutomation` 持久化建筑制造中心的启停、建筑/随身物流载具目标库存、轮询游标、累计制造量和按中心 ID 隔离的递归任务。`recursiveCrafting.ts` 会对同一输出按 `recursivePriority` 和稳定 ID 排序，优先尝试已解锁的高级、稀有资源或精简配方；只有完整材料链不可完成时才回退基础配方。任务保存实际配方选择与回退说明，并将材料步骤、建筑成品步骤或载具入库步骤按确定性顺序执行。基础耗时为材料 0.1 秒/件、建筑成品 5 秒/个；两级升级同时缩短两类步骤。目标库存上限继续按科技分为 100、500 和最终 100,000，速度升级规则不变。每一步只从中心所在行星托盘原子扣料，运输机/运输船最终进入全局 `portableFleet`，原矿缺失时停机且不会凭空生成。施工托盘和即时手工递归快制也必须先证明整链可完成再一次性提交库存结果。

全星球批量命令按实体所属行星分组，临时切换到对应行星执行既有配方或物流槽命令，再恢复玩家原先所在行星。这样配方切换和槽位替换产生的物资返还会进入正确的行星托盘；批量物流模板只修改指定槽位，物品已占用其他槽位的站点会被跳过。

线路模型包含源、汇、物品、等级、并联数量、分拣兼容字段、优先级、货物堆叠、路由、流量和拥堵。端口能够根据已有配方、物流槽或默认状态自动接受物品。连接草稿在开始拉线时锁定传送带等级；自动模式按 Mk.III→Mk.II→Mk.I 选择已解锁且有库存的最高等级，并优先复用已有并行线等级，手动模式保留显式选择。多条同端点线路由 bundle 信息进行视觉错位。

`setBeltLaneCount()` 是修改已建线路并联数量的唯一命令入口：目标范围为至少 1，新增普通线路上限为 64；增加数量原子扣除同级施工传送带，减少数量原子返还同级施工库存。命令只修改 `lanes` 和对应施工库存，必须保留 `progress`、`totalTransferred`、优先级、堆叠、路由、端口与在途物资。旧存档中超过 64 的既有 bundle 不会被加载器裁剪，可逐步减少但不能继续增加。`getBeltCapacity()` 继续统一按等级基础速度 × `lanes` × 货物堆叠计算。

`BeltConnection.totalTransferred` 是模拟层单调累计的真实整数结算量。`BeltFlowSampler` 保持在 React/UI 侧，以 `GameState.elapsedSeconds` 建立近 5 模拟秒窗口，并把派生观察值附加到只读 `canvasGame`；采样历史不进入 `GameState`、Worker payload、存档或确定性哈希。线路标签、检查器、统计与两套手机摘要必须消费同一观察值并统一标为 `/s`，理论供需与近期实际不能混为一个数字。

星际物流槽持久化 `direct`、`relay-preferred` 或 `relay-required` 策略及 1-4 个/船翘曲预算。中转物流站持久化启用状态与优先级；在途 `StationRoute` 保存 waypoint、总距离、实际每船翘曲消耗和 `vehicleStationId`。航线仍挂在需求站上，但载具可属于供给站或需求站；占用、卸载限制、返航、翘曲扣除/退款和诊断必须按所属站计算。多跳耗时、能耗、诊断和模拟使用同一经济函数。

`SimulationAdvanceSession` 持有不进入存档的物流查询上下文：实体 ID、站点槽、忙碌载具、供给预留、在途货物、活动航线和路线经济缓存。动态航线计数每个模拟步重建，派遣后立即更新；需求槽会按距离、优先级和持久化公平游标遍历全部合法供应源，单一来源不足时继续部分补足，直到需求、载具或容量耗尽。同一调度会话共享候选索引和动态路线缓存，但不改变稳定排序与状态哈希。测试保留旧全扫描模式，用于 10/50/100/500 塔逐字段和状态哈希对比。

物流站连接自动配置只修改未配置状态：已有同物品槽优先复用，否则占用第一个空槽；五槽已满、物品冲突或方向非法时返回结构化失败原因。旧 `sorterTier` 只作为兼容字段保留并始终归一到传送带等级，运行时吞吐只读取线路等级、并行数和堆叠层数。

`getEntityInputCapacity()`、`getEntityOutputCapacity()`、`getEntityItemInputCapacity()` 与 `getStationSlotCapacity()` 是堆叠缓存的统一入口。v32 将原固定安全上限拆成存档级 `productionBufferLimit` 与 `logisticsBufferLimit`；v33 再增加 `proliferatorBufferLimit`，只约束已安装喷涂机当前等级的增产剂物品。生产/采集类实体使用前者，`storage`、`splitter`、`station` 使用后者，内容包实体沿用相同 `kind` 分类。每一种输入、输出分别按 `min(基础容量 × 堆叠数量, 对应上限)` 计算；物流槽还需与非零 `maxStock` 取最小值，零值表示额定容量。函数显式接收 `GameState`，不得通过可变全局设置影响模拟。

调低上限或减少堆叠不会裁剪已有缓存。普通传送带、生产、托盘转入和新物流派遣在库存回落前得到零剩余容量；已经在传送带或航线中的货物继续安全到达并可形成临时超额，之后才阻止新写入。当前加载器把两项建筑上限限制到 1,000～100,000,000、增产剂上限限制到 1～100,000，并将建筑缓存、在途货物和堆叠数量归一为非负整数。

闲置物流运输机和运输船保存在 `GameState.portableFleet`，不属于任何行星托盘；装入物流站后仍由对应实体的 `stationDrones` / `stationVessels` 持有。切换行星不复制普通库存，只保留这一明确的随身载具库存和光标单组载荷。

`GameState.planetViewports` 按 `PlanetId` 保存 React Flow 的 `x/y/zoom`。离开行星和 `onMoveEnd` 更新当前记录，返回时恢复目标记录；书签、设备定位和网络定位属于显式视角命令，可以覆盖恢复结果。瞬时 React Flow 对象仍不进入存档。

殖民费用沿用行星档案中的 `colonyCost`，但 `getColonizationRequirements()` 为每项成本派生 `planet-tray` 或 `portable-fleet` 来源。`colonizePlanet()` 只在全部成本一次性验证成功后复制状态并统一扣料，因此不会在缺船或缺运输机时先扣普通材料。

`GameState.planetTrayItemLimits` 按行星保存单种物资上限。普通自动入库命令先计算剩余容量，只移动可容纳的整数数量；设备回收、配方切换、线路取消以及玩家主动放下光标整组载荷属于保护性返还，不受上限截断，避免降低上限或配送枢纽满仓后销毁、截断或卡住既有物资。

`GameEntity.interactionLocked` 是 v35 起的持久玩法状态。所有会改变实体位置、数量或配置的领域命令都必须在引擎边界拒绝锁定实体；模拟、供电和物流仍正常推进。React Flow 的拖动拦截只负责交互反馈，不能替代命令守卫。批量命令跳过锁定实体，复制可读取锁定源，但新粘贴实体始终解锁。

有限资源的唯一展示判定为 `engine.ts#getResourceReserveSnapshot()`。React Flow 节点通过派生 NodeData 接收快照，桌面/移动检查器直接调用同一 helper，`stellarIndustry.ts` 与生产统计也使用相同的 `infinite/exhausted/remaining/capacity/remainingPercent` 语义。

节点卡片必须高于线路并拦截指针事件；连接虚影和成功/失败反馈属于临时 UI 状态，不写入存档。

## 6. 存档架构

### 本地

| 数据 | 键或位置 | 说明 |
| --- | --- | --- |
| 主存档 | `dsp-idle-network.save.v1` | v2 envelope；`1.0.4` 继续写 v36并可迁移 v1-v35；`productionHistory` 始终以空数组写入 |
| 生产画面刷新偏好 | `dsp-idle-network.production-refresh.v1` | 只按设备保存，不进入 `GameState`、本地/云存档或迁移版本 |
| 界面语言偏好 | `dsp-idle-network.locale.v1` | `zh-CN / en`；可由 `?lang=en` 更新，只按设备保存，不进入游戏存档或云同步 |
| 检查器布局偏好 | `dsp-idle-network.inspector-layout.v1` | 分区顺序和折叠状态；损坏或未知 ID 自动归一，不进入游戏存档 |
| 主备份 | 主键后缀 `.backup` | 主存档写入并读回校验成功后，尽力保存上一份有效版本 |
| 快照 | 主键后缀 `.snapshot.*` | 自动快照最多 2 份、至少每 5 分钟生成；手动快照独立保留，不参与自动清理 |
| 手动槽位 | `dsp-idle-network.slot.1..3` | 3 个独立槽位 |
| 云 token | `dsp-idle-network.cloud-token.v1` | 仅安全入口调用云 API |
| 云同步标记 | `dsp-idle-network.cloud-sync.v1` | 按云用户和 `main/1/2/3` 槽位分别记录最后同步修订、云 SHA-256 和游戏状态校验值，不包含存档 payload |
| 自动云同步状态 | `dsp-idle-network.cloud-auto-sync.v1` | 只记录最近一次主存档同步的时间、结果和修订，不包含存档 payload |
| 匿名玩家 ID | `dsp-idle-network.player-id.v1` | 仅在进入工厂后生成；服务器只保存其 SHA-256 哈希 |
| 本地身份与榜单账本 | `dsp-idle-network.account.v1` | schema v2；可显式绑定一个云用户，绑定不改写 `GameState` 或工厂存档 |
| 已读版本公告 | `dsp-idle-network.release-notes.seen.v1` | 仅保存最近已确认的公告 ID，不属于游戏存档 |
| 内容包注册表 | 见 `contentPacks.ts` | 必须先于存档迁移加载 |

v33→v34 集中增加戴森壳层分配起点、微型黑洞三端口统计、传送带目标端口、时间扭曲主控与待处理时间预算，以及物流需求槽公平游标。旧壳层分配起点为 0；旧线路不重排；时间扭曲默认关闭且不改变原 1x/2x/4x 设置；新巨构不补发。迁移逐字段保留活动贡献、库存、实体、线路、载具、在途航线、科研、递归制造和戴森建设进度，并保持重复加载幂等。

v34→v35 只增加实体交互锁。所有旧实体迁移为 `interactionLocked=false`；已有 v35 的布尔值原样保留，非法值归一为 false。迁移不改变库存、缓存、线路、载具、航线、生产进度、科研、活动或戴森状态；云 schema 和 SQLite layout 不升级，服务端只补充字段类型与托盘 1 亿范围校验。

v35→v36 扩展建筑制造中心目标和任务，使 `logistics_drone` / `logistics_vessel` 可作为持久目标，并允许任务保存 `fleet` 入库步骤与实际递归配方决策。旧 v35 建筑目标和 WIP 原样保留；新字段缺失时使用空值。迁移器同时区分“有限资源显式剩余 0”与“旧存档没有储量字段”，避免枯竭矿脉重载后恢复。云 schema 与 SQLite layout 仍不升级，服务端只把合法客户端状态上限扩展到 v36。

`1.0.4` 不增加持久字段，也不升级 GameState v36。传送带 `lanes` 与建筑制造中心 `targetStock` 都是既有字段；本次只增加命令、UI 和新的合法上限。v1-v35 仍沿原迁移链进入 v36，既有库存、线路、在途物资、科研和制造 WIP 不重建。

`saveGame()` 先生成轻量 envelope、清理过期自动快照、写主存档并立即读回校验；只有校验成功才返回成功。配额错误只会从最旧自动快照开始清理并重试一次，绝不自动删除手动槽位或手动快照。最终失败不会中止模拟，但运行时必须持续显示导出提示，不能把“界面继续运行”误报成“已保存”。

### 离线结算

- 未暂停存档按离线秒数调用同一模拟器；长时间离线由 `offlineSimulation.worker.ts` 分批推进并回传进度。
- 主菜单只在 Worker 完整结束后一次性提交并保存结果；取消、刷新或失败不会写入半成品，也不会重复结算。
- Worker 与同步路径对 1 小时、8 小时、9 小时、24 小时、7 天和 30 天状态执行等价性校验，不能通过扩大时间步长改变物流、电力、缓存或科研顺序。
- 基础上限为 7 天，终局连续体研究每级增加 1 天，最高 30 天。
- 离线报告汇总新增物品、完成科技、戴森结构、终局研究和银河出口。
- 离开 72 小时以上会发放一次带领取凭据的基础回归物资。

### 云端

云端为每名用户保存 `main`、`1`、`2`、`3` 四个独立槽位，每个槽位分别维护完整导出 payload、元数据、修订号和最多 20 条历史。元数据包含 SHA-256、状态校验值、保存时间、状态版本、运行时长、设备/科技数量等安全摘要。上传必须携带该槽位的 `expectedRevision`，版本冲突返回 409；前端通过按槽位同步标记区分本地更新、云端更新和双向分叉，只有玩家明确选择后才推进修订。恢复历史版本会在同一槽位生成一个新修订，不会原地覆盖历史。排行榜只读取 `main`；主槽上传或恢复成功后在同一持久化流程中 upsert 排名，手动槽不会触发排名。

已登录云账号的工厂运行时每 10 分钟比较并上传一次 `main`，不再把邮箱验证作为云存档门槛。相同状态不重复创建修订；云端更新或双向分叉会停止自动覆盖并留下可见冲突状态。注册、登录、退出与自动上传不会下载、替换或删除本地主存档、三个本地槽、备份和快照；云端下载与历史恢复仍只由玩家显式触发，并在替换当前工厂前创建本地回滚快照。网络、邮件或服务端错误不会改变本地存档。手动槽位只接受玩家显式上传，不参与自动同步。

`src/game/cloud.ts` 的认证 token 使用“持久存储优先、当前页面内存回退”策略。正常情况下每次请求重新读取 `localStorage`，因此跨标签登录或退出可见；持久层拒绝写入或变为不可读时使用最后已知 token。显式清除失败时以内存空值作为权威状态，不能让残留旧 token 重新认证。

## 7. 云服务

`server/index.mjs` 是无框架 Node HTTP 服务，生产使用 `better-sqlite3`、WAL 和 `synchronous=NORMAL`。SQLite layout v2 在紧凑 `app_state` 中保存账号、会话、指标和云存档元数据，每个 `(user_id, slot, revision)` 的完整正文独立保存在 `cloud_save_payloads`。上传、恢复、历史裁剪和账号删除会把元数据与正文放在同一事务中；普通心跳和指标写入不再序列化全部历史正文。旧单行库首次加载时先提取并校验全部正文，再事务性写入 layout v2；`/api/health` 暴露 `storageLayoutVersion` 供运维确认。云 API schema 仍为 v7，在 v6 四槽结构之上增加忽略大小写的唯一用户名：新账号以用户名、显示名称和密码注册，邮箱初始为空；v1-v6 旧账号按用户 ID 确定性补充不暴露邮箱的唯一用户名，原邮箱、验证状态、密码、会话、主存档、三个手动槽、历史和排行榜记录保持原位。旧账号继续支持原邮箱登录。

API 表面：

- `GET /api/health`、`GET /api/public-status`
- `GET /api/admin/metrics`：至少 32 字符的管理员 bearer token
- `POST /api/analytics`：匿名批次、客户端序列去重和严格事件白名单
- `POST /api/presence`
- `POST /api/auth/register|login|logout|verify-email|resend-verification|forgot-password|reset-password`
- `GET /api/account`、`GET /api/account/sessions|export`、`POST /api/account/email|password|sessions/revoke|delete`
- `GET|PUT /api/cloud-save?slot=main|1|2|3`、`GET /api/cloud-save/history?slot=...`、`POST /api/cloud-save/restore?slot=...`
- `GET|POST /api/leaderboard`
- `POST /api/leaderboard/visibility`
- `POST /api/feedback`、`POST /api/errors`

密码使用 scrypt 派生并采用 timing-safe 比较；会话 token 和邮箱动作 token 只保存 SHA-256，登录会话默认有效期 30 天，邮箱动作链接有效期 30 分钟。注册与四槽云存档只要求安全入口和有效登录会话；排行榜匿名只读，加入要求有效登录会话和 `main` 存档，不要求邮箱验证。服务端忽略旧客户端携带的指标，统一从主云存档提取当前快照并保留由同一服务端策略观察到的历史峰值；启动时按用户 ID 排序幂等回填已有主存档。`leaderboardVisible=false` 会移除该账号的公开提交，后续主槽同步不会重新加入。`server/mail.mjs` 优先使用腾讯云 SES `SendEmail` 审核模板 API，分别传入验证或重置模板 ID 及单一 `actionToken` 变量；审核模板固定保留 `https://dsponline.cn` 域名和对应的 `verify` / `reset` 查询参数，不使用变量填充整个链接。凭据不完整时可以回退到原有 HTTPS webhook，二者都不可用时邮箱绑定、验证重发和找回密码明确返回不可用，但用户名注册、登录、四槽云存档、自动同步和排行榜继续可用。邮件失败日志只记录供应商错误码和 RequestId，不记录收件地址或动作 token。请求体上限为 8 MiB，认证接口每 IP/路径每分钟 12 次，新账号注册另按 IP 默认限制为每小时 3 个，其余接口 120 次。Origin 白名单、Nginx `client_max_body_size` 和前端 HTTPS 限制共同形成入口边界。

加载服务时会删除已过期或失去所属账号的会话、邮箱验证 token 和密码重置 token；运行期间每分钟再次清理并持久化。内存限流桶按自身窗口到期回收，不再随历史 IP/路径组合持续增长。仍有效的会话和动作 token 不受清理影响。

匿名心跳默认每 45 秒发送一次，服务端接口限流为每 IP 每分钟 10 次；同一浏览器 ID 去重，最近 120 秒有心跳视为在线。访问统计按 `Asia/Shanghai` 自然日聚合 PV、UV、会话、进入工厂、活跃秒数和允许的关键事件。服务端只保存带命名空间的 SHA-256 标识，不保存原始匿名 ID、鼠标坐标、按钮文案或存档内容。香港与上海数据库相互独立，因此统计也是节点级数据，不做跨节点合并。

## 8. 部署架构

- Nginx 静态根目录：`/var/www/dsp-idle/current`
- 云服务代码：`/opt/dsp-idle-cloud/current`
- 云数据库：`/var/lib/dsp-idle-cloud/cloud.sqlite`
- 云备份：`/var/lib/dsp-idle-cloud/backups`
- 云进程：绑定 `127.0.0.1:4320`，只能经 Nginx 暴露
- systemd：云服务自动重启；健康检查每两分钟访问本机 `/api/health`。
- 运维工具链：每日异地备份使用公钥认证加密，恢复节点每月在隔离目录启动临时 API 演练；五分钟节点探针检查公网端点、磁盘和 TLS，结果通过管理员指标读取。
- Nginx 模板对 JS、CSS、JSON、manifest、XML 和 SVG 启用 gzip，并保留 hashed asset immutable 与 `index.html`/`sw.js` no-cache 边界。
- Service worker 注册 URL 携带确定性 build ID，缓存命名也使用该 ID，避免版本切换后新旧应用壳混用。
- PWA 更新激活在整个页面生命周期只保留一个 `{ once: true }` 的 `controllerchange` 刷新监听器；重复点击可以再次通知 waiting worker，但不会累积未来的页面刷新回调。
- Electron 更新目录位于 `/downloads/desktop/<channel>/`；Android 更新清单位于 `/downloads/android/<channel>.json`。两端都只接受 HTTPS，正式制品必须保持平台签名连续性。公开文件由上海 `download.dsponline.cn` 托管，香港 `/downloads/*` 只重定向到该节点；Android 正式 APK 必须保持既有发布证书连续性，Windows 当前仍是明确标注的未签名测试包。构建、签名与更新目录规范见 [NATIVE_APPLICATIONS.md](./NATIVE_APPLICATIONS.md)。
- `scripts/build-platform.mjs` 不包含官方 API 或更新地址；官方 GitHub Actions 显式注入地址，`desktop/pack.cjs` 再把桌面云 API 和更新基址写入安装包元数据。普通社区构建保持空配置，不会继承官方账号或更新渠道。
- `scripts/generate-third-party-notices.mjs` 从根目录和云服务 lockfile 生成运行时依赖清单、完整许可证文本及随 `public/` 进入各平台构建的法律文件；CI 使用 `licenses:check` 验证确定性输出。

正式香港节点与上海旧节点各自运行本机 API 和数据库。上海不能反代或重定向到香港，否则会破坏当前备用入口边界。具体运行手册见 [DEPLOYMENT_OPERATIONS.md](./DEPLOYMENT_OPERATIONS.md)。

## 9. 当前结构性问题

- `App.tsx` 同时承担会话、画布、工作区和大量命令编排，应逐步拆成运行时 hooks 与工作区控制器。
- `engine.ts` 包含多个领域，应按“模拟内核、实体命令、电力、物流、科研、戴森”分模块，但保持公共确定性入口。
- `styles.css` 超过一万行，应按 shell、canvas、workspace、responsive 分层，并保留加载顺序测试。
- 云存档正文已经拆为独立 SQLite 行，消除了主要写放大；账号、会话和聚合指标元数据仍集中在一个紧凑 `app_state`，规模继续增长后再按观测结果拆表。
