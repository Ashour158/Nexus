#!/bin/sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  ENV_FILE=/etc/nexus/prod.env sh scripts/check-capacity.sh
  sh scripts/check-capacity.sh --preflight

Checks byte and inode usage for / and Docker's data root, emits docker system df,
and sends alerts to local Alertmanager plus optional/required off-host webhook.
USAGE
}

log() { printf '[nexus-capacity] %s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die() { printf '[nexus-capacity] ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }
is_int() { case "$1" in ""|*[!0-9]*) return 1;; *) return 0;; esac; }

load_env() {
  if [ -n "${ENV_FILE:-}" ]; then
    [ -f "$ENV_FILE" ] || die "ENV_FILE does not exist: $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

percent_for() { df -P "$1" | awk 'NR==2 {gsub(/%/,"",$5); print $5}'; }
ipercent_for() { df -Pi "$1" | awk 'NR==2 {gsub(/%/,"",$5); print $5}'; }

docker_root() {
  docker info --format '{{.DockerRootDir}}'
}

post_alertmanager() {
  url=${ALERTMANAGER_URL:-http://127.0.0.1:9093}
  payload=$1
  curl -fsS -X POST "$url/api/v2/alerts" -H 'Content-Type: application/json' --data-binary "$payload" >/dev/null
}

post_webhook() {
  payload=$1
  if [ -n "${CAPACITY_ALERT_WEBHOOK_URL:-}" ]; then
    curl -fsS -X POST "$CAPACITY_ALERT_WEBHOOK_URL" -H 'Content-Type: application/json' --data-binary "$payload" >/dev/null
  elif [ "${CAPACITY_ALERT_WEBHOOK_REQUIRED:-0}" = "1" ]; then
    die "CAPACITY_ALERT_WEBHOOK_REQUIRED=1 but CAPACITY_ALERT_WEBHOOK_URL is empty"
  fi
}

validate_thresholds() {
  for t in "$warn" "$crit" "$inode_warn" "$inode_crit"; do
    is_int "$t" || die "threshold is not numeric: $t"
    [ "$t" -ge 1 ] && [ "$t" -le 100 ] || die "threshold must be 1-100: $t"
  done
  [ "$warn" -lt "$crit" ] || die "CAPACITY_WARN_PERCENT must be less than CAPACITY_CRITICAL_PERCENT"
  [ "$inode_warn" -lt "$inode_crit" ] || die "CAPACITY_INODE_WARN_PERCENT must be less than CAPACITY_INODE_CRITICAL_PERCENT"
}

validate_delivery_config() {
  case "${CAPACITY_ALERT_WEBHOOK_REQUIRED:-1}" in
    0|1) ;;
    *) die "CAPACITY_ALERT_WEBHOOK_REQUIRED must be 0 or 1" ;;
  esac
  if [ "${CAPACITY_ALERT_WEBHOOK_REQUIRED:-1}" = "1" ] && [ -z "${CAPACITY_ALERT_WEBHOOK_URL:-}" ]; then
    die "CAPACITY_ALERT_WEBHOOK_REQUIRED=1 but CAPACITY_ALERT_WEBHOOK_URL is empty"
  fi
}

load_env
warn=${CAPACITY_WARN_PERCENT:-80}
crit=${CAPACITY_CRITICAL_PERCENT:-90}
inode_warn=${CAPACITY_INODE_WARN_PERCENT:-80}
inode_crit=${CAPACITY_INODE_CRITICAL_PERCENT:-90}

case "${1:-}" in
  -h|--help) usage; exit 0;;
  --preflight) for c in df awk curl docker jq; do need "$c"; done; validate_thresholds; validate_delivery_config; docker info >/dev/null; docker system df >/dev/null; log "preflight ok"; exit 0;;
  "") ;;
  *) usage; exit 2;;
esac

for c in df awk curl docker jq; do need "$c"; done
validate_thresholds
validate_delivery_config
host=$(hostname 2>/dev/null || printf unknown)
now=$(date -u +%FT%TZ)
status=0
alerts='[]'

check_path() {
  path=$1
  label=$2
  bytes=$(percent_for "$path")
  inodes=$(ipercent_for "$path")
  level=""
  if [ "$bytes" -ge "$crit" ] || [ "$inodes" -ge "$inode_crit" ]; then
    level=critical
  elif [ "$bytes" -ge "$warn" ] || [ "$inodes" -ge "$inode_warn" ]; then
    level=warning
  fi
  printf '%s bytes=%s%% inodes=%s%%\n' "$label" "$bytes" "$inodes"
  if [ -n "$level" ]; then
    status=1
    item=$(jq -nc --arg level "$level" --arg host "$host" --arg path "$path" --arg label "$label" --arg startsAt "$now" --arg bytes "$bytes" --arg inodes "$inodes" \
      '[{labels:{alertname:"NexusHostCapacity",severity:$level,instance:$host,path:$path,scope:$label},annotations:{summary:("Nexus capacity " + $level + " on " + $label),description:("bytes=" + $bytes + "% inodes=" + $inodes + "%")},startsAt:$startsAt}]')
    alerts=$(printf '%s\n%s\n' "$alerts" "$item" | jq -s 'add')
  fi
}

check_path "/" root
dr=$(docker_root)
[ -d "$dr" ] || die "Docker data root does not exist: $dr"
check_path "$dr" docker-data-root
docker system df

if [ "$(printf '%s' "$alerts" | jq 'length')" -gt 0 ]; then
  delivery_failed=0
  post_alertmanager "$alerts" || { log "local Alertmanager delivery failed"; delivery_failed=1; }
  post_webhook "$alerts" || { log "off-host webhook delivery failed"; delivery_failed=1; }
  [ "$delivery_failed" -eq 0 ] || die "one or more required alert deliveries failed"
fi

exit "$status"
