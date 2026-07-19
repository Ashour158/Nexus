#!/bin/sh
set -eu

encrypted=${1:-secrets/prod.env.sops.env}
runtime=${2:-/etc/nexus/prod.env}
required_vars="DOMAIN IMAGE_TAG POSTGRES_PASSWORD REDIS_PASSWORD MINIO_ROOT_PASSWORD JWT_SECRET INTERNAL_SERVICE_TOKEN ENCRYPTION_MASTER_KEY KEYCLOAK_ADMIN_PASSWORD GRAFANA_ADMIN_PASSWORD MEILI_MASTER_KEY BACKUP_AGE_RECIPIENT BACKUP_RCLONE_DEST BACKUP_PGHOST BACKUP_PGPORT BACKUP_PGUSER BACKUP_PGPASSWORD CAPACITY_ALERT_WEBHOOK_URL"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

case "${1:-}" in
  -h|--help)
    echo "Usage: sudo sh scripts/sops-decrypt.sh [encrypted-env] [runtime-env]"
    exit 0
    ;;
esac

command -v sops >/dev/null 2>&1 || die "sops is required."
[ -f "$encrypted" ] || die "encrypted dotenv bundle not found: $encrypted"

dotenv_value() {
  name=$1
  sed -n "s/^${name}=//p" "$2" | tail -n 1
}

is_placeholder() {
  case "$1" in
    ""|CHANGE_ME*|REPLACE_ME*|REPLACE_WITH*|REPLACE_*|TODO*|*example.com*|*yourcompany*|git-sha-required|203.0.113.*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

validate_required_dotenv() {
  file=$1
  for name in $required_vars; do
    value=$(dotenv_value "$name" "$file")
    if is_placeholder "$value"; then
      die "decrypted dotenv has missing or placeholder value for $name"
    fi
  done
  port=$(dotenv_value BACKUP_PGPORT "$file")
  [ "$port" != "6432" ] || die "decrypted dotenv uses PgBouncer port 6432 for BACKUP_PGPORT; use direct managed Postgres"
}

case "$runtime" in
  ""|/*) ;;
  *) die "runtime env path must be absolute and outside the repo" ;;
esac

case "$runtime" in
  "$(pwd)"/*|"$PWD"/*) die "runtime env path must be outside the repo" ;;
esac

if [ "$(id -u)" -ne 0 ]; then
  die "run as root so the runtime env file can be created with owner-only permissions"
fi

mkdir -p "$(dirname "$runtime")"
tmp="${runtime}.tmp.$$"
trap 'rm -f "$tmp"' EXIT HUP INT TERM

umask 077
sops --decrypt --input-type dotenv --output-type dotenv "$encrypted" > "$tmp"
validate_required_dotenv "$tmp"

chmod 600 "$tmp"
mv "$tmp" "$runtime"
trap - EXIT HUP INT TERM

echo "Decrypted runtime env file written atomically: $runtime"
echo "Plaintext was not printed. File mode is 0600."
