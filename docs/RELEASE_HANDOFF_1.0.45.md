# 1.0.45 空间站扩展发布交接

> 状态：开发完成，待发布 agent 执行最终发布门禁  
> 分支：`codex/1.0.45-space-station`  
> 基线：`codex/1.0.44-release-candidate` + `codex/space-station-expansion`  
> 当前提交：`e971594`（后续文档/回归提交会继续追加）  
> 版本：`1.0.45` / Android `1000045`

## 1. 发布内容

本版本把“全星系唯一空间站”扩展作为 1.0.45 的正式内容，覆盖 M0-M5：

- **M0**：兼容桥接与新状态骨架
  - 默认启用空间站功能，普通 v46 存档升级到 GameState v47。
  - 通过 `VITE_SPACE_STATION_ENABLED=false` 可构建桥接版本；桥接版读取 v46 时继续写 v46，读取 v47 时原样保留。
  - 新增 `src/game/spaceStationFeature.ts` 与 M0 测试。
- **M1**：本地空间站建设与独立画布
  - 全存档唯一空间站、三阶段施工、独立视口、桌面/手机入口。
  - 轨道货运终端、四输入口、功率/额度、量子手动交付。
- **M2**：合同与双轨经济
  - 每日 3+1 合同、3 个接受槽、任务日、部分结算、结算幂等。
  - 轨道徽记、空间站声望、等级派生。
- **M3**：装饰与展示舱
  - 装饰目录、永久收藏、区域解锁、独立画布编辑、数量上限。
- **M4**：公开主页与隐私
  - `/station/:publicId` 只读直达页、脱敏快照、独立隐私开关、排行榜访问入口。
  - 服务端 cloud schema v8 / SQLite layout v3。
- **M5**：收藏与预设通讯信号
  - 幂等收藏、固定通讯信号、管理撤下、账号删除清理。

## 2. 代码状态

- 已从 1.0.44 release candidate 合并空间站分支，并解决所有冲突。
- 关键文件：
  - `src/game/spaceStationFeature.ts`（M0 开关）
  - `src/game/orbitalStation.ts` / `stationContracts.ts` / `stationDecorations.ts` / `stationCargoTerminal.ts`
  - `src/components/OrbitalStationWorkspace.tsx` / `PublicStationPage.tsx` / `StationCanvasRenderer.tsx`
  - `server/station-profile.mjs` / `server/index.mjs`
  - `save-field-contract.json`（v47 稀疏契约）
- 版本：
  - `package.json` / `package-lock.json`：`1.0.45`
  - `android/native-version.properties`：`1.0.45 / 1000045`

## 3. 已完成的验证

> 以下为 1.0.45 合并后当前工作树实测结果；全量 Playwright 最终结果以最后一节为准。

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过，startup budget 通过 |
| `npm test` | 168 文件通过 / 7 跳过；1406 项通过 / 20 跳过 / 0 失败 |
| `npm run test:server` | server 357 通过 / 2 跳过；station-profile 3/3 |
| `npm run test:ops` | 56 通过 / 6 跳过 |
| `npm run test:native` | 24/24 通过 |
| `npm run licenses:check` | 125 个运行时包一致 |
| 空间站 E2E `orbital-station.spec.ts` | 5/5 通过 |
| 全量 Playwright | 见下方状态 |

## 4. M0 桥接说明

- 默认 1.0.45 为正式空间站版本，会写入 `GameState v47`。
- 桥接构建：
  ```bash
  VITE_SPACE_STATION_ENABLED=false npm run build
  ```
- 桥接版行为：
  - 读取 v46 普通档：保持 v46，不写入 `orbitalStation`。
  - 读取 v47 档：保持 v47，原样保留 `orbitalStation` 与货运终端状态。
  - 公开空间站入口在桥接版关闭。
- 发布 agent 需要根据跨端 rollout 策略决定是否先发桥接版，再发正式 1.0.45。

## 4.1 版本发布说明

- 已新增 `src/i18n/releaseNotes.ts` 的 1.0.45 当前版本说明。
- 已把 1.0.44 加入版本历史，并更新 `ReleaseNotesDialog` 与测试。

## 5. 发布前仍需 release agent 执行

- 完整 Playwright 全量回归（或按发布门禁分片）。
- Web / Windows / Android 生产构建与签名制品。
- 服务端 schema v8 / SQLite layout v3 的隔离数据库迁移演练。
- 真实 Linux systemd / Nginx / 备份恢复演练。
- 下载页、更新清单、PWA、Firefox/WebKit 覆盖。
- 正式发布记录与回滚预案。

## 6. 回滚原则

- 客户端回滚目标必须是能读取 v47 的桥接版，不能直接回 1.0.44。
- 服务端回滚保留 schema v8 / layout v3 表，不恢复旧数据库覆盖新数据。
- 关闭功能只停止新交互，不删除玩家空间站、合同、徽记、声望或装饰。
