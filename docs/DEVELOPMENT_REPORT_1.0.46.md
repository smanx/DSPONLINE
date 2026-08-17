# DSP极简网络 1.0.46 本地存档热修与发布前审计报告

审计日期：2026-08-17

状态：本地候选，未发布。没有访问生产节点、生产数据库、玩家存档、证书或签名密钥。

## 结论

1.0.46 修复了玩家报告的 durable 存档阻断：durable finalize、persistence Worker 或模拟 Worker 单次故障后，页面不再只能刷新；它保留 T0 recovery 和 pending intent，精确回放后验证 T1、原子替换 recovery head，并在同页安装新模拟 Worker。暂停状态保持，随后“继续模拟”可用。

默认保存保护模式仍拒绝保存中的编辑；旧 revision/head 一拍竞态不再把会话错误地锁死。实验性“保存期间允许继续操作”仍将已接受编辑保留在 durable 队列，失败时不回滚当前进度。纯挂机恢复日志、宏观进度和导出边界没有被清理捷径改变。

## 已验证

| 范围 | 本次结果 |
| --- | --- |
| TypeScript | `npm run typecheck` 通过 |
| 存档/恢复聚焦单测 | 123 passed |
| 全量 Vitest | 1,406 passed / 20 skipped |
| 服务端与空间站 | 357 passed / 2 skipped；station 3/3 |
| 运维与切换模拟 | ops 56 passed / 6 Linux-only skipped；release switch 29/29 |
| 原生静态安全 | 24/24 |
| Chromium | 407 passed / 14 explicit fixture skips / 0 failed |
| Web 生产预览 | PWA 1/1；画布性能 20/20 |
| Firefox / WebKit | 2/2 |
| 依赖与 Git | root/server `npm audit` 均为 0 漏洞；`git fsck` 无对象损坏 |
| 干净 Web 构建 | 1,959 modules；startup gzip 193,546 B；menu gzip 278,348 B |

Chromium 的 14 条跳过都需要未提供的真实大档或外部生产条件，不是失败。`git fsck` 列出历史不可达对象但没有 garbage 或损坏；为保护可恢复的本地历史，本次没有执行 Git 清理。

## 发现与处理

- P0 durable 恢复阻断：已修复并由 `v144-runtime-wal-integration.spec.ts` 5/5 覆盖，包括二次 persistence 故障、T1 已验证但 head rollover 失败和暂停后继续模拟。
- P1 Web 制品平台错配：发现隔离目录里旧 Android `dist` 会让 PWA 注册代码被编译剔除。已新增 `npm run build:web`，release gate 改为强制该命令并在构建后运行 production-preview PWA 生命周期门禁。
- P2 开发服务器日志噪声：全量开发 E2E 会记录预期的本地 API `ECONNREFUSED`，且在尺寸变化密集场景观察到非阻断的 `ResizeObserver loop` 浏览器诊断。所有断言通过；后续应在 production preview 独立采样后再决定是否改动 React Flow 的尺寸更新链。

## 残余风险与优化方向

1. 真实 36.7 MiB 玩家档没有提供给本会话。合成大档和恢复协议通过，但真实档的主动模拟、暂停、保存与纯挂机性能仍需要只读授权夹具验收。
2. `FactoryRuntime` 仍约 680 KB minified，主 CSS 约 607 KB；Vite 保留大 chunk 警告。优先把超大存档主动模拟/暂停的 long-task 采样做成固定门禁，再拆分 `App.tsx` 的 runtime persistence、Worker lifecycle 与 canvas presentation 边界。
3. 默认 auto canvas 路径性能通过；full 与 expand-all 是显式高成本模式，继续保留警告与设备级偏好，不能默认开启。
4. Android/Windows 的正式签名、实体设备、Linux systemd/Nginx 备份与切换、线上 smoke 和下载页更新均未执行，不能视为已发布或已签名。

## 发布交接

发布 agent 只能从干净、精确 SHA 的 checkout 重建：先运行 `npm run build:web`，再运行 production-preview PWA，生成并验证 manifest、SBOM、provenance，展开 API 并在临时 SQLite 下启动验证。只有在签名制品、备份 evidence、目标节点与明确发布授权齐全后，才可执行任何线上动作。详见 [RELEASE_HANDOFF_1.0.46.md](./RELEASE_HANDOFF_1.0.46.md)。
