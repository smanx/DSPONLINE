# 测试与发布基线

## 1. 当前自动化覆盖

| 层级 | 命令 | 当前规模 | 覆盖重点 |
| --- | --- | ---: | --- |
| 类型检查 | `npm run typecheck` | 全部前端 TS | 严格类型、Vite 配置 |
| 单元/领域 | `npm test` | 228 项 | 引擎、存档、主菜单只读存档索引、行星档案、渐进教学、内容、规划、全星球生产管理、网络、性能、战役、云同步与本地账号绑定等 |
| 浏览器 E2E | `npm run test:e2e` | 83 项 | 从开局到银河终局、桌面/移动交互、生产管理、渐进教学卡点定位、运营后台、账号安全、云冲突和真触摸手势 |
| 云服务 | `npm run test:server` | 16 项 | 账号验证/恢复/注销、设备会话、匿名统计、v3→v5 迁移、云存档、排行榜、邮件和管理员保护 |
| 运维工具 | `npm run test:ops` | 5 项 | SQLite 一致性快照、认证加密、异地复制、隔离恢复、篡改拒绝、Nginx 压缩与缓存边界、端点/磁盘探针和告警载荷 |
| 生产构建 | `npm run build` | 1 次构建 | `tsc -b`、Vite chunk 和 PWA 资源 |
| 桌面目录包 | `npm run desktop:pack` | 按需 | Electron 启动与 Windows 解包 |

Playwright 使用本机 Google Chrome，串行执行，并自动启动或复用 `127.0.0.1:4318`。失败时保留截图和 trace。

## 2. 日常开发最小矩阵

### 纯文档或 Skill

```powershell
git diff --check
```

再检查 Markdown 链接和 Skill validator。无需因文档改动重跑 83 项浏览器测试。

### 样式或单个面板

```powershell
npm run typecheck
npm run build
npm run test:e2e -- --grep "相关场景名称"
```

同时用 Playwright 截图检查桌面、手机竖屏和手机横屏。字体设置相关改动必须覆盖 80%、100%、125%、150%。

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

## 6. 测试结构改进

- 将 3000 多行 E2E 文件按 `menu-save`、`core-loop`、`logistics`、`mobile`、`endgame`、`operations` 分拆。
- 为云服务增加独立 API 测试文件和临时 SQLite 重启测试。
- 对存档 v1-v24 建立不可变 fixture 集，而不是只依赖测试内构造对象。
- 对关键视觉状态建立少量稳定截图基线，避免只检查元素存在。
- CI 同时运行前端单元、服务端测试和浏览器关键路径；完整 83 项可作为合并或夜间门禁。
