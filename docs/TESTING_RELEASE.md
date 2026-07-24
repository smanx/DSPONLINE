# 测试与发布基线

## 1. 当前自动化覆盖

| 层级 | 命令 | 当前规模 | 覆盖重点 |
| --- | --- | ---: | --- |
| 类型检查 | `npm run typecheck` | 全部前端 TS | 严格类型、Vite 配置 |
| 单元/领域 | `npm test` | `1.0.0` / v34 431 项，1 项可选基准跳过 | 引擎、v1-v34 存档、物流索引等价、增产剂、无限科研、戴森复制、银河活动、生产刷新偏好、可配置缓存、离线 Worker 等价性、存档配额急救、科研、电力、蓝图、规划、网络与云同步等 |
| 浏览器 E2E | `npm run test:e2e` | `1.0.0` / v34 131 项 | 从开局到银河终局、终局巨构、戴森复制、时间扭曲、七档生产刷新、新旧手机壳、本地存档保护和桌面/手机横竖屏回归 |
| 云服务 | `npm run test:server` | `1.0.0` 31 项 | 用户名注册、四槽云存档、schema v3→v7、SQLite layout v1→v2、历史正文裁剪、设备会话、匿名统计、v34 校验、活动、腾讯 SES、排行榜邮箱门槛和管理员保护 |
| 运维工具 | `npm run test:ops` | 5 项 | SQLite 一致性快照、认证加密、异地复制、隔离恢复、篡改拒绝、Nginx 压缩与缓存边界、端点/磁盘探针和告警载荷 |
| 生产构建 | `npm run build` | 1 次构建 | `tsc -b`、Vite chunk 和 PWA 资源 |
| 桌面目录包 | `npm run desktop:pack` | 按需 | Electron 启动与 Windows 解包 |

Playwright 使用本机 Google Chrome，串行执行，并在隔离的 `127.0.0.1:4319` 自动启动临时 Vite 服务，避免复用玩家正在试玩的 `4318` 进程或其旧模块缓存。失败时保留截图和 trace。

## 2. 日常开发最小矩阵

### 纯文档或 Skill

```powershell
git diff --check
```

再检查 Markdown 链接和 Skill validator。无需因文档改动重跑 86 项浏览器测试。

### 样式或单个面板

```powershell
npm run typecheck
npm run build
npm run test:e2e -- --grep "相关场景名称"
```

同时用 Playwright 截图检查桌面、手机竖屏和手机横屏。字体设置相关改动必须覆盖 80%、100%、125%、150%、200%。

