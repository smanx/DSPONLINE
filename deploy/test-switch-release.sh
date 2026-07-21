#!/usr/bin/env bash
set -Eeuo pipefail

script_path="${1:-$(cd "$(dirname "$0")" && pwd)/switch-release.sh}"
fixture="$(mktemp -d "${TMPDIR:-/tmp}/dsp-switch-release.XXXXXX")"
web_root="$fixture/web"
api_root="$fixture/api"
state_root="$fixture/state"

mkdir -p "$web_root/releases/a" "$web_root/releases/b" "$api_root/releases/a" "$api_root/releases/b"
ln -s "$web_root/releases/a" "$web_root/current"
ln -s "$api_root/releases/a" "$api_root/current"

run_switch() {
  DSP_WEB_ROOT="$web_root" \
  DSP_API_ROOT="$api_root" \
  DSP_RELEASE_STATE_ROOT="$state_root" \
  DSP_SKIP_SERVICE_ACTIONS=1 \
  bash "$script_path" "$@"
}

run_switch --web-release b --api-release b >/dev/null
[[ "$(readlink -f "$web_root/current")" == "$web_root/releases/b" ]]
[[ "$(readlink -f "$api_root/current")" == "$api_root/releases/b" ]]

run_switch --rollback-last >/dev/null
[[ "$(readlink -f "$web_root/current")" == "$web_root/releases/a" ]]
[[ "$(readlink -f "$api_root/current")" == "$api_root/releases/a" ]]

printf 'switch-release smoke test passed: %s\n' "$fixture"
