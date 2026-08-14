# DSPidle2 1.0.42 Release Agent 交接

> 交接日期：2026-08-14
> 固定运行时源码：`c24e6247d2572e54e30e173d3e16bfd85829b92f`
> Build ID：`1.0.42+c24e6247d257`
> 分支：`codex/1.0.42-ui-review`
> 候选目录：`D:\GameDev\DSPidle2-v142-release\1.0.42-c24e6247d257`
> 当前结论：开发侧完成；正式签名、真实设备、Linux 发布控制和生产灰度完成前保持 **No-Go**

## 1. 交接结论

1.0.42 已从最终香港 1.0.41 P0 热修 `2e43f564…` 重新固定，不会回退在线云正文定向回收或微型黑洞显式字段。代码、文档、完整自动化、production build、Web/API/source 归档、Windows unpacked 诊断、Android unsigned APK/AAB、source manifest、conditional skip 报告、SBOM、candidate manifest 和 provenance 已完成并复验。

运行时提交之后会有一个只更新交接证据的文档提交。Release Agent 必须以 `c24e624…` 构建运行代码，以 `1.0.42+c24e6247d257` 作为 Build ID；不得用后续文档 SHA 重建同名制品。旧 `8056d2cb… / 1.0.42+8056d2cb0e1b` 候选已经作废，禁止发布或复用其清单。

开发阶段没有连接生产、部署、切流、更新下载页、写玩家存档/账号/数据库、修改云历史或排行榜。附件 35 MiB 存档只读检查前后 hash 不变，且未进入 Git/制品。

## 2. 本版交付

### 既有 1.0.42 UI 范围

- 动态壳层安全区、80%～200% 字号和窄屏重排。
- 手机命令面板原子导航、44px 触控目标。
- 工作区背景 inert、焦点圈定/恢复、统计语义与亮暗主题对比度。
- 中文 composition 和非敏感页面草稿保护；密码不共享/不持久化。
- 教程应用版本与内容 revision 分离。

### 新补充范围

- 同一 writer 大档超时续租；真实其他 writer 仍由 fencing token 拒绝。
- 冲突恢复按钮有处理中/成功/失败/重试，当前为空时推荐候选；提交后逐字读回、checksum、模式、revision 验证，再清理副本。
- 增产剂缓存 100 万预设、1～1 亿自定义正整数；倍率/消耗/补充和普通输入容量不变。
- 无限矿物 speedrun main 可提交，服务端权威派生并公开标记；普通、实验、MOD、内容包、极限和非标准难度仍拒绝。
- orphaned time-warp 只保留真实墙钟时间进入普通离线，高倍率未提交 debt 不发放；journal 不可用时显式恢复或取消。

## 3. 存档结构、迁移与兼容

| 边界 | 1.0.42 结论 |
| --- | --- |
| GameState / envelope | v46 / v2，不变；无新增必填字段 |
| cloud / SQLite | schema v7 / layout v2，不变；不迁移生产 DB |
| IndexedDB | records 结构和版本不变；主档/备份/快照/三个槽位字节合同不变 |
| normal/speedrun | main/1/2/3、本地/云/导入导出/删除/恢复继续隔离 |
| 旧存档 | 稠密/稀疏 v46 继续读取；旧增产剂值原样有效 |
| 历史速通 | 缺 `resourceMode` 按 finite；不重算时间、rank 或成绩 |
| pure-idle journal | schema 不升级；新 inspection 只区分状态和 checkpoint 指纹 |
| 时间线 | 同一 pending wall 区间只进入纯挂机恢复或普通离线之一 |

无一次性存档迁移和备份复制。恢复/冲突失败不会写现有主档，候选只在成功读回后清理。不得通过清 IndexedDB/localStorage 处理玩家冲突。

## 4. Web/API/Android/Windows 矩阵

