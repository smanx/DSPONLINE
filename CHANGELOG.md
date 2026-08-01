# Changelog

All notable player-facing changes are recorded here. Game-state migration versions are tracked separately from product versions.

## [Unreleased]

## [1.0.21] - 2026-08-02

- Raised the cloud-save raw request boundary from 8 MiB to 32 MiB, bounded compressed and expanded payloads, and separated format, integrity, compression, and size errors without replacing the last valid cloud save.
- Added the device-only Endgame Extreme Mode and reduced current-planet belt observation, while preserving simulation time, production, logistics, inventory, and save results.
- Fixed the PWA response-clone race and added incremental canvas topology/runtime updates to reduce redundant React Flow work.
- Added compact and detailed blueprint views with stable deployment actions, plus blueprint memory for micro black hole connector operation intent with a danger confirmation.
- Added repeated-save short-circuiting for an unchanged verified state; state changes and failures still use the complete save path.
- Added guarded experimental incremental Worker, batched belt-renderer, and multi-Worker safety-gate paths. Full-state transport and one authoritative Worker remain the defaults.
- Preserved GameState v46, save envelope v2, cloud schema v7, old saves, inventories, belts, routes, and in-transit cargo.

## [1.0.20] - 2026-08-02

- 量子供应端在物资实际送达时直接写入共享库存；容量不足时只把精确余量保留在本地缓存或源端，不受五秒上传带宽和塔槽位缓存限制。
- 量子直接入库覆盖传送带、本地运输机和已有本地溢出缓存，并保持 `minStock`、在途货物、五秒统计和 GameState v46 守恒。
- 云存档兼容普通建筑遗留的 `quantumTarget: false`；普通建筑和普通蓝图在下一次保存时清理该字段，星际物流站字段继续保留。
- 服务端把存档格式错误、内部完整性错误、存档过大和请求体过大分开报告，并补充读取、重存、云上传回归测试。

## [1.0.19] - 2026-08-01

- Synchronized declarative content-pack registries with real-time, idle, and offline simulation Workers using a versioned snapshot/fingerprint boundary; stale Worker responses cannot overwrite a newer registry state.
- Raised the shared quantum upload and download base to `5,000 items/minute × Galactic Logistics infinite multiplier² × all attached quantum-tower stacks`; orbital collectors share the upload budget without creating a second warehouse or bandwidth source.
- Unified blueprint stack validation at `100,000,000`, preserving large blueprint counts without truncation; added alignment guides, quantum-mode blueprint intent, grey pending construction, repeated material/vehicle top-ups, and atomic cancellation refunds.
- Recursive hand-crafting now keeps required work-in-progress and allows excess byproducts such as hydrogen to remain usable instead of blocking the task; added visible overflow accounting.
- Replaced blocking browser dialogs with in-game asynchronous confirmations that restore focus and text input on both confirm and cancel paths.
- Added stable production-statistics ordering, selectable time windows, large-number formatting, and regression coverage for desktop/mobile layouts.
- Migrated GameState v45 saves to v46 conservatively; old saves, blueprints, inventories, routes, vehicles, and in-transit cargo remain compatible and conserved.
- Published matching Windows and same-certificate Android application packages with Android versionCode `1000019`.

## [1.0.18] - 2026-08-01

- Added a dedicated quantum-space inventory view with exact, scientific, compact, recent upload/download, and net-flow values per item.
- Replaced per-tower quantum throughput with independent save-wide upload and download budgets derived from all attached tower stacks and the squared Galactic Logistics multiplier.
- Added explicit per-collector and galaxy-wide orbital-collector attachment controls; collectors are supply-only endpoints and never switch silently during migration.
- Kept local logistics-drone dispatch active for attached quantum towers while quantum mode replaces only interstellar vessels and warpers.
- Added independent per-item quantum inventory limits from 10,000 to 10,000,000,000; lowering a limit preserves existing excess stock and blocks only further uploads.
- Migrated GameState v44 saves to v45 without rebuilding or deleting station buffers, slots, belts, routes, vehicles, or production progress.
- Published matching Windows and same-certificate Android application packages with Android versionCode `1000018`.

## [1.0.17] - 2026-08-01

