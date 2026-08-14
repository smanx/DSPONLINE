# DSPidle2 1.0.42 Release Agent 交接（待重建）

> 当前结论：**No-Go**
> 原因：最终 1.0.41 香港热修和 1.0.42 补充需求已改变运行时，新的 clean SHA、Build ID、完整门禁和不可变制品尚未固定

旧 `1.0.42+8056d2cb0e1b` 交接已经失效，Release Agent 不得发布旧 Web/API/source 或原生诊断件，也不得复用其 Build ID、manifest、SHA-256 或 provenance。

新的交接将在开发侧完成以下事项后生成：

- 固定包含 `2e43f564…` 父级、UI 全面复核、35 MiB 本地存档恢复、增产剂 1 亿上限、无限矿物速通和时间扭曲检查点恢复的 runtime SHA。
- 在固定 SHA 上完成全量测试、生产构建、依赖审计和多浏览器 PWA 门禁。
- 重建并复验 Web、API、source、Android unsigned APK/AAB、Windows unpacked diagnostic，以及 manifests、SBOM 和 provenance。
- 写明存档结构、旧档迁移、云/本地兼容、性能影响、未解决风险、Web/API/Android/Windows 矩阵和回滚步骤。

在新的交接文档写入实际 SHA、Build ID 和逐制品 SHA-256 前，不得部署生产、更新下载页、覆盖 stable、修改玩家存档、恢复生产数据库或调整排行榜历史。