### 内容、配方、科技或 progression

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e -- --grep "matrix|technology|fabrication|campaign"
```

必须特别运行内容闭合审计、白糖 progression audit、手搓与对应矩阵产业链场景。

### 引擎、物流、电力或存档

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

存档结构变化还必须增加旧版本 fixture 的迁移测试，验证库存、设备、线路、科技、蓝图、队列和行星状态不丢失。

### 云服务

```powershell
npm run test:server
npm run test:ops
npm run typecheck
npm run build
```

新增 API 要覆盖成功、未认证、无效输入、冲突、限流/体积边界和持久化重启。不要在生产服务上运行写入测试。

### 正式发布

```powershell
npm ci
npm run typecheck
npm test
npm run test:server
npm run test:ops
npm run build
npm run test:e2e
```

桌面发布另加：

```powershell
npm run desktop:pack
# 需要安装包时
npm run desktop:dist
```

## 3. 关键回归清单

### 存档不丢失

- 继续游戏优先读取有效主存档。
- 主存档损坏时按备份、快照顺序恢复，并显示来源。
- 导入先预览版本、完整性和摘要，再由玩家确认。
- 云下载前创建本地快照；冲突不静默覆盖任一端。
- 更新后可以读取上一正式版本状态。
- 清空存档按钮不得被普通导航、开始新游戏或退出菜单间接触发。

### 生产正确性

- 相同 state + seconds 得到相同哈希。
- 库存、托盘、节点输入输出最终为非负整数。
- v32 两项建筑缓存设置默认均为 1,000,000；预设、自定义边界和非法输入必须覆盖。
- 熔炉/采集器使用生产上限，仓储/分流/物流站使用仓储物流上限；多输入、多输出和每个物流槽分别计算。
- 降低上限或减少堆叠不裁剪已有与在途库存；超额时停止新输入和派遣，调高后恢复。
- 配方切换、设备回收和升级会返还或保留所有物资。
- 无电、低电、缺料、堵塞、缺燃料状态与真实行为一致。
- 离线推进与前台推进使用同一规则。

### 线路正确性

- 同一建筑可建立第二、第三条合法输入/输出线路。
- 物流站不同槽位分别生效。
- 自动配方/物品匹配不覆盖已有明确配置。
- 字体倍率与缩放后，边端点仍贴合 handle。
- 节点移动时线路实时跟随，卡片拦截后方线路点击。
- 连接虚影、吸附、成功和失败反馈在鼠标与触摸端可见。

### 响应式与可访问性

- 360 px 以下顶栏仍可通过 overflow 到达全部工作区。
- 手机竖屏和横屏不发生施工栏、顶栏和抽屉互相遮挡。
- 方向切换保留视口、选中节点和打开面板。
- `Escape`、`Space/P`、`Ctrl/Cmd+K` 和焦点恢复正常。
- `prefers-reduced-motion` 与游戏内减少动效设置都能停用非必要动画。

## 4. 性能验收

- 运行 500 设备、1000 线路 E2E 场景。
- 运行 60 秒确定性基准和 2/8/24/72 小时挂机套件。
- 离线 Worker 覆盖 1 小时、8 小时、9 小时、24 小时、7 天与 30 天，并与同步路径逐字段或状态哈希等价。
- 后期样本存档至少运行 Chrome 与目标兼容浏览器各 30 分钟；记录强制 GC 后活跃堆、DOM、监听器、Worker、Renderer 和 GPU 趋势，不能用开发构建结果代替生产构建。
- 对比构建 chunk 大小，不接受无解释的显著增长。
- 测量正式入口冷加载、缓存加载、TLS 成功率和静态资源压缩。
- 检查 Worker 是否 active；回退到主线程时界面仍正确但应记录诊断。

Web 发布应至少记录：构建 ID、入口 HTML、主 JS/CSS 体积、压缩后体积、首屏请求数和目标网络的加载时间。

入口拆分还应直接检查 `dist/index.html`：主菜单不得 preload `FactoryRuntime`、`flow-vendor` JavaScript、`game-core` 或 `storage`。React Flow 基础 CSS 可以合并到首屏样式，但必须位于自定义画布样式之前，避免端口尺寸和位置被默认规则覆盖。

## 5. 版本发布清单

1. 工作树中的发布内容已经提交，提交可以完整重建产物。
2. 更新 npm SemVer，不直接使用 `GameState.version` 作为产品版本。
3. 任何状态变化都有迁移和兼容测试。
4. 生成生产构建并记录构建 ID、Git SHA 和发布时间。
5. 在隔离环境导入真实结构的脱敏旧存档。
6. 创建并验证生产数据库备份。
7. 先发布一个节点，完成烟测后再发布另一个节点。
8. 保留上一前端、后端发布目录和回滚命令。
9. 发布后观察错误、延迟、备份、磁盘和云冲突。
10. 只有验收完成后才创建正式标签和发布说明。

## 6. `0.2.0` 正式验收记录

以下结果针对最终发布提交 `e6e7daf113dc` 和 release ID `0.2.0-e6e7daf113dc`，不是沿用旧构建的历史结论：

| 检查 | 结果 |
| --- | --- |
| `npm ci` | 通过 |
| `npm run typecheck` | 通过 |
| `npm test` | 228/228 通过 |
| `npm run test:server` | 16/16 通过 |
| `npm run test:ops` | 5/5 通过 |
| `npm run build` | 通过 |
| `npm run test:e2e` | 83/83 通过 |
| Release manifest | 75 个文件验证通过 |

生产烟测覆盖 80%、100%、125%、150% 字体，390×844 手机竖屏、844×390 手机横屏、主菜单与工厂加载、上海 HTTP 云功能禁用、管理端点 `401` 保护、两地 schema v5 健康检查以及 JS/CSS gzip。发布证据与产物哈希见 [releases/0.2.0.md](./releases/0.2.0.md)。

## 7. `0.3.0` / v26 正式验收

以下结果针对已部署源码提交 `78881c908d70` 和 release ID `0.3.0-78881c908d70`：

| 检查 | 结果 |
| --- | --- |
| `npm ci` | 通过，0 个已知漏洞 |
| `npm run typecheck` | 通过 |
| `npm test` | 27/27 文件、241/241 通过 |
| `npm run test:server` | 16/16 通过 |
| `npm run test:ops` | 5/5 通过 |
| `npm run build` | 通过 |
| `npm run test:e2e` | 86/86 通过，串行约 4.1 分钟 |
| Release manifest | 80 个文件验证通过 |
| `git diff --check` | 通过 |

专项覆盖 v24 真实工厂迁移、v25→v26 无损迁移、非默认种子确定性、16 种生态目录、8 系 22 星、恒星亮度、独立戴森系统、中转路径、全域供电、科研预接线、科技建筑赠礼、递归小锤子、建筑制造中心、配送枢纽、线路框选升级、两次删除确认、移动载荷高亮、公告关闭、200% 字体、390×844 竖屏和 844×390 横屏。香港与上海均完成发布前一致性备份、远端后端 16 项复测、原子切换、schema v5 健康检查、管理端点 `401` 保护、JS/CSS gzip、桌面/手机横竖屏 Chrome 烟测；上海 HTTP 页面继续不提供密码输入。完整证据见 [releases/0.3.0.md](./releases/0.3.0.md)。

## 8. `0.4.0` / v28 / 云 schema v6 正式验收

以下结果针对已部署源码提交 `c77d76223f67` 和 release ID `0.4.0-c77d76223f67`：

| 检查 | 结果 |
| --- | --- |
| `npm ci` | 根项目与服务端通过，0 个已知漏洞 |
| `npm run typecheck` | 通过 |
| `npm test` | 27/27 文件、254/254 通过 |
| `npm run test:server` | 22/22 通过 |
| `npm run test:ops` | 5/5 通过 |
| `npm run build` | 通过 |
| `npm run test:e2e` | 93/93 通过，串行约 4.7 分钟 |
| Release manifest | 93 个文件验证通过 |
| 视觉检查 | 1280/1440 桌面、390×844 竖屏、844×390 横屏通过 |

专项覆盖第三批的矿机供电显示、双击缩放、生产区域、自动传送带、科研暂停和科技树滚动，以及第四批的 v27→v28 托盘上限迁移、巨构赠礼排除、星图工作区互斥、小型储物仓端口、80%-200% 字号布局、手机边缘拖动、四向分流器高/标准/低顺序与堵塞回退、旧账号邮箱绑定、四槽云存档隔离、十分钟主存档自动同步与冲突停机。邮件发送器关闭时，浏览器回归同时验证注册与找回入口显示开发中，现有账号仍可登录并进入云存档冲突处理。

香港与上海均完成发布前一致性备份、真实备份副本 schema `5→6` 隔离迁移、远端后端 22/22 复测、分阶段原子切换、schema v6 持久化检查、生产记录不减少审计、管理端点 `401` 保护、JS gzip 和桌面/手机横竖屏 Chrome 烟测。上海 HTTP 页面继续不渲染邮箱或密码输入框。完整证据见 [releases/0.4.0.md](./releases/0.4.0.md)。

## 9. 测试结构改进

- 将 3000 多行 E2E 文件按 `menu-save`、`core-loop`、`logistics`、`mobile`、`endgame`、`operations` 分拆。
- 为云服务增加独立 API 测试文件和临时 SQLite 重启测试。
- 对存档 v1-v31 建立不可变 fixture 集，而不是只依赖测试内构造对象。
- 对关键视觉状态建立少量稳定截图基线，避免只检查元素存在。
- CI 同时运行前端单元、服务端测试和浏览器关键路径；当前完整 113 项可作为合并或夜间门禁。

## 10. 第五批 / v29 本地验收（未发布）

本节记录第五批 v29 阶段性验收，不代表香港或上海已经更新；线上仍是 `0.4.0` / v28。

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 27/27 文件、258/258 通过 |
| `npm run build` | 通过 |
| `npm run test:e2e` | 95/95 通过，串行约 5.1 分钟 |
| `git diff --check` | 通过 |
| 视觉检查 | 1440×900、390×844、844×390；制造中心覆盖 80%-200% |

专项覆盖原生菜单拦截及输入白名单、灰锤单击递归定位、采矿/原油/抽水设备按量回收、第一指按建筑后第二指接管、移动画布节流与真实帧率降级、建筑制造中心真实 2× 节点、三颗指定外星球原油补充、殖民前哨完整需求，以及科技树纵向/斜向/边界滚轮隔离。v28→v29 fixture 验证重复加载不重复生成油井，并保留自定义旧油井储量。

当前机器未连接 Android 或 iPhone 真机，且没有 ADB；因此 Android Chrome 与 iPhone Safari 各连续 30 分钟的耗电、温度、帧率和卡顿对比尚未完成。Chrome 触摸仿真通过不能替代该发布前真机门禁。

## 11. `0.5.0` / v30 正式验收

以下结果针对已部署源码提交 `5b3a468c94d0` 和 release ID `0.5.0-5b3a468c94d0`。正式构建在独立干净 worktree 中完成，未中断玩家本地 `4318/4320` 开发服务。

| 检查 | 结果 |
| --- | --- |
| `npm ci` | 根项目与服务端通过，0 个已知漏洞 |
| `npm run typecheck` | 通过 |
| `npm test` | 27/27 文件、268/268 通过 |
| `npm run test:server` | 22/22 通过 |
| `npm run test:ops` | 5/5 通过 |
| `npm run build` | 通过 |
| `npm run test:e2e` | 97/97 通过，串行约 4.9 分钟 |
| Release manifest | 93 个文件验证通过 |

专项覆盖堆叠建筑逐台回收、星际站本地翘曲器自动补充、配送枢纽默认低优先级、生产区域八向桌面/触摸缩放、快速锤三态一致性，以及存档轻量化、自动/手动快照隔离、5 MiB 配额清理、QuotaExceeded 重试、读回校验和持续导出告警。真实 v26 附件从 1,365,050 字节的格式化 JSON 保存为 210,764 字节的紧凑 v30 JSON；原 189 个实体全部保留，按既有迁移规则补入 2 个确定性油井，119 条传送带以及库存、科研、物流和戴森状态保持一致，只有 180 条运行时生产曲线按设计清空。

香港与上海均通过 SQLite Backup API 创建并验证发布前一致性备份；两地上传的 Web、API 与 manifest 哈希均与本地制品一致。Web/API 已原子切换到 `0.5.0-5b3a468c94d0`，上一安全代码版本均保留为 `0.4.0-c77d76223f67`，数据库继续保持相互独立。两个服务均为 active、`NRestarts=0`，健康接口为 HTTP 200、SQLite schema v6，管理端点无凭据返回 401；香港 `www` 保持 301，两个节点的 JS/CSS gzip 与 hashed asset immutable 缓存正常，发布观察窗内没有 DSP 5xx。

正式入口浏览器烟测覆盖 1440x900 桌面、390x844 手机竖屏和 844x390 手机横屏。香港 HTTPS 登录表单可用且邮件能力继续明确标注“正在开发中”；上海 HTTP 页面不渲染密码输入框。真实 v26 附件还在隔离浏览器上下文中通过正式域名完成导入与保存，得到 211,891 字节的 v30 存档、191 个实体和 119 条传送带；该检查只写入隔离浏览器本地存储，没有使用生产账号或上传云存档。

尚未完成的质量记录仍是 Android Chrome 与 iPhone Safari 各连续 30 分钟的温度、耗电和真机帧率测试；本次已有玩家本地验收、Chrome 触摸仿真和正式域名横竖屏烟测，但不能把这些结果冒充真机长时间测试。完整制品、备份和回滚证据见 [releases/0.5.0.md](./releases/0.5.0.md)。

## 12. 手机新版壳层阶段 0-3 本地验收（未发布）

本节记录 2026-07-23 工作区中的 opt-in 移动壳层，不代表香港或上海已更新，也不改变 `GameState` v30 或存档格式。

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过 |
| `npm test` | 27/27 文件、268/268 通过 |
| `node --test server/analytics.test.mjs` | 3/3 通过 |
| 新版 focused Playwright | 9/9 通过 |
| 既有触摸/字体/工作区重点回归 | 8/8 通过 |
| `git diff --check` | 通过 |

新版用例覆盖 320×568、360×640、390×844、430×932、844×390、768×1024，80/100/125/150/200% 字体，经典/新版切换、五项导航、三档抽屉、移动建造/物资/检查器、44px 放置步进器、显式连续放置与布局模式、命令面板返回、详情层级与滚动恢复、全屏工作区首帧不透明、横竖屏世界中心与选中状态。既有回归另外覆盖单指平移、双指缩放、第二指从节点接管、56px 端口吸附、生产区域手柄、移动统计、星际工作区和大型工作区按需加载。截图输出包括：

- `artifacts/qa/mobile-next-desktop-1440.png`
- `artifacts/qa/mobile-next-portrait-390.png`
- `artifacts/qa/mobile-next-landscape-844x390.png`
- `artifacts/qa/mobile-next-font-200-390.png`
- `artifacts/qa/mobile-next-font-200-hub-390.png`
- `artifacts/qa/mobile-next-font-200-build-390.png`
- `artifacts/qa/mobile-stage2-build-390.png`
- `artifacts/qa/mobile-stage2-factory-390.png`
- `artifacts/qa/mobile-stage2-inspector-full-390.png`
- `artifacts/qa/mobile-stage3-technology-detail-390.png`
- `artifacts/qa/mobile-stage3-recipe-detail-390.png`
- `artifacts/qa/mobile-stage3-statistics-390.png`
- `artifacts/qa/mobile-stage3-star-system-390.png`

Chrome 桌面触摸仿真通过不等于 Android Chrome 或 iPhone Safari 真机门禁；阶段 4 的真机连续游玩、温度/耗电比较、低端设备长期性能和默认切换仍未完成。

## 13. `0.6.0` 第七批与新版手机界面正式验收

以下结果针对已部署源码提交 `ae779d297011` 和 release ID `0.6.0-ae779d297011`。应用 SemVer 为 `0.6.0`，GameState 仍为 v30、存档 envelope 仍为 v2、云 schema 仍为 v6。香港已发布，上海按本轮范围保持 `0.5.0`。

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 27/27 文件、272/272 通过 |
| `npm ci` | 根项目与服务端通过，0 个已知漏洞 |
| 服务端测试 | 本地与香港新 release 均为 22/22 通过 |
| 运维工具 | 5/5 通过 |
| `npm run build` | 通过 |
| `npm run test:e2e` | 108/108 通过，2 workers 约 5.0 分钟 |
| 新版手机 focused Playwright | 9/9 通过 |
| 正式制品清单 | `0.6.0-ae779d297011`，干净来源，98 个文件本地与香港复验通过 |

专项覆盖殖民费用从当前行星托盘与全局随身载具分源读取、缺载具零扣料、运输机与运输船消费、玩家主动满仓放下整组载荷、自动入库继续限容、有限/枯竭/真实无限资源统一判定、节点/检查器/统计一致显示、手机配方与物流目录不自动聚焦、桌面继续聚焦、小型储物仓 200% 字体输入输出分栏，以及七分区生产资料库、建筑实际配方速率、Mk.I/Mk.II/Mk.III 传送带 1/2/4 层吞吐和跨详情返回。

视觉检查包括：

- `artifacts/qa/production-library-building-1440.png`
- `artifacts/qa/mobile-stage7-building-codex-390.png`
- `artifacts/qa/mobile-stage7-library-844x390.png`
- `artifacts/qa/finite-resource-reserve-1440.png`
- `artifacts/qa/storage-mk1-font-200-1440.png`
- `artifacts/qa/release-notes-2026-07-23-v060-390.png`

正式构建在独立干净 worktree 中完成，没有结束或复用玩家当前的 `4318/4320` 进程。香港切换前通过 SQLite Backup API 创建 59,940,864 字节的 schema v6 一致性备份，并以全新 Web/API release 目录原子切换；当前回滚点为 `0.5.0-5b3a468c94d0`。公网根域名、健康接口、`www` 跳转、管理员 `401`、gzip、immutable/no-cache 边界以及桌面、新旧手机横竖屏均通过。上海公开 manifest 仍为 `0.5.0-5b3a468c94d0`，没有执行上传或切换。

Android Chrome 与 iPhone Safari 的 30 分钟真机温度、耗电、FPS、软键盘和 PWA standalone 仍未完成，因此新版继续 opt-in，不切为默认。完整制品、备份、回滚和生产截图证据见 [releases/0.6.0.md](./releases/0.6.0.md)。

## 14. `0.7.0` / v31 物流与工作区体验正式验收

以下结果针对已部署源码提交 `8bf16d91d82d` 和 release ID `0.7.0-8bf16d91d82d`。应用 SemVer 为 `0.7.0`，香港 GameState 升至 v31，存档 envelope 仍为 v2、云 schema 仍为 v6。香港已发布，上海保持 `0.5.0` / v30。

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 27/27 文件、282/282 通过 |
| `npm ci` | 根项目与服务端通过，0 个已知漏洞 |
| `npm run test:server` | 本地与香港新 release 均为 22/22 通过 |
| `npm run test:ops` | 5/5 通过 |
| `npm run build` | 通过 |
| 先前失败的物流/经典手机 focused Playwright | 7/7 通过 |
| `tests/e2e/v31-workspaces.spec.ts` | 5/5 通过 |
| `npm run test:e2e` | 113/113 通过，3 workers 约 5.3 分钟 |
| `git diff --check` | 通过 |
| 正式制品清单 | `0.7.0-8bf16d91d82d`，干净来源，98 个文件本地与香港复验通过 |

专项覆盖供需两端载具调度和归属、旧 `stationProgress` 首航迁移、逐行星视口、三种主题、建筑制造中心递归任务、分拣器退款迁移、科技树精简布局、所有主工作区再次点击关闭、堆叠容量以及物流站五槽顺序自动配置。完整 E2E 同时回归经典/新版手机、80%-200% 字体、线路端点、星图互斥、旧存档迁移、有限资源、云存档和大型工作区。

视觉检查产物：

- `artifacts/qa/v31-light-theme-1440.png`
- `artifacts/qa/v31-light-factory-1440.png`
- `artifacts/qa/v31-technology-compact-light-1440.png`
- `artifacts/qa/v31-light-mobile-390.png`

香港切换前通过 SQLite Backup API 创建 59,940,864 字节的 schema v6 一致性备份，并验证 SHA-256、权限和可读性。Web/API 上传到全新 release 目录，服务器逐项复验 98 个 manifest 文件和 5 个入口资源后由固定工具原子切换；当前回滚点为 `0.6.0-ae779d297011`。公网根域名、`www` 跳转、健康接口、管理员 `401`、gzip、immutable/no-cache 边界以及桌面、新版手机横竖屏均通过，最近两个 access log 各 500 条没有 5xx，云服务 `NRestarts=0`。上海公开 manifest 仍为 `0.5.0-5b3a468c94d0`，没有执行上传、切换或数据库操作。

完整 E2E 的 Vite 测试服务器在两个页面卸载时报告过非阻断的 `ResizeObserver loop completed with undelivered notifications`，全部 113 项断言和进程退出码仍为成功。生产浏览器烟测使用全新隔离上下文并拦截匿名 presence/analytics 写入，不使用生产账号、不上传云存档，也不清理玩家浏览器存档。完整制品、备份、回滚和截图证据见 [releases/0.7.0.md](./releases/0.7.0.md)。

## 15. `0.8.0` / v32 模拟、离线与缓存治理正式验收

以下结果针对源码提交 `2af7dc15eebbd5aa240213d7c40ab36ce8430844` 和 release ID `0.8.0-2af7dc15eebb`。GameState 升至 v32，存档 envelope 仍为 v2、云 schema 仍为 v6；同一制品已发布到香港与上海独立节点。

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 31/31 文件、320/320 通过 |
| `npm run test:server` | 23/23 通过，包含 v32 两项缓存值云端范围验证 |
| `npm run test:ops` | 5/5 通过 |
| `npm run build` | 通过；独立离线 Worker 与实时模拟 Worker 均生成生产 chunk |
| `npx playwright test --workers=1 --reporter=line` | 118/118 通过，约 6.3 分钟 |
| v32 缓存设置 focused Playwright | 2/2 通过；桌面、经典手机、新版手机和 80%-200% 字体 |

缓存专项覆盖默认 100 万、1万/10万/100万预设、自定义最小/最大值、空值、小数、负数、指数、非数字与越界错误；生产/仓储物流分类、多输入/多输出逐项容量、物流槽手动上限、降限超额、升限恢复、减堆、采矿/原油/抽水、在途物流、v31→v32 迁移、主存档、手动槽和导入导出。服务端拒绝缺字段、非整数和超范围 v32 云存档。

离线 Worker 对 1 小时、8 小时、9 小时、24 小时、7 天和 30 天与同步路径逐字段等价；取消用例确认不会保存半成品。后期样本存档仅在隔离本地浏览器中只读加载，报告位于：

- `artifacts/performance/memory-chrome-production-30m.json`
- `artifacts/performance/memory-360-production-30m.json`

Chrome 147 的强制 GC 活跃堆从 14.06 MiB 到 16.23 MiB（+2.17 MiB），Renderer 工作集从 323.40 MiB 到 321.99 MiB；360/Chromium 132 从 17.31 MiB 到 19.18 MiB（+1.87 MiB），Renderer 工作集从 541.11 MiB 到 574.29 MiB且中途峰值约 685 MiB后回落。两者 DOM、监听器增量均为 0，Worker 始终为 1。现有 30 分钟证据未显示持续 JS/DOM 泄漏，但 360 原生/GPU 占用仍需更长时间和真实玩家环境继续观察，不能宣称所有内存风险已经消失。

缓存设置截图：

- `artifacts/qa/v32-buffer-settings-desktop-font-80.png`
- `artifacts/qa/v32-buffer-settings-desktop-font-200.png`
- `artifacts/qa/v32-buffer-settings-desktop-custom-font-200.png`
- `artifacts/qa/v32-buffer-settings-legacy-font-80.png`
- `artifacts/qa/v32-buffer-settings-legacy-font-200.png`
- `artifacts/qa/v32-buffer-settings-legacy-custom-font-200.png`
- `artifacts/qa/v32-buffer-settings-next-font-80.png`
- `artifacts/qa/v32-buffer-settings-next-font-200.png`
- `artifacts/qa/v32-buffer-settings-next-custom-font-200.png`

完整 E2E 的 Vite 测试服务器仍可能在页面卸载时报非阻断 `ResizeObserver loop completed with undelivered notifications`；118 项断言和最终进程退出码均成功。Android Chrome 与 iPhone Safari 真机温度、耗电和 30 分钟交互门禁仍未完成。

正式发布清单包含 100 个文件，聚合 SHA-256 为 `0557dfb7ba5a7cf08e7a95dec73dca560a409e8fa4398d94a7a2ba760341e273`。香港与上海收到的 Web/API 归档哈希均与本地一致，解包后均通过逐文件复验；新 API release 在两地分别再次通过 23/23 服务测试。

两地切换前均使用 SQLite Backup API 创建一致性备份并通过 `quick_check`。切换后备份与当前库的 schema、账号、会话、云存档和修订记录没有减少；上海匿名玩家与错误记录保持一致，香港只出现发布窗口内正常新增匿名玩家。两地均由固定工具原子切换，香港回滚点为 `0.7.0-8bf16d91d82d`，上海回滚点为 `0.5.0-5b3a468c94d0`，数据库未恢复、替换或初始化。

公网验收中，两地根页面、manifest 与健康接口均为 200，SQLite schema v6；香港 `www` 为 301，管理员端点无凭据为 401。两地 JS 返回 gzip 与 immutable 缓存，HTML 和 `sw.js` 保持 no-cache；云服务均为 active、`NRestarts=0`、近期 journal 无 warning，DSP 专用 access log 最近 500 条均无 5xx。上海仍由本机独立提供 Web/API，公开 HTTP 页面继续禁用云账号凭据传输。完整证据见 [releases/0.8.0.md](./releases/0.8.0.md)。

## 16. `0.8.1` / 云 schema v7 账号与云存档正式验收

以下结果针对源码提交 `db8beebf9ef4a3433c0245897fe217ff9096eb58` 和 release ID `0.8.1-db8beebf9ef4`。GameState 保持 v32、存档 envelope 保持 v2，云 schema 从 v6 升至 v7；同一制品已发布到香港与上海独立节点。

| 检查 | 结果 |
| --- | --- |
| 根目录 `npm ci` | 402 个包，0 个已知漏洞 |
| 服务端 `npm ci` | 76 个包，0 个已知漏洞 |
| `npm run typecheck` | 通过 |
| `npm test` | 31/31 文件、320/320 通过 |
| `npm run test:server` | 23/23 通过 |
| `npm run test:ops` | 5/5 通过 |
| `npm run build` | 通过 |
| `npm run test:e2e` | 119/119 通过，约 5.5 分钟 |
| `git diff --check` | 通过 |

服务端专项覆盖用户名注册、大小写唯一、无邮件发送器时的全部四槽云存档、主槽历史恢复、注册限流、旧邮箱登录、邮箱排行榜门槛、schema v3→v7 归一化及重启持久化。浏览器专项会真实创建本地主存档和三个本地槽，完成注册、退出及重新登录后逐字比较四份 localStorage 数据，确认账号操作不改写或清除本地进度。

香港和上海分别在 schema v6→v7 前、最终修订切换前及上线后通过 SQLite Backup API 创建一致性快照。隔离迁移审计确认旧账号身份字段及全部云存档 payload 哈希不变，账号、会话、主存档、三个手动槽、历史、排行榜和匿名玩家记录没有减少。上线过程中没有恢复数据库、上传测试存档或使用生产账号执行写测试。

两地 Web/API 均指向 `0.8.1-db8beebf9ef4`，安全回滚点均为 `0.8.1-3ca6ae3876d5`。两个服务均为 active、`NRestarts=0`，健康接口报告 SQLite schema v7 和 disabled 邮件 provider；正式根域名、上海入口、manifest、gzip、immutable/no-cache、管理员 401、近期 error/5xx 日志和 390px 无横向溢出均通过。上海 HTTP 页面继续不渲染密码输入框。完整制品、备份哈希和回滚证据见 [releases/0.8.1.md](./releases/0.8.1.md)。

## 17. `0.9.0` / v33 正式验收

以下结果针对源码提交 `47a97f2c565ec5f6803cf7c9c71f47f24f414125` 和 release ID `0.9.0-47a97f2c565e`。应用 SemVer 为 `0.9.0`，GameState 从 v32 升至 v33，存档 envelope 保持 v2，云 schema 保持 v7；同一制品已发布到香港与上海独立节点。

| 检查 | 结果 |
| --- | --- |
| 根目录 `npm ci` | 通过，0 个已知漏洞 |
| `npm run typecheck` | 通过 |
| `npm test` | 38/38 文件、408/408 通过，1 项可选物流基准跳过 |
| `npm run test:server` | 27/27 通过 |
| `npm run test:ops` | 5/5 通过 |
| `npm run build` | 通过 |
| `npm run test:e2e` | 126/126 通过 |
| 离线等价 | 1 小时、8 小时、9 小时、24 小时、7 天、30 天全部通过 |
| `git diff --check` | 通过 |

生产刷新专项覆盖自动、100、200、500、1000、1500 和 3000 ms 七档。偏好保存在设备本地，不进入 GameState 或云存档；固定档不会被自动系统覆盖，实体与线路合计达到 180 时也不再强制切到 3 秒。模拟 Worker 继续按真实时间推进，状态发布和视觉动画独立；库存数字只使用真实状态，生产进度在相邻快照之间插值，选中实体和检查器使用优先发布路径。

后期样本短测使用当前星球 56 个节点、84 条线路，全部档位保持单 Worker，Worker 往返中位数为 11.6～18.3 ms。8 秒采样中的主线程任务占比与强制 GC 堆变化受启动、GC 和页面活动噪声影响较大，不能据此宣称刷新间隔带来线性 CPU、内存或耗电收益；原始结果保存在 `artifacts/performance/refresh-profiles-v090.json`。

物流索引在 10、50、100、500 塔规模上与旧扫描路径状态哈希一致。500 塔中位数从 3915.63 ms 降至 768.45 ms，P95 从 4693.25 ms 降至 1076.01 ms；候选扫描从 21,205,000 次降至 597,220 次，路线经济计算从 533,481 次降至 78,251 次。该数据是本机确定性基准，不等同于所有玩家设备的帧率提升。

现有生产内存证据仍采用 Chrome 与 360 各 30 分钟强制 GC 趋势：活跃堆分别增加 2.17 MiB 与 1.87 MiB，DOM 和监听器均无增长；360 Renderer 私有内存仍需更长时间观察。当前没有 Android 或 iPhone 真机，因此真机温度、耗电、Safari/PWA standalone 和连续 30 分钟交互仍是明确门禁缺口。

正式发布清单包含 105 个文件，聚合 SHA-256 为 `a9506c676f7db42e70bef2c655646cc726d2d929edb892c8098bc42374ad6da7`。两台服务器收到的 Web/API 归档哈希均与本地一致，解包后逐文件复验通过；新 API release 在两地分别再次通过 27/27 服务端测试，并用各自发布前备份的临时副本在隔离端口确认 schema v7 和活动关闭状态。

两地切换前后均使用 SQLite Backup API 创建一致性快照并通过 `quick_check`。香港发布窗口内账号、会话、主云存档和修订只发生正常新增，没有减少；上海账号与云存档仍为空，匿名玩家和错误记录保持一致。两地均由固定工具原子切换，安全代码回滚点均为 `0.8.1-db8beebf9ef4`，数据库未恢复、替换或初始化。

公网验收覆盖正式根域名、`www` 跳转、上海独立入口、manifest、健康接口、管理员 `401`、gzip、immutable/no-cache、活动关闭、服务 active、`NRestarts=0` 和专用访问日志 5xx。隔离 Chrome 上下文覆盖 1440×900 与 390×844，两地均无横向溢出或页面错误；香港 HTTPS 显示密码登录，上海 HTTP 不渲染密码输入框。截图位于 `artifacts/qa/production-0.9.0/`，完整制品与备份证据见 [releases/0.9.0.md](./releases/0.9.0.md)。

## 18. `0.9.1` 联合空间站活动正式验收

`0.9.1` 保持 GameState v33、存档 envelope v2 和云 schema v7。正式制品来自提交 `d3a90c389ed4743b0a1e907c351f1c624e50162c`，release ID 为 `0.9.1-d3a90c389ed4`；同一制品已发布到香港与上海独立节点。

| 检查 | 结果 |
| --- | --- |
| `npm ci` | 通过，402 个包，0 个已知漏洞 |
| `npm run typecheck` | 通过 |
| `npm test` | 38/38 文件，410/410 通过，1 项可选基准跳过 |
| `npm run test:server` | 28/28 通过 |
| `npm run test:ops` | 5/5 通过 |
| `npm run build` | 通过 |
| `npm run test:e2e` | 127/127 通过 |
| 巨构制造/活动专项 | 175/175 Vitest、4/4 活动服务测试和 focused Playwright 通过 |

专项浏览器路径覆盖桌面施工托盘制造与部署、点击巨构直达银河任务页、任务页暂停/恢复和定位入口、新版手机搜索/放置/点击任务页、44px 控件和横向溢出。更新公告覆盖 1440 桌面、390×844、844×390 和 360×480/200% 字体。截图位于 `artifacts/qa/v091-*` 与 `artifacts/qa/release-notes-2026-07-24-v091-*`。

服务端活动测试锁定四项各 10 亿全服模拟目标、四项各 100 万个人目标、精确 72 小时、确定性单调曲线、结束冻结和非法配置拒绝。HTTP 安全测试确认匿名 `/public-status` 可读，但账号会话仍拒绝在非本地 HTTP 页面建立。

正式清单包含 104 个文件，聚合 SHA-256 为 `81b16a02919bebce116542bcd618406575aa6922523a02af9916fa913dc537c7`。两地未激活目录分别通过 28/28 服务测试、逐文件清单复验和发布前备份副本隔离启动，随后由固定工具原子切换；安全代码回滚点均为 `0.9.0-47a97f2c565e`。

两地切换前后均通过 SQLite Backup API 创建一致性快照并完成 `quick_check`。香港发布窗口内账号、会话、云存档和修订只发生正常新增，没有减少；上海记录保持不变。数据库没有被恢复、替换、初始化或写入测试存档。

活动 ID 为 `union-station-2026-07-v1`，revision 为 `e227b03a6fbd4d148b3f07ad`，两地 UTC 起止时间一致且相差精确 259,200,000 ms。公网状态已从 `scheduled` 自动切换为 `active`，全服模拟曲线开始单调增长。

公网验收覆盖正式根域名、`www` 跳转、上海独立入口、manifest、健康接口、管理员 `401`、gzip、immutable/no-cache、服务 active、`NRestarts=0` 和最近 500 条访问日志 5xx。隔离 Chrome 使用香港 1440×900 桌面和上海 390×844 新版手机实际完成“放置巨构 → 点击巨构 → 打开任务页 → 开始提交”，没有发出生产写 API；手机触控目标不小于 44px且无横向溢出。截图位于 `artifacts/qa/production-0.9.1/`，完整证据见 [releases/0.9.1.md](./releases/0.9.1.md)。

## 19. `1.0.0` / v34 正式验收

正式源码提交为 `01492dea3c513392fb3336daae24c742aac320ce`，release ID 为 `1.0.0-01492dea3c51`。应用 SemVer 为 `1.0.0`，GameState 从 v33 升至 v34，存档 envelope 保持 v2，云 API schema 保持 v7；SQLite 内部存储从单行 layout v1 升至元数据/正文分离的 layout v2。

| 检查 | 结果 |
| --- | --- |
| 根目录 `npm ci` | 457 个包，0 个已知漏洞 |
| `npm run typecheck` | 通过 |
| `npm test` | 42/42 文件、431/431 通过，1 项可选物流基准跳过 |
| `npm run test:server` | 31/31 通过，包含 v34 云存档范围、layout v1→v2 和历史正文裁剪 |
| `npm run test:ops` | 5/5 通过 |
| `npm run test:native` | 2/2 通过 |
| `npm run build` | 通过；最终 `dist/` 为普通 Web 构建 |
| `npm run test:e2e` | 131/131 通过，约 5.8 分钟 |
| v34 focused Playwright | 3/3 通过 |
| `npm run benchmark:logistics` | 5/5 通过，10/50/100/500 塔状态哈希一致 |

500 塔三秒模拟中，旧全扫描路径中位 7825.22 ms、P95 7844.72 ms；索引路径中位 2533.66 ms、P95 2589.05 ms，中位改善 67.62%。候选检查从 20,000,000 降至 562,560，路线经济计算从 500,482 降至 78,375。该结果是本机确定性基准，不等同于所有设备的帧率或耗电改善。

视觉门禁覆盖 1920×1080、1536×864、1280×720、1024×768、960×540、390×844、430×932、844×390、768×1024 和 100%～200% 字体；重点确认两座终局巨构、戴森规划固定命令条、1.0 公告、横屏建造搜索结果、触控尺寸和无横向溢出。截图位于 `artifacts/qa/v100-*.png` 与 `artifacts/qa/release-notes-2026-07-24-v100-*.png`。

Windows `release/win-unpacked` 已生成，EXE 产品版本为 `1.0.0.0`，但 Authenticode 为 `NotSigned`。Android unsigned Release APK 为 4,103,392 字节，AAB 为 3,917,492 字节；包名 `cn.dsponline.network`、versionName `1.0.0`、versionCode `1000000`、minSdk 24，`apksigner` 正确拒绝 APK。两类制品只用于本地编译门禁，不得进入 VPS 公共更新源。

完整 E2E 仍出现已知非阻断 Vite `ResizeObserver loop completed with undelivered notifications` 卸载提示，但 131 项断言和最终退出码成功。Windows 正式证书、Android 长期 keystore、物理 Android/iPhone 各 30 分钟温度耗电和 PWA standalone 仍是明确缺口。

发布清单包含 115 个文件，聚合 SHA-256 为 `fcf72ad88bc6a8d610715f496931d359ade4aa4b32be4f8c74bd533d6485cc97`。Web/API 归档哈希分别为 `82fe7d3da12e20b56264978d31662bcee3696bb0a411bc7f0fe568757b1af721` 和 `2ccf439bad6bc662b9713298fde8d45c3317e621e201e811d6f7783644a00c92`；两地未激活目录分别通过 31/31 服务测试和 115 文件逐项复验。

香港真实备份副本迁移后，551 个修订正文与元数据逐键、大小和 SHA-256 一致，`app_state` 从 136.8 MB 降至约 2.55 MB。正式观察 240 秒内 24/24 健康请求成功，最大 10.407 ms、`NRestarts=0`、RSS 约 133～162 MB；上海 140 秒内 14/14 成功，最大 1.506 ms、`NRestarts=0`、RSS 约 65～66 MB。两地上线后备份均为 layout v2 且元数据修订数与正文行数一致。

公网验收覆盖香港根域名、`www` 301、上海独立入口、两地健康接口 layout v2、管理员 401、gzip、immutable/no-cache、活动 revision、服务/timer active、journal warning 和最近 500 条访问日志 5xx。旧 API 不能读取 layout v2 正文，因此两地回滚目标只回退 Web，API 固定保留当前实现。完整证据见 [releases/1.0.0.md](./releases/1.0.0.md)。