- Removed the deprecated "空间站与太空电梯" entry from the star map while retaining legacy save fields and compatibility code.
- Made interstellar logistics station Mk.II and quantum-network attachment upgrades zero-cost; existing inventories are preserved.
- Fixed quantum attachment transitions that could wait forever on stale legacy-route cargo; transition checks now use the global route ledger, including routes stored on a demand tower for a supply tower.
- Completed paused-canvas P1-P5: pointer/placement visuals use an isolated overlay, port hit testing uses a spatial index, drag-time geometry is frozen, mobile pinch updates only at LOD boundaries, and dense belt graphs participate in viewport culling.
- Added regression coverage for a 60-building/600-belt paused canvas and for legacy route tails completing through the normal simulation engine.
- Published matching Windows and Android application packages with Android versionCode `1000017`.

- Local `1.1.0-dev`: added the GameState v42→v43 space-station migration, four-phase system-space-station domain, Mk.I→Mk.II station upgrade, legacy/elevator transition boundary, five-output blueprint fields and deterministic five-second shared-hub settlement. This is not published or deployed yet.
- Added explicit interstellar-station upgrade diagnostics, atomic per-station Mk.II upgrades, stable-order batch upgrades from the star map, and direct desktop/mobile inspector controls. Technology, material and invalid-stack blockers are shown instead of silently returning the unchanged state; existing routes and in-transit cargo remain untouched.
- Corrected Mk.II upgrade pricing so a stacked logistics-station entity consumes one upgrade package instead of multiplying the package by its internal machine stack count.
- Added a local-only (`127.0.0.1`/`localhost` Vite DEV) free-build switch for system-space-station construction testing; production builds retain the full phase material requirements.
- Added the space-station construction launcher to both desktop and mobile construction trays; the unlocked building can now be selected, crafted and placed from the logistics category.
- Fixed coarse-pointer multi-select mode so tapping another node does not clear the existing selection.
- Added deterministic build identity and release manifest tooling.
- Added atomic code release switching with a last-release rollback command that never restores the database.
- Added privacy-safe PV, UV, sessions, active-time and allowlisted event aggregation on the Asia/Shanghai calendar.

## [1.0.16] - 2026-07-31

- Reused the runtime logistics ledger until an active route is created, completed, or invalidated; the full scan remains a deterministic oracle.
- Kept canvas topology and belt geometry separate from production telemetry, and added conservative offline critical-event boundaries without changing exact settlement.
- Added a 75 ms offline Worker yield budget so long offline calculations report progress and respond to cancellation sooner.
- Added a formal desktop release gate for the official cloud API and update URLs, with package metadata verification inside `app.asar`.
- Desktop updates now request a final local save flush before Electron exits; GameState v42, cloud schema v7, and existing saves remain unchanged.
- Added a protected `/admin` operations dashboard and reduced the public status endpoint to anonymous player counts.
- Stopped the hidden 5-second save-slot and snapshot scan that caused periodic freezes in small new games; save summaries now refresh when the save workspace is open or after an explicit save operation.
- Cached unchanged save summaries, merged overlapping autosaves, moved first-time historical validation to a Worker, and batched long-task diagnostics to avoid storage feedback stalls.

## [1.0.14] - 2026-07-31

- Added persistent planet/system display names, notes, tags and search without changing internal galaxy IDs or logistics relationships.
- Extended infinite collection speed to solid, oil, liquid, sulfuric-acid and orbital collection while preserving solid vein depletion rules.
- Made large blueprint placement validate all requirements atomically and preserve construction inventory on shortage or failure.
- Clarified logistics dispatch direction and charged warpers only at the station that actually dispatches vessels.
- Reused logistics and belt indexes without changing persisted belt order; the real late-game fixture now matches the legacy state hash with 6,105 candidate checks.
- Migrated GameState v41 to v42; save envelope, cloud schema, SQLite layout and existing player data remain compatible.

## [1.0.13] - 2026-07-30