| 目标 | 候选状态 | Release Agent 必做 |
| --- | --- | --- |
| Web/PWA | 通用 Web tar、Build ID、PWA production preview 已验 | 新不可变目录；先验证 API 兼容，再原子切 HTML/manifest/SW/assets；检查 previous-stable 和离线重开 |
| API | 162 文件，临时 SQLite health 200/schema 7/layout 2 | **必须更新**：旧 API 不接受 >100,000 增产剂值且拒绝无限矿物速通；先未激活部署，再切 Web |
| Android | unsigned APK/AAB，1.0.42/1000042，zipalign/lint 通过 | 用批准长期证书和正式 HTTPS 配置重建；验 v2/v3、证书连续性、1.0.41→1.0.42 覆盖升级和真机 |
| Windows | unpacked、PE/ASAR/Build ID/48 MiB 合同/隔离启动通过 | 注入正式 HTTPS API/update URL，生成 setup/feed；记录 Authenticode/SmartScreen、覆盖升级和低配结果 |

1.0.42 API 对旧客户端向后兼容。旧 1.0.41 客户端读取新 v46 云档不会因 schema 失败，但会把大于 100,000 的增产剂偏好夹回旧上限；继续保存可能降级该设置。发布说明应提示多设备玩家更新客户端。

## 5. 修改文件入口

相对最终 1.0.41 香港热修为 114 文件、`+3361/-501`：

```text
git diff --name-status 2e43f5644241a1d8bf30d476007b58c2b8eead97..c24e6247d2572e54e30e173d3e16bfd85829b92f
```

关键文件与完整需求—证据矩阵见 [开发总纲](./1.0.42_UI_REVIEW_DEVELOPMENT_PLAN.md) 和 [候选记录](./releases/1.0.42-candidate.md)。新增核心入口为 `localSaveCoordination.ts`、`localSaveStore.ts`、`LocalSaveWriterBanner.tsx`、`offlineTimeWarpRecovery.ts`、`pureIdleRecovery.ts`、`StartMenu.tsx`、`OperationsWorkspace.tsx`、`GalaxyWorkspace.tsx`、`server/index.mjs` 与 `server/http-security.mjs`。

## 6. 门禁证据

| 门禁 | 结果 |
| --- | --- |
| clean install / production audit | root 456、server 75；生产依赖 0/0 |
| licenses / typecheck | 125；通过 |
| Vitest | 1,231/18；140 文件通过/6 跳过 |
| Server | 356/2 |
| Ops | 55/6（Linux 专属） |
| Native | 24/24 |
| Chromium | 353/9；362 总项；999.3 秒 |
| Firefox/WebKit | 2/2 |
| production-preview PWA | 1/1 |
| build | 1,928 模块；startup 185,929 B；menu 281,809 B；forbidden 0 |
| API smoke | 162 文件；health 200；schema/layout 7/2 |
| Android | bundle/assemble/lintVital/zipalign；unsigned 校验符合预期 |
| Windows | 1.0.42/1.0.42.0；ASAR Build ID；48 MiB；4 进程 smoke；NotSigned |

所有失败计数为 0。写测试只使用合成账号、临时 SQLite、浏览器临时 IndexedDB；35 MiB 自动化夹具由运行时生成。真实附件只读结论：35.004 MiB、envelope v2、GameState v46、checksum 有效、27,153 实体、48,917 线路、无重复 ID/缺失端点，正式检查约 35.9 秒。

## 7. 不可变制品与 SHA-256

