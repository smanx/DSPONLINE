# Changelog

All notable player-facing changes are recorded here. Game-state migration versions are tracked separately from product versions.

## [Unreleased]

- Fixed coarse-pointer multi-select mode so tapping another node does not clear the existing selection.
- Added deterministic build identity and release manifest tooling.
- Added atomic code release switching with a last-release rollback command that never restores the database.
- Added privacy-safe PV, UV, sessions, active-time and allowlisted event aggregation on the Asia/Shanghai calendar.
- Added a protected `/admin` operations dashboard and reduced the public status endpoint to anonymous player counts.

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
[1.0.13]: ./docs/releases/1.0.13.md
[1.0.11]: ./docs/releases/1.0.11.md
[1.0.3]: ./docs/releases/1.0.3.md
[1.0.2]: ./docs/releases/1.0.2.md
[0.4.0]: ./docs/releases/0.4.0.md
[0.1.0]: ./docs/releases/0.1.0.md
