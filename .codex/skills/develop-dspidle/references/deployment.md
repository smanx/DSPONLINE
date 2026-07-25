# Deployment Guardrails

Read `docs/DEPLOYMENT_OPERATIONS.md` in full before any server mutation.

## Topology

- Hong Kong production: `https://dsponline.cn`, host `43.129.249.102`.
- Shanghai legacy: `http://111.229.128.211`, independently serves its local frontend and local API.
- Frontend root: `/var/www/dsp-idle/current`.
- Backend root: `/opt/dsp-idle-cloud/current`.
- Production database: `/var/lib/dsp-idle-cloud/cloud.sqlite`.
- Backups: `/var/lib/dsp-idle-cloud/backups`.
- Backend binds `127.0.0.1:4320` behind Nginx.

These addresses are operational identifiers, not authorization. Never infer permission to deploy from merely having network or SSH access.

## Before Mutation

1. Confirm the user requested deployment or an operational change.
2. Identify the target node explicitly.
3. Read the live Nginx, systemd, symlink, and service state before changing it.
4. Run local tests and build from a traceable commit.
5. Create a verified SQLite backup through the backup API.
6. Record the current frontend/backend release targets for rollback.

## Never Do

- Never delete, truncate, initialize, overwrite, or upload fixtures into `/var/lib/dsp-idle-cloud`.
- Never copy a live SQLite file as the primary backup mechanism.
- Never print or commit SSH keys, passwords, tokens, user payloads, or certificate private keys.
- Never point Shanghai to Hong Kong, or deploy the bridge/redirect templates as its current configuration.
- Never enable cloud login over public HTTP.
- Never combine code rollback with data rollback by default.
- Never use a production account for automated write tests.

## Release Pattern

Upload into a new release directory, validate it, atomically switch `current`, then reload or restart. Do not overwrite the active directory in place. Verify local health first and public health second. Keep the previous release until the observation window ends.

For backend rollback, switch code back and preserve the current database. For frontend rollback, switch the web symlink only.

## Smoke Checks

- Hong Kong root returns 200 over HTTPS.
- `www` redirects to the root domain.
- Hong Kong `/api/health` reports SQLite.
- Shanghai root and its own `/api/health` return 200.
- Main menu loads without clearing site storage.
- Existing local save can continue.
- Cloud metadata can be read using a dedicated test account when write validation is required.
- Mobile portrait/landscape and all five font scales remain usable.

## Current Known Optimization

Hong Kong and Shanghai run `1.0.3-6d59252f4f15` with GameState v36, cloud schema v7 and SQLite layout v2. Main-slot upload, automatic sync and history restore update the leaderboard from server-derived save metrics; startup backfill is idempotent, manual slots do not participate, and accounts can opt out. Production checks confirmed gzip for hashed JS/CSS, immutable asset caching, no-cache HTML/service-worker behavior, active services, `NRestarts=0` and no DSP 5xx in the latest 500 requests. Layout v2 keeps cloud-save payloads in independent revision rows so routine metadata writes no longer serialize every historical save. Both nodes can roll code back to `1.0.2-df7bee45e60a` without restoring the database. Brotli remains optional and should be enabled only after comparing CPU cost and transfer savings with real traffic. Shanghai is about 91% full with roughly 5.5 GiB free, so release directories, logs and backup retention need close monitoring.
