---
name: develop-dspidle
description: Maintain and extend the DSPidle2 / DSP极简网络 repository across gameplay content, deterministic simulation, React Flow factory UI, desktop and mobile interaction, save migration, content packs, cloud accounts and rankings, PWA/Electron packaging, testing, documentation, and the Hong Kong/Shanghai deployments. Use whenever Codex plans, implements, reviews, diagnoses, tests, releases, or documents a change in this project.
---

# Develop DSPidle

Use the repository baseline as the source of truth. Preserve player data and deterministic behavior while extending the existing architecture.

## Start Every Task

1. Locate the repository root containing `package.json`, `src/`, `server/`, and `deploy/`.
2. Read `docs/PROJECT_STATUS.md` before making claims about current functionality or deployment state.
3. Read the task-specific canonical document:
   - Architecture or cross-module work: `docs/ARCHITECTURE.md`
   - Gameplay, recipes, technology, progression, or interaction rules: `docs/GAMEPLAY_SYSTEMS.md`
   - Server or deployment work: `docs/DEPLOYMENT_OPERATIONS.md`
   - Tests, build, packaging, or release work: `docs/TESTING_RELEASE.md`
   - Planning or prioritization: `docs/ROADMAP.md`
4. Read [references/project-map.md](references/project-map.md) to route the task to the smallest ownership area.
5. Run `git status --short`. Treat all existing tracked and untracked changes as user work. Do not reset, clean, discard, or overwrite them.
6. Inspect the relevant implementation and tests before proposing or applying a change. Reconcile documentation with code when they disagree.

## Classify Risk

Treat these changes as high risk:

- `GameState`, save envelopes, migrations, localStorage keys, cloud-save payloads, or content-pack IDs
- Simulation timing, item settlement, power allocation, belts, logistics stations, research, Dyson systems, or offline progress
- Authentication, sessions, leaderboard verification, SQLite persistence, backup, or API origin policy
- Nginx, systemd, TLS, DNS, deployment symlinks, or production data directories
- Shared canvas interaction, font scaling, mobile breakpoints, or React Flow handle geometry

For high-risk changes, broaden tests and explicitly verify backwards compatibility and data preservation.

## Follow Project Invariants

- Keep `GameState` as the persisted gameplay truth. Derive React Flow nodes and edges from it; do not persist transient React Flow objects.
- Keep `advanceSimulation()` deterministic for the same state and elapsed seconds. Derive randomness from persisted seeds.
- Settle player-visible inventories as non-negative integers. Keep fractional values only in hidden progress accumulators.
- Keep continuous generators as power sources without fake production cycles. Use cycle progress for mining, production, processing, research, and logistics.
- Preserve all input, output, fuel, route inventory, and construction stock during recipe changes, upgrades, removal, migration, and load operations.
- Support multiple valid lines per building and per station slot. Never assume that the first connection owns the whole entity.
- Preserve explicit recipes and station-slot choices. Auto-configure only an unconfigured compatible target.
- Render belts below building cards and stop card pointer events from reaching belts behind them.
- Keep mouse and touch simulations identical. Check portrait, landscape, and 80/100/125/150 percent font scales for shared UI changes.
- Apply enabled content packs before migrating saves containing extension IDs.
- Keep locked construction hidden unless a requirement explicitly changes that behavior.
- Do not add Dark Fog or combat unless the user explicitly reopens that scope.

## Protect Saves And Production Data

- Never clear or rewrite browser saves as a migration shortcut. Do not call `clearGame()` from ordinary navigation, new-game, menu, or update paths.
- Never delete, initialize, replace, or upload test data into `/var/lib/dsp-idle-cloud`.
- Never expose private keys, passwords, tokens, certificate keys, user save payloads, or backup contents in code, docs, logs, or responses.
- Before a backend, schema, or persistence deployment, create and verify a SQLite backup with the backup API.
- Roll back code independently from data. Restore an older database only as an explicit disaster-recovery action after backing up the current database.
- Keep the Hong Kong production node and Shanghai legacy node independent. Do not redirect or proxy `111.229.128.211` to Hong Kong.
- Keep cloud credentials disabled on non-local HTTP pages. Do not weaken `src/game/cloud.ts` to support insecure login.
- Do not mutate production systems unless the user explicitly asks for deployment or operations work.

Read [references/deployment.md](references/deployment.md) before any server action.

## Implement By Task Type

### Gameplay Or Content

Update every closed reference: ID types, definitions, sources and uses, compatible buildings, technology unlocks, construction costs, handcraft visibility, planning, migration, and tests. Run catalog and progression audits. Do not add display-only content.

### Simulation Or Logistics

Prefer pure helpers and established engine commands. Test normal operation, missing input, blocked output, no or low power, multiple lines, integer settlement, offline advancement, and deterministic hashing as applicable.

### UI Or Interaction

Reuse existing catalog pickers, hooks, icon library, workspaces, and responsive patterns. Keep fixed controls dimensionally stable. Test pointer capture, click-through, drag preview, zoomed handles, touch targets, overflow, reduced motion, and orientation changes where relevant.

### Save Or Content-Pack Compatibility

Increment `GameState.version` only for a real state shape or semantic migration. Extend `migrateGame()` from the previous production state, preserve unknown-but-valid extension IDs when packs are active, and add migration fixtures. Keep the envelope version separate from the game-state version.

### Cloud Or Server

Validate authentication, body size, origin, rate limits, conflict behavior, persistence, restart, and error responses. Use temporary SQLite in tests. Never run write tests against production.

### Release Or Deployment

Follow the backup, release-directory, atomic switch, health-check, smoke-test, and rollback workflow in the operations docs. Verify Hong Kong and Shanghai separately. Record Git SHA, app version, build ID, and deployed artifact hashes.

## Validate Proportionally

Read [references/testing.md](references/testing.md), choose the smallest sufficient matrix, and report exactly what ran. A production release requires the full matrix. Documentation-only changes require link checks, Skill validation, and `git diff --check`, not an unnecessary browser suite.

Never claim a check passed from an earlier conversation when the current artifact has changed. If a check cannot run, state the gap and residual risk.

## Keep The Baseline Current

Update canonical docs in the same change when behavior, architecture, storage versions, deployment topology, release procedure, test counts, or roadmap status materially changes.

- Put verified present-tense facts in `docs/PROJECT_STATUS.md`.
- Put stable implementation boundaries in `docs/ARCHITECTURE.md`.
- Put player-facing invariants in `docs/GAMEPLAY_SYSTEMS.md`.
- Put operational procedure in `docs/DEPLOYMENT_OPERATIONS.md`.
- Put future work only in `docs/ROADMAP.md`.

Keep this Skill concise. Add detailed facts to canonical docs or its three direct references rather than duplicating them here.
