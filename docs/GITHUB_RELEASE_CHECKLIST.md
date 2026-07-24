# GitHub 源码公开检查单

本项目采用 PolyForm Noncommercial License 1.0.0，应在仓库描述中使用 `source-available` 或“源码公开、禁止商业使用”，不要选择或宣传为 OSI 开源许可证。

源码仓库：[snowsnow0926/DSPONLINE](https://github.com/snowsnow0926/DSPONLINE)

## 首次上传前

- [ ] `git status --short` 只包含准备公开的修改。
- [ ] `npm run licenses:check`、类型检查、测试和生产构建通过。
- [x] 对完整 Git 历史运行 Gitleaks 或等效工具，不只扫描当前目录。
- [ ] 确认没有 `.env`、私钥、keystore、数据库、备份、日志、玩家存档和测试报告被 Git 跟踪。
- [ ] 任何曾经进入 Git 历史的真实凭据已经轮换；仅删除文件不算完成。
- [ ] README 中的版本、构建命令、许可证和官方/社区边界与当前代码一致。
- [ ] 官方 Windows/Android 下载仍保持关闭，直到长期签名和真机门禁完成。

## 创建仓库后

- [x] 设置准确的仓库描述和 topics，不勾选与实际许可证冲突的开源声明。
- [x] 在 `package.json` 增加真实 `repository`、`homepage` 和 `bugs` URL，并在应用内提供源码地址。
- [x] 启用 branch protection，要求 `verify` 通过后才能合并到 `main`。
- [x] 启用 Dependabot alerts、security updates、secret scanning 和 push protection。
- [x] 启用 GitHub Private vulnerability reporting。
- [x] 限制 GitHub Actions 默认 token 为只读，只向确实需要的发布 job 授予额外权限。
- [ ] 检查 Actions secrets 中只存在签名和发布所必需的值，并设置 environment protection。
- [ ] 创建首个源码公开标签和 release，附构建 SHA、测试结果和许可证说明。

## 每次发布

- [ ] 依赖锁文件和 `THIRD_PARTY_NOTICES.md` 同步更新。
- [ ] 社区构建在没有环境变量时不会连接官方 API 或更新源。
- [ ] 正式构建只由受保护 CI 注入官方地址，并保持平台签名连续性。
- [ ] 发布制品包含 `LICENSE`、`NOTICE` 和第三方许可证文本。
- [ ] 发布说明明确区分源码、未签名预览和官方签名安装包。
