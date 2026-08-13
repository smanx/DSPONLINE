#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

"${NODE:-node}" --test \
  deploy/release-backup-evidence.test.mjs \
  deploy/api-handoff-proxy.test.mjs \
  deploy/release-switch.test.mjs
