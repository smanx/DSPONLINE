# Deterministic synthetic v46 save fixtures

This directory intentionally stores only the small fixture contract and fixed
digests. The 1, 8, 20, and 29 MiB JSON files are generated on demand so the
repository does not permanently carry roughly 116 MiB of duplicate test data.

The generator uses public game IDs and a fixed synthetic seed. It never reads a
player save, browser profile, cloud database, account, environment credential,
or production path. Every output is ASCII JSON with GameState v46, save
envelope v2, an exact state checksum, and a whole-file SHA-256.

The payload body is production-shaped rather than one large padding string:

- deterministic stacked production, storage, power, research, fluid,
  byproduct, recursive-manufacturing, logistics, quantum, and Dyson entities;
- deterministic belts with tier, lanes, stack, priority, progress, flow, and
  congestion boundaries;
- finite and infinite resource-mode profiles;
- empty, near-full, and full inventory/cache states;
- independent `normal` and eligible `speedrun` envelope/state markers.

Only the final sub-record remainder is filled by `syntheticPadding`; the
generator contract requires it to remain smaller than one generated belt
record. The writer retains at most one record plus a 64 KiB output batch, so a
29 MiB fixture does not require a 29 MiB in-memory string.

Examples:

```text
node scripts/generate-synthetic-save-fixtures.mjs --profile=all --mode=all --dry-run --json
node scripts/generate-synthetic-save-fixtures.mjs --profile=29m --mode=normal --output-dir=<temporary-directory>
node --test scripts/generate-synthetic-save-fixtures.test.mjs
```

Generated JSON files are disposable build/test artifacts and must not be
mistaken for player saves or committed as canonical source fixtures.
