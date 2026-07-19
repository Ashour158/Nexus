#!/bin/sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  ENV_FILE=/etc/nexus/prod.env sh scripts/export-observability-evidence.sh
  sh scripts/export-observability-evidence.sh --preflight

Periodically captures recent Docker logs and a Prometheus loopback snapshot,
age-encrypts the evidence, uploads it via rclone, verifies remote size, and
retains a short local spool. This is evidence export, not HA remote-write.
USAGE
}

log() { printf '[nexus-observability-export] %s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die() { printf '[nexus-observability-export] ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }
is_placeholder() { case "${1:-}" in ""|CHANGE_ME*|REPLACE_*|example*|EXAMPLE*) return 0;; *) return 1;; esac; }
validate_rclone_dest() {
  case "$1" in *..*|*/|"") die "BACKUP_RCLONE_DEST must be a scoped prefix without .. or trailing slash" ;; *:/*) : ;; *) die "BACKUP_RCLONE_DEST must be remote:scoped/path" ;; esac
  remote=${1%%:*}; prefix=${1#*:}
  [ -n "$remote" ] && [ -n "$prefix" ] || die "BACKUP_RCLONE_DEST must include remote and path"
  case "$prefix" in /*|"") die "BACKUP_RCLONE_DEST path must be relative under the remote" ;; esac
}

load_env() {
  if [ -n "${ENV_FILE:-}" ]; then
    [ -f "$ENV_FILE" ] || die "ENV_FILE does not exist: $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

safe_rm_tree() {
  target=$1; root=$2
  rt=$(cd "$root" 2>/dev/null && pwd -P) || return 0
  pt=$(cd "$target" 2>/dev/null && pwd -P) || return 0
  case "$pt" in "$rt"/*) rm -rf -- "$pt";; *) die "refusing cleanup outside scratch root: $pt";; esac
}

preflight() {
  for c in docker curl jq age rclone sha256sum tar flock; do need "$c"; done
  : "${BACKUP_AGE_RECIPIENT:?required}"
  identity=${BACKUP_AGE_IDENTITY_FILE:-${AGE_IDENTITY_FILE:-}}
  [ -n "$identity" ] || die "BACKUP_AGE_IDENTITY_FILE or AGE_IDENTITY_FILE is required for decrypt verification"
  : "${BACKUP_RCLONE_DEST:?required}"
  is_placeholder "$BACKUP_AGE_RECIPIENT" && die "BACKUP_AGE_RECIPIENT is a placeholder"
  is_placeholder "$BACKUP_RCLONE_DEST" && die "BACKUP_RCLONE_DEST is a placeholder"
  [ -f "$identity" ] || die "backup age identity file missing"
  validate_rclone_dest "$BACKUP_RCLONE_DEST"
  case "${OBS_EXPORT_RCLONE_PREFIX:-observability}" in ""|/*|*..*|*/) die "OBS_EXPORT_RCLONE_PREFIX must be a scoped relative path without .. or trailing slash";; esac
}

case "${1:-}" in -h|--help) usage; exit 0;; --preflight) load_env; preflight; log "preflight ok"; exit 0;; "") ;; *) usage; exit 2;; esac
load_env
preflight

LOCK=${OBS_EXPORT_LOCK_FILE:-/var/lock/nexus-observability-export.lock}
SPOOL=${OBS_EXPORT_SPOOL_DIR:-/var/spool/nexus-observability}
SCRATCH_ROOT=${OBS_EXPORT_SCRATCH_ROOT:-/var/tmp/nexus-observability-export}
PROM=${PROMETHEUS_URL:-http://127.0.0.1:9090}
SINCE=${OBS_EXPORT_LOG_SINCE:-30m}
PREFIX=${OBS_EXPORT_RCLONE_PREFIX:-observability}
ID="nexus-observability-$(date -u +%Y%m%dT%H%M%SZ)"
SCRATCH="$SCRATCH_ROOT/$ID"
mkdir -p "$(dirname "$LOCK")" "$SPOOL" "$SCRATCH_ROOT"
cleanup() { safe_rm_tree "$SCRATCH" "$SCRATCH_ROOT"; }
trap cleanup EXIT INT TERM

(
  flock -n 9 || die "another observability export is already running"
  umask 077
  mkdir -p "$SCRATCH/logs" "$SCRATCH/prometheus"
  docker ps -a --format '{{.Names}}' | LC_ALL=C sort > "$SCRATCH/containers.txt"
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    case "$name" in *[!A-Za-z0-9_.-]*) continue;; esac
    docker logs --since "$SINCE" "$name" > "$SCRATCH/logs/$name.log" 2>&1 || die "docker logs failed for $name"
  done < "$SCRATCH/containers.txt"
  for q in up process_resident_memory_bytes container_memory_usage_bytes container_cpu_usage_seconds_total prometheus_tsdb_head_series; do
    curl -fsS "$PROM/api/v1/query" --get --data-urlencode "query=$q" > "$SCRATCH/prometheus/$q.json" || die "Prometheus query failed: $q"
    jq -e '.status == "success"' "$SCRATCH/prometheus/$q.json" >/dev/null || die "Prometheus query returned non-success: $q"
  done
  (cd "$SCRATCH" && find logs prometheus -type f | LC_ALL=C sort | while IFS= read -r f; do sha256sum "$f"; done) > "$SCRATCH/sha256sum.txt"
  cat > "$SCRATCH/manifest.json" <<EOF
{"id":"$ID","captured_at_utc":"$(date -u +%FT%TZ)","log_since":"$SINCE","prometheus_url":"$PROM","complete":true}
EOF
  tar_path="$SCRATCH/$ID.tar"
  enc_tmp="$SCRATCH/$ID.tar.age.tmp"
  enc_path="$SPOOL/$ID.tar.age"
  (cd "$SCRATCH" && tar -cf "$tar_path" logs prometheus containers.txt manifest.json sha256sum.txt)
  age -r "$BACKUP_AGE_RECIPIENT" -o "$enc_tmp" "$tar_path"
  identity=${BACKUP_AGE_IDENTITY_FILE:-${AGE_IDENTITY_FILE:-}}
  age -d -i "$identity" -o /dev/null "$enc_tmp" || die "encrypted evidence decrypt verification failed"
  mv "$enc_tmp" "$enc_path"
  rclone copyto "$enc_path" "$BACKUP_RCLONE_DEST/$PREFIX/$ID.tar.age"
  remote_size=$(rclone lsjson "$BACKUP_RCLONE_DEST/$PREFIX/$ID.tar.age" | jq -r '.[0].Size // empty')
  local_size=$(wc -c < "$enc_path" | tr -d ' ')
  [ "$remote_size" = "$local_size" ] || die "remote evidence size verification failed"
  find "$SPOOL" -maxdepth 1 -type f -name 'nexus-observability-*.tar.age' -mtime +"${OBS_EXPORT_LOCAL_RETENTION_DAYS:-3}" -exec rm -f {} +
  rclone delete "$BACKUP_RCLONE_DEST/$PREFIX" --include 'nexus-observability-*.tar.age' --min-age "${OBS_EXPORT_REMOTE_RETENTION_DAYS:-14}d"
  log "uploaded encrypted observability evidence to $BACKUP_RCLONE_DEST/$PREFIX/$ID.tar.age"
) 9>"$LOCK"
