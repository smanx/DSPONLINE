# 参与贡献

感谢你改进 DSP极简网络。提交代码前请先阅读 [项目现状](./docs/PROJECT_STATUS.md)、[系统架构](./docs/ARCHITECTURE.md) 和 [测试基线](./docs/TESTING_RELEASE.md)。

## 开发流程

1. 从 `main` 创建范围清晰的分支。
2. 保持修改聚焦，不提交 `dist/`、`release/`、测试产物、数据库、日志、存档或密钥。
3. 涉及存档、模拟、云服务或部署时，补充对应失败路径和兼容测试。
4. 按改动风险运行测试，并在 Pull Request 中列出实际执行的命令和结果。
5. 不在 Issue、Pull Request、测试夹具或截图中提交真实玩家数据、访问令牌、邮箱、IP 地址或生产存档。

最低检查通常包括：

```powershell
npm ci
npm --prefix server ci
npm run typecheck
npm test
npm run test:server
npm run test:native
npm run test:ops
npm run build
```

共享玩法、存档和界面流程改动还应运行 `npm run test:e2e`。

## 权利与来源

提交者必须有权许可其贡献。不要复制无法明确再许可的代码、图片、声音、字体、数据或文案；引入第三方内容时，应同时提交来源、版本、许可证和必要的通知文本。

提交 Pull Request 即表示：

- 你确认贡献是你有权提交的原创工作，或已明确标注兼容的第三方来源；
- 你将贡献按本仓库的 PolyForm Noncommercial License 1.0.0 提供给公众；
- 你同时授予项目维护者永久、全球、非独占、免版税的权利，以使用、复制、修改、分发、再许可和在其他许可证（包括商业许可证）下提供该贡献；
- 你授予维护者实施该贡献必然涉及、且你有权许可的专利权利。

无法接受上述贡献条款时，请不要提交 Pull Request。

## 行为要求

讨论应围绕可验证的技术事实和具体改动。骚扰、歧视、泄露个人信息、恶意破坏测试或向生产服务写入测试数据不会被接受。
