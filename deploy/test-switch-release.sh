#!/usr/bin/env bash
set -Eeuo pipefail

script_path="${1:-$(cd "$(dirname "$0")" && pwd)/switch-release.sh}"
fixture="$(mktemp -d "${TMPDIR:-/tmp}/dsp-switch-release.XXXXXX")"
web_root="$fixture/web"
api_root="$fixture/api"
state_root="$fixture/state"

mkdir -p "$web_root/releases/a/assets" "$web_root/releases/b/assets" "$api_root/releases/a" "$api_root/releases/b"
printf 'old chunk\n' >"$web_root/releases/a/assets/old.js"
printf 'new chunk\n' >"$web_root/releases/b/assets/new.js"
mkdir -p "$web_root/shared/assets"
printf 'stale chunk\n' >"$web_root/shared/assets/stale.js"
touch -d '40 days ago' "$web_root/shared/assets/stale.js"
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
[[ "$(cat "$web_root/shared/assets/old.js")" == "old chunk" ]]
[[ "$(cat "$web_root/shared/assets/new.js")" == "new chunk" ]]
[[ ! -e "$web_root/shared/assets/stale.js" ]]

run_switch --rollback-last >/dev/null
[[ "$(readlink -f "$web_root/current")" == "$web_root/releases/a" ]]
[[ "$(readlink -f "$api_root/current")" == "$api_root/releases/a" ]]

mock_bin="$fixture/bin"
curl_count="$fixture/curl-count"
mkdir -p "$mock_bin"
for command in nginx systemctl sleep; do
  printf '#!/usr/bin/env bash\nexit 0\n' >"$mock_bin/$command"
  chmod +x "$mock_bin/$command"
done
cat >"$mock_bin/curl" <<EOF
#!/usr/bin/env bash
count=\$((\$(cat "$curl_count" 2>/dev/null || printf 0) + 1))
printf '%s\n' "\$count" >"$curl_count"
((count >= 3))
EOF
chmod +x "$mock_bin/curl"

PATH="$mock_bin:$PATH" \
DSP_WEB_ROOT="$web_root" \
DSP_API_ROOT="$api_root" \
DSP_RELEASE_STATE_ROOT="$state_root" \
DSP_SKIP_SERVICE_ACTIONS=0 \
DSP_HEALTH_ATTEMPTS=3 \
DSP_HEALTH_DELAY_SECONDS=0 \
bash "$script_path" --web-release b --api-release b >/dev/null
[[ "$(cat "$curl_count")" == "3" ]]
[[ "$(readlink -f "$web_root/current")" == "$web_root/releases/b" ]]
[[ "$(readlink -f "$api_root/current")" == "$api_root/releases/b" ]]

printf 'switch-release smoke test passed: %s\n' "$fixture"