- Cached stable factory topology, port occupancy, belt bundles, route geometry, and unchanged React Flow objects to reduce large-factory rendering work.
- Added viewport rendering for planets with at least 300 entities while preserving full node access for smaller desktop and mobile factories.
- Fixed buildings remaining in a grey compact state after zooming back in; building detail now follows actual zoom instead of performance mode.
- Reused interstellar path plans by planet pair, route policy, warper budget, and route environment without changing deterministic state hashes.
- Removed the leaderboard's artificial `10^15` metric cap, added saturating arithmetic for extreme finite values, and expanded quantity and power units through 载 and QW before scientific notation.
- Kept GameState v41, save envelope v2, cloud schema v7, SQLite layout v2, simulation rates, refresh preferences, and existing player saves unchanged.

## [1.0.11] - 2026-07-30

- Reused stable logistics matching, route economics, active vehicle loads, and dispatch summaries within each simulation session to reduce endgame Worker latency.
- Replaced per-item fuel, Energy Exchanger, and recursive Construction Center loops with deterministic batch settlement while preserving state hashes and material conservation.
- Added server-side leaderboard data-integrity restrictions that survive uploads, restores, visibility changes, and startup backfills without disabling account or cloud-save access.
- Published matching `1.0.11 / 1000011` Windows and Android packages, with Android signature continuity and save-preserving upgrade verification.
- Kept GameState v40, save envelope v2, cloud schema v7, SQLite layout v2, production rates, refresh settings, and existing player saves unchanged.

## [1.0.3] - 2026-07-26

- Added a shared atomic recursive-manufacturing planner that prefers unlocked advanced recipes, falls back to complete base chains, and reports the true raw-resource, technology, or capacity blocker.
- Added recursive quick-crafting and Construction Center stock targets for logistics vessels, with completed craft output stored in the portable fleet.
- Added item-codex production-line location, upstream network highlighting, multi-target cycling, cross-planet jumps, and explicit highlight clearing.
- Corrected orbital-collector power diagnostics, saturated-fleet reporting, time-warp multiplier evidence, and finite-resource depletion persistence.
- Added spray-module removal with protected refunds and depleted-resource recovery shortcuts.
- Fixed HarmonyOS composition input persistence, storage/tank port geometry, mobile tray deletion controls, and collapsed materials-sidebar residue.
- Migrated GameState v35 to v36 without changing save envelope v2, cloud schema v7, or SQLite layout v2.

## [1.0.2] - 2026-07-25

- Added a device-local Simplified Chinese / English switch to the start menu and in-game settings, plus the direct `?lang=en` entry point.
- Added English names and descriptions for the gameplay catalog, technology effects, planetary ecologies, star systems, campaign, and primary desktop/mobile workflows.
- Completed the Light theme across start, account, cloud-save, leaderboard, full-screen workspace, modal, and classic/next mobile surfaces.
- Updated the Windows and Android applications to `1.0.2` without changing GameState v35, save envelope v2, cloud schema v7, or existing player data.
- Added separate Simplified Chinese and English README entry points.

## [0.4.0] - 2026-07-22

- Corrected power-efficiency reporting, automatic belt-tier selection, splitter priority fallback and research pausing.
- Added persistent production regions and independent per-planet inventory limits.
- Improved 80%-200% layouts, storage ports, workspace switching, mobile canvas release and update-dialog handling.
- Added legacy-account email binding and password-recovery protocols, with unavailable mail actions explicitly marked as in development.
- Added independent main and three manual cloud-save slots, revision history, conflict selection and ten-minute verified-account sync.
- Migrated both production nodes to game state v28 and cloud schema v6 with verified backups and record-preservation checks.

## [0.1.0] - 2026-07-21

- Published the first public beta of DSP极简网络.
- Completed the production loop from manual mining through universe matrices, Dyson structures and galactic exports.
- Added local and cloud saves, rankings, PWA and Windows desktop packaging.
- Added desktop/mobile canvas interaction, production diagnostics, blueprints, content packs and the campaign flow.
- Deployed independent Hong Kong production and Shanghai fallback nodes.

[Unreleased]: ./docs/ROADMAP.md
[1.0.14]: ./docs/releases/1.0.14.md
[1.0.13]: ./docs/releases/1.0.13.md
[1.0.11]: ./docs/releases/1.0.11.md
[1.0.3]: ./docs/releases/1.0.3.md
[1.0.2]: ./docs/releases/1.0.2.md
[0.4.0]: ./docs/releases/0.4.0.md
[0.1.0]: ./docs/releases/0.1.0.md
