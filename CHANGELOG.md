# Changelog

All notable player-facing changes are recorded here. Game-state migration versions are tracked separately from product versions.

## [Unreleased]

- Fixed coarse-pointer multi-select mode so tapping another node does not clear the existing selection.
- Added deterministic build identity and release manifest tooling.
- Added atomic code release switching with a last-release rollback command that never restores the database.
- Added privacy-safe PV, UV, sessions, active-time and allowlisted event aggregation on the Asia/Shanghai calendar.
- Added a protected `/admin` operations dashboard and reduced the public status endpoint to anonymous player counts.

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
[1.0.2]: ./docs/releases/1.0.2.md
[0.4.0]: ./docs/releases/0.4.0.md
[0.1.0]: ./docs/releases/0.1.0.md
