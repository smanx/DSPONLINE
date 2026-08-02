# DSPidle Agent Roles And Handoffs

Use one role per conversation. The role is a boundary, not a personality label: a role may inspect anything needed to validate its work, but it may only mutate the files and systems listed below.

## Role declaration

Start the conversation with one of:

```text
Role: feedback
Role: develop
Role: release
```

If the user has not declared a role, infer it only from an unambiguous request. When the request crosses roles, stop at the boundary and produce the handoff instead of doing the next role's work silently.

## Shared handoff contract

Every handoff should contain these fields, using `unknown` where a value is not yet available:

```text
Task ID / title:
Priority:
Source and attachments:
Reproduction or observed evidence:
User-visible acceptance criteria:
Compatibility and data-preservation constraints:
Target platforms:
Required tests:
Release target and version:
Known risks / rollback:
```

The development handoff adds:

```text
Commit SHA:
Changed files:
Artifact paths:
Manifest and aggregate hash:
Tests with exact counts:
Unverified gaps:
```

The release report adds:

```text
Target node(s):
Pre-release backup and verification:
Previous and new release directories:
Atomic switch result:
Health / smoke checks:
Download-page and package checks:
Rollback command or pointer:
Residual risk:
```

## Feedback / analysis role

1. Read `docs/PROJECT_STATUS.md` and the task-specific canonical document before making claims.
2. Inspect attachments, logs, diagnostics, and source read-only. Reproduce with a copy of a save; never upload a player save or write to production.
3. Separate confirmed facts, hypotheses, and proposed changes. Classify P0-P3 (or explain a different priority), scope, compatibility, and expected user impact.
4. Produce a concise implementation prompt using the shared handoff fields. Include exact reproduction steps, acceptance checks, and the smallest owning modules.
5. Store analysis or handoff files only when requested, preferably under `docs/feedback/` or the relevant dated planning document. Do not edit `src/`, `server/`, release directories, or deployment state.

The feedback role does not promise a fix, a performance percentage, or a release date without evidence. It should explicitly say when an attachment is missing, corrupted, or insufficient to reproduce.

## Development role

1. Require an approved feedback handoff or a direct implementation request. Read the current status, relevant architecture/gameplay/deployment/testing documents, and `git status --short`.
2. Change only source, tests, and canonical documentation needed for the handoff. Preserve unrelated user work and use `apply_patch` for manual edits.
3. Keep `GameState`, cloud schema, package signatures, and release behavior unchanged unless the handoff explicitly authorizes a migration. Add migrations, fixtures, and deterministic tests for any state or simulation change.
4. Run the smallest sufficient checks while iterating, then the release matrix required by risk. Report exact pass, skip, fail, and timeout counts; do not reuse historical results as current results.
5. Build immutable Web/API/native artifacts and a manifest from a clean, traceable commit. End with a development handoff; do not SSH, alter production symlinks, change live Nginx/systemd settings, or update public download links.

If a test or build fails, fix it in development or return a blocker. Do not ask the release role to bypass a failed gate.

## Release / operations role

1. Require an explicit release target (Hong Kong, Shanghai, download page, or a stated subset), a development commit, artifact manifest, and user authorization to publish.
2. Read `docs/PROJECT_STATUS.md`, `docs/DEPLOYMENT_OPERATIONS.md`, and [deployment.md](deployment.md). Check live symlinks, services, Nginx, disk, and rollback pointers before mutation.
3. Verify artifact hashes and package metadata in an isolated directory. For API/schema changes, create and verify the SQLite Backup API snapshot before the first production mutation. Never use a production account or player save for write tests.
4. Upload to a new release directory, install dependencies there, run the manifest verifier, and use the node's atomic switch script. Keep the previous release and database untouched. If startup or health checks fail, let the script roll back and diagnose from logs; do not hot-edit the new release on the server.
5. After switching, verify local and public health, version/build IDs, cache headers, static assets, service-worker behavior, download manifests, APK/EXE signatures and hashes when applicable, and disk headroom. Update release docs only from observed results.
6. Report exact deployment evidence, rollback target, remaining risks, and any platform that was not published because its signing or artifact gate was unavailable.

Server secrets, PEM files, passwords, tokens, database contents, and player save payloads never belong in a handoff, release archive, command output, documentation, or chat response. If a deployment request is ambiguous, publish nothing until the target is clarified.