| 制品 | 字节 | SHA-256 |
| --- | ---: | --- |
| source | 6,147,615 | `bcf9d519a0de88aa5e6a4d2630cf5cfe227deebd8493d4a247278336db2fee82` |
| Web | 1,461,347 | `c6a0159c1daab1f68f5c0fbd71e24c6035aaf524dba9f8a46569562f28c74c35` |
| API expanded | 629,286 | `42e0aee59e3ca07184d9f70a56f1eb22f4e92b94f9976d698ca40bb2c6d3e669` |
| Windows unpacked diagnostic | 150,180,934 | `0be37a88082e9a7c57f64246ce4a2882ddb2b0928b747595ec90949689043938` |
| Android APK | 4,835,923 | `195922441fe08863c35cfd43280a6f333e715f1ef9fd7f5409e687e42eba42e3` |
| Android AAB | 4,650,691 | `f98bbd66f0d395668f9524ba1df77d8aa52e3dd1e734ef75eed59b5fb66b6c7e` |
| source manifest | 36,227 | `948731fe94b62f967b0c2d722be4a44d59039139314b3942ec4ce0292f05d068` |
| conditional skips | 3,438 | `fb205e0951ef6c4005326e2978a39b4fcdb0dfd338ba90a16a6a1449e41f9d2b` |
| SBOM | 407,391 | `818d9aa5d05163f10b98a8994a821cc27e2527b89c1b79c403cfb8463255c38f` |
| source verification | 176 | `6d0aa0f6aa6c8c3d232be33404009bd13532d345ee4e504b676a96901a7b50e7` |

candidate manifest：10/10，SHA-256 `830717f743403d86a79911c928183e2e09db0c8e6ab78e8fdbd25a5671bed277`。provenance：3/3，SHA-256 `23899e5ac695e0a8e7c1553888b12c483b8bc615b680925c10b95d50b9d75e63`。source manifest：214/214，aggregate `c3f798d3c2e3a26aa8b3cff8118e5e641d6c9231d1e78b8db3bdcb02743ad820`。四个归档已完整列举，未发现数据库、真实 `.env`、密钥、证书或玩家档。

## 8. Release Agent 剩余硬门禁

1. 从 `c24e624…` 或逐字使用上述候选，复算全部哈希；不得复用旧候选。
2. API 先在未激活目录安装 production dependencies，以合成账号和临时/授权隔离 SQLite 复跑重点测试；禁止生产玩家写 smoke。
3. 香港和上海分别创建并绑定发布前备份、独立 preflight、quick_check、schema/layout、磁盘/WAL 与单 writer 证据；不得恢复数据库作为代码回滚。
4. 先升级 API 并验证旧客户端云上传，再切 Web/PWA；完成 Build ID、缓存、Range、SW、previous-stable、离线重开和灰度观察。
5. 正式原生包使用既有证书/策略重建和重新哈希；验证 Android 真机/覆盖升级、Windows 低配/覆盖升级/SmartScreen。
6. 真实设备覆盖 35 MiB 导入、当前为空候选恢复、另一活动标签、PWA 更新、后台/崩溃后的时间扭曲恢复、1 小时离线/纯挂机、200% 字号、中文输入和读屏。
7. 未取得明确生产授权前，不部署、不更新下载页、不覆盖 stable。

## 9. 性能与风险

- startup 相对旧候选 +0.74%，menu +2.91%，仍在预算内；新增逻辑不进入每 tick 模拟。
- 冲突恢复为大字符串逐字读回，峰值内存/IndexedDB I/O 只在恢复边界上升；开发机脱敏 35.5 MiB 约 2.8 秒，真实附件检查约 35.9 秒，低配设备仍是必须验收项。
- 旧客户端会降级新增产剂偏好；API 回滚必须保留新上限和 `resourceMode` 兼容。
- 原生诊断件未签名且无正式 URL；Linux 专属 6 项、真实设备、iOS Safari/PWA standalone 尚未通过。
- 已暂停黑洞不自动开启；不会因本版恢复逻辑自行改写。

## 10. 回滚方案

- 未发布：废弃新候选即可。
- Web/PWA：原子切回上一完整 1.0.41 静态目录，不能只替换单个 JS/SW；保留 1.0.42 API 以继续接受新格式范围。
- API：若尚未接受任何新上限/资源标签记录，可按发布证据评估回滚；一旦接受，旧 1.0.41 API 不再是安全直接目标。应使用保留 1 亿验证和资源标签读取的兼容代码回滚候选。
- 原生：保持上一 stable feed，不卸载应用、不清数据、不换证书。
- 所有路径：只回滚不可变代码/静态制品，不恢复生产数据库，不删除云 revision、submission、排行榜历史、本地冲突副本或玩家存档。
