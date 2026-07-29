# 排行榜异常处置 Agent 交接提示词

你是 DSPidle2 / DSP极简网络项目的后端与发布 agent。请在下一次版本更新中，按本提示词把香港正式节点当前综合榜第一的异常账号从官方排行榜移除，同时保留账号和云存档。

## 任务目标

对当前 `season_01` 综合榜第一、显示名“伊卡洛斯”的唯一异常排行榜提交执行服务器端永久排行榜资格限制。

必须满足：

- 五个排行榜类别均不再显示该账号。
- 账号可以继续登录、读取、上传和恢复云存档。
- 不删除账号、不删除云存档正文、不删除历史修订、不改玩家存档内容。
- 处置可重复执行且幂等。
- 服务重启、主档上传、自动同步、历史恢复和 visibility API 不得使账号重新入榜。
- 不公开账号 ID、邮箱、token、IP、设备信息、坐标、存档正文或详细库存。

完整背景见：

- `docs/LEADERBOARD_DATA_INTEGRITY_REMEDIATION_2026-07.md`
- `docs/DEPLOYMENT_OPERATIONS.md`
- `.codex/skills/develop-dspidle/SKILL.md`

## 已知审计事实

这些事实只用于 dry-run 和测试断言，不要把用户 ID 写死到仓库：

- 目标是当前 `season_01` 综合榜第一的“伊卡洛斯”提交。
- 当前审计目标主档修订为 4，排行榜提交引用修订 4。
- 目标提交为服务器 `main-cloud-save-v1` 验证来源。
- 目标档有矿脉 `machineCount` 非零的官方不变量异常。
- 目标档的高阶建筑库存与累计白糖生产不守恒。
- 还有两个不同账号存在相同异常指纹；本任务默认不自动移除它们。

若线上当前数值已经变化，不要机械使用旧数字；必须重新运行只读异常检测，并确认候选唯一后再继续。

## 严格操作边界

1. 目标节点仅限香港正式节点。
2. 生产数据库路径为 `/var/lib/dsp-idle-cloud/cloud.sqlite`。
3. 所有读取审计使用：

```js
new Database(file, { readonly: true, fileMustExist: true });
db.pragma("query_only = ON");
```

4. 任何生产写入前必须通过 SQLite Backup API 创建并验证备份。
5. 禁止用 `cp` 直接复制正在写入的 SQLite 主文件作为备份。
6. 禁止删除、清空、重新初始化或替换生产数据库。
7. 禁止把真实用户 ID、邮箱、IP、token、私钥或存档正文写入 Git、日志、测试输出或聊天。
8. 不要通过 `displayName` 直接删除账号；必须先唯一解析目标提交。
9. 不要用 IP 作为唯一处罚依据；IP 只可作为内部关联证据。

## 实现要求

### 1. 内部排行榜处置状态

在服务端增加可选的内部持久状态，例如：

```js
leaderboardModeration: {
  [userId]: {
    status: "blocked",
    reasonCode: "SAVE_DATA_INTEGRITY",
    source: "hk-readonly-audit-2026-07-30",
    createdAt: 0,
  },
}
```

要求：

- 不在 `publicUser` 或公开排行榜响应中返回内部原因、用户 ID 或审计详情。
- `blocked` 时过滤所有公开排行榜 submission。
- `blocked` 时禁止 POST 排行榜、可见性重新开启和自动回填重新创建 submission。
- 云存档读写、历史恢复、登录和账号导出不受影响。
- 账号删除时清理内部处置状态。
- 归一化非法处置记录时只保留合法用户引用、固定状态、固定原因码和有限时间戳。

### 2. 目标解析器

实现一个只读 dry-run 解析流程：

