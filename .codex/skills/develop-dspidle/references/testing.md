# Testing Matrix

Canonical details live in `docs/TESTING_RELEASE.md`.

## Commands

```powershell
npm run typecheck
npm test
npm run test:server
npm run test:ops
npm run build
npm run test:e2e
npm run desktop:pack
```

Current production baseline: 1.0.12 with 548 passing Vitest tests plus 3 optional benchmark skips, 176 Playwright scenarios, 42 cloud-service tests, 6 operations tests and 6 native configuration/release-tool tests on GameState v41. Hong Kong and Shanghai Web/API both run `1.0.12-4f149409f433` with save envelope v2, cloud schema v7 and SQLite storage layout v2. Public Windows and Android stable packages are also 1.0.12, with Android versionCode `1000012`, from the Shanghai download node. The common code and download rollback target is `1.0.11-f88462df5326`.

## Choose By Change

| Change | Minimum verification |
| --- | --- |
| Docs or this Skill | Markdown/link checks, Skill validator, `git diff --check` |
| Local UI/style | typecheck, build, focused E2E, desktop + portrait + landscape screenshots |
| Font/zoom/React Flow geometry | above plus 80/100/125/150/200 percent handle alignment |
| Content/recipe/technology | typecheck, unit suite, build, content/progression audits, focused E2E |
| Engine/logistics/power | typecheck, full unit suite, build, relevant E2E; full E2E for shared rules |
| Save/migration/offline | full unit suite, old-save migration fixtures, full E2E, build |
| Server/API/SQLite | server tests plus new failure-path tests, `test:ops`, typecheck, build |
| Production release | `npm ci`, typecheck, all unit tests, server tests, build, full E2E, deployment smoke tests |
| Desktop release | production matrix plus `desktop:pack` or `desktop:dist` and launch smoke test |

## Mandatory Regression Themes

- Existing saves load without inventory, entity, belt, technology, blueprint, or queue loss.
- Same state and elapsed time remain deterministic.
- Visible inventories remain non-negative integers.
- A second and third valid line work on the same building and across station slots.
- Recipe changes, upgrades, and removal preserve or refund material.
- Worker and main-thread fallback follow the same rules.
- Node movement updates lines live; building cards block click-through.
- Mobile orientation preserves viewport, selection, and panel state.
- Cloud conflicts do not silently overwrite either side.

## Reporting

Report commands and exact pass/fail counts. Distinguish a newly run result from a historical baseline. Keep Playwright screenshots/traces only as diagnostics; do not commit generated test output unless explicitly requested.
