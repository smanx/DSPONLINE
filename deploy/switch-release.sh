#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage:
  sudo bash deploy/switch-release.sh --web-release <id> --api-release <id>
  sudo bash deploy/switch-release.sh --rollback-last

Only frontend/backend code symlinks are switched. The production database is never restored or replaced.
EOF
}

web_root="${DSP_WEB_ROOT:-/var/www/dsp-idle}"
api_root="${DSP_API_ROOT:-/opt/dsp-idle-cloud}"
state_root="${DSP_RELEASE_STATE_ROOT:-/var/lib/dsp-idle-cloud/release-state}"
service_name="${DSP_SERVICE_NAME:-dsp-idle-cloud.service}"
health_url="${DSP_HEALTH_URL:-http://127.0.0.1:4320/api/health}"
skip_service_actions="${DSP_SKIP_SERVICE_ACTIONS:-0}"
web_release=""
api_release=""
rollback_last=0

while (($#)); do
  case "$1" in
    --web-release) web_release="${2:-}"; shift 2 ;;
    --api-release) api_release="${2:-}"; shift 2 ;;
    --rollback-last) rollback_last=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

current_web="$(readlink -f "$web_root/current")"
current_api="$(readlink -f "$api_root/current")"
if [[ -z "$current_web" || -z "$current_api" ]]; then
  printf 'Both current release symlinks must exist before switching.\n' >&2
  exit 1
fi

state_file="$state_root/previous-release"
if ((rollback_last)); then
  if [[ ! -f "$state_file" ]]; then
    printf 'No previous release state exists at %s\n' "$state_file" >&2
    exit 1
  fi
  target_web="$(sed -n '1p' "$state_file")"
  target_api="$(sed -n '2p' "$state_file")"
else
  if [[ -z "$web_release" && -z "$api_release" ]]; then usage >&2; exit 2; fi
  [[ -z "$web_release" ]] && target_web="$current_web" || target_web="$web_root/releases/$web_release"
  [[ -z "$api_release" ]] && target_api="$current_api" || target_api="$api_root/releases/$api_release"
fi

case "$target_web" in "$web_root"/releases/*) ;; *) printf 'Invalid web release path: %s\n' "$target_web" >&2; exit 1 ;; esac
case "$target_api" in "$api_root"/releases/*) ;; *) printf 'Invalid API release path: %s\n' "$target_api" >&2; exit 1 ;; esac
[[ -d "$target_web" ]] || { printf 'Missing web release: %s\n' "$target_web" >&2; exit 1; }
[[ -d "$target_api" ]] || { printf 'Missing API release: %s\n' "$target_api" >&2; exit 1; }

atomic_link() {
  local target="$1" current="$2" next="${2}.next.$$"
  ln -s "$target" "$next"
  mv -Tf "$next" "$current"
}

run_service_checks() {
  if [[ "$skip_service_actions" == "1" ]]; then return; fi
  nginx -t
  systemctl reload nginx
  systemctl restart "$service_name"
  curl --fail --silent --show-error --max-time 10 "$health_url" >/dev/null
}

restore_previous() {
  local status=$?
  trap - ERR
  printf 'Release switch failed; restoring previous code targets.\n' >&2
  atomic_link "$current_web" "$web_root/current" || true
  atomic_link "$current_api" "$api_root/current" || true
  if [[ "$skip_service_actions" != "1" ]]; then
    nginx -t && systemctl reload nginx || true
    systemctl restart "$service_name" || true
  fi
  exit "$status"
}

install -d -m 0750 "$state_root"
state_tmp="${state_file}.tmp.$$"
umask 027
printf '%s\n%s\n' "$current_web" "$current_api" >"$state_tmp"
mv -f "$state_tmp" "$state_file"

trap restore_previous ERR
atomic_link "$target_web" "$web_root/current"
atomic_link "$target_api" "$api_root/current"
run_service_checks
trap - ERR

printf 'web=%s\napi=%s\nrollback=sudo bash deploy/switch-release.sh --rollback-last\n' \
  "$(readlink -f "$web_root/current")" "$(readlink -f "$api_root/current")"