1. 读取当前公开可见的 `season_01` submission。
2. 找到显示名为“伊卡洛斯”的候选。
3. 重新按当前服务器排序确认候选确实为综合榜第一。
4. 确认 `verification.strategy === "main-cloud-save-v1"`。
5. 确认 `verification.cloudRevision` 等于当前主云档 revision。
6. 确认 verification checksum 与当前主云档 metadata checksum 一致。
7. 候选必须唯一；候选数为 0 或大于 1 时中止。
8. 输出只包含候选数、修订号、校验布尔值和将处理的 submission 数量。

不要把生产 `userId`、邮箱、IP、payload 或完整 submission 打印出来。

### 3. 幂等处置

实现一个管理员侧一次性迁移或受保护运维脚本：

```text
dry-run -> backup -> verified transaction -> post-check
```

事务内：

1. 写入内部 `leaderboardModeration[userId].status = "blocked"`。
2. 删除目标当前赛季 submission。
3. 删除目标其他公开 submission（如果存在）。
4. 写入不含 PII 的 `leaderboard.moderation_blocked` 内部审计动作。

第二次运行必须返回“已处置”而不是再次修改数据。任何目标不唯一、备份校验失败或数据库状态变化都必须回滚事务并中止。

### 4. 所有排名入口统一检查

检查并覆盖：

- `GET /api/leaderboard`
- `POST /api/leaderboard`
- `POST /api/leaderboard/visibility`
- `/api/cloud-save` 主槽上传后的自动更新
- 自动同步后的更新
- `/api/cloud-save/restore` 历史恢复后的更新
- `createCloudServer` 启动回填

被处置账号重新加入时返回稳定错误码 `LEADERBOARD_RESTRICTED`，不要返回内部检测细节。

## 测试要求

至少增加以下服务端测试：

1. blocked 用户不会出现在五个排行榜类别。
2. blocked 用户 POST leaderboard 返回 `LEADERBOARD_RESTRICTED`。
3. blocked 用户 POST visibility 不能解除限制。
4. 主档上传不会重新创建 submission。
5. 历史恢复不会重新创建 submission。
6. 服务启动回填不会重新创建 submission。
7. blocked 用户仍能读取、上传和恢复云档。
8. 同名但非目标账号不会被误处理。
9. 迁移重复执行保持数据和修订数量不变。
10. `leaderboardModeration` 归一化、缺失和非法数据有覆盖。
11. 删除账号时同步清理处置状态。
12. 生产 SQLite layout v2 / schema v7 读回后状态保持一致。

## 验证命令

在本地完成对应修改后，按项目手册运行：

```powershell
npm run typecheck
npm test
npm run test:server
npm run test:ops
npm run build
```

如果发布范围涉及客户端或共享契约，再运行完整发布矩阵，不要只运行单个服务端测试。

## 生产执行清单

- [ ] 读取当前 release、数据库 schema、备份和服务状态
- [ ] 创建 SQLite Backup API 备份
- [ ] 对备份执行 `quick_check`
- [ ] dry-run 唯一解析目标
- [ ] 在隔离数据库副本验证迁移
- [ ] 发布新后端目录并通过本机健康检查
- [ ] 事务写入处置状态并删除目标 submission
- [ ] 查询五个排行榜类别确认目标消失
- [ ] 查询账号和云档确认仍可用且修订数未减少
- [ ] 重启或回填检查确认目标不会回来
- [ ] 公网 API 冒烟测试
- [ ] 保留备份、迁移摘要和无 PII 验收记录

## 更新说明

公开更新说明只写这一句：

```text
检测数据修改异常
```

不要写玩家名称、账号、IP、设备、异常字段、异常数量或封禁措辞。

## 最终交接内容

完成后向负责人报告：

- 修改了哪些文件。
- 目标解析候选数和幂等迁移结果。
- 备份验证结果和备份位置（不暴露密钥）。
- 五个排行榜的移除结果。
- 云档、登录和历史恢复保留结果。
- 测试命令和通过数量。
- 未完成项、风险和回滚方式。

不要在报告中包含原始用户 ID、邮箱、IP、设备名、token 或存档 payload。
