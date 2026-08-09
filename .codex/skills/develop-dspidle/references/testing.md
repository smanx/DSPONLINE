# Testing Matrix

Canonical details live in `docs/TESTING_RELEASE.md`.

## Commands

```powershell
npm run typecheck
npm test
npm run test:server
npm run test:ops
npm run test:native
npm run licenses:check
npm run build
npm run test:e2e
npm run desktop:pack
```

Current production baseline: 1.0.35 on GameState v46, save envelope v2, cloud schema v7 and SQLite layout v2. The clean source passed 887 Vitest tests with 16 explicit skips and 255 Playwright scenarios with 11 explicit conditional fixture skips. Local and inactive production server verification passed 70 with 2 optional skips. Operations are 6/6, native tools 8/8, and 128 runtime licenses are consistent. Hong Kong and Shanghai Web/API run `1.0.35-080844f55852`; Android is `1.0.35 / 1000035`, Windows is 1.0.35 `NotSigned`, and the direct code/download rollback baseline is 1.0.34. The user waived only this candidate's physical-device stable gate; do not turn that waiver into a passing test result or reuse it for later releases.

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
