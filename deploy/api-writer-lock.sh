#!/usr/bin/env bash
set -Eeuo pipefail

if (($# == 0)); then
  printf 'Usage: api-writer-lock.sh <command> [argument ...]\n' >&2
  exit 2
fi

lock_file="${DSP_API_WRITER_LOCK_FILE:-/run/dsp-idle-cloud/writer.lock}"
install -d -m 0750 "$(dirname "$lock_file")"
exec 9>"$lock_file"
flock --exclusive --nonblock 9 || {
  printf 'another DSP Idle API writer owns %s\n' "$lock_file" >&2
  exit 75
}
exec "$@"
