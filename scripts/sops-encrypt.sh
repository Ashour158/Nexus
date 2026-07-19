#!/bin/sh
set -eu

plain=${1:-secrets/prod.env}
encrypted=${2:-secrets/prod.env.sops.env}
required_vars="DOMAIN IMAGE_TAG POSTGRES_PASSWORD REDIS_PASSWORD MINIO_ROOT_PASSWORD JWT_SECRET INTERNAL_SERVICE_TOKEN ENCRYPTION_MASTER_KEY KEYCLOAK_ADMIN_PASSWORD GRAFANA_ADMIN_PASSWORD MEILI_MASTER_KEY BACKUP_AGE_RECIPIENT BACKUP_RCLONE_DEST BACKUP_PGHOST BACKUP_PGPORT BACKUP_PGUSER BACKUP_PGPASSWORD CAPACITY_ALERT_WEBHOOK_URL"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

case "${1:-}" in
  -h|--help)
    echo "Usage: sh scripts/sops-encrypt.sh [plain-env] [encrypted-output]"
    exit 0
    ;;
esac

command -v sops >/dev/null 2>&1 || die "sops is required."
[ -f .sops.yaml ] || die ".sops.yaml is missing."
[ -f "$plain" ] || die "plaintext dotenv file not found: $plain"

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
      die "$file has missing or placeholder value for $name"
    fi
  done
  port=$(dotenv_value BACKUP_PGPORT "$file")
  [ "$port" != "6432" ] || die "$file uses PgBouncer port 6432 for BACKUP_PGPORT; use direct managed Postgres"
}

case "$plain" in
  secrets/prod.env|/*) ;;
  *) die "plaintext path must be secrets/prod.env or an absolute path" ;;
esac

if grep -q 'REPLACE_WITH_YOUR_AGE_PUBLIC_KEY' .sops.yaml; then
  die "replace REPLACE_WITH_YOUR_AGE_PUBLIC_KEY in .sops.yaml before encrypting"
fi

validate_required_dotenv "$plain"

case "$encrypted" in
  secrets/*.sops.env) ;;
  *) die "encrypted output must be under secrets/ and end with .sops.env" ;;
esac

umask 077
tmp="${encrypted}.tmp.$$"
check=$(mktemp)
trap 'rm -f "$tmp" "$check"' EXIT HUP INT TERM

sops --encrypt --filename-override "$encrypted" --input-type dotenv --output-type dotenv "$plain" > "$tmp"
grep -q 'ENC\[' "$tmp" || die "generated file does not contain SOPS encrypted values"
grep -q '^sops_' "$tmp" || die "generated file does not contain SOPS metadata"
sops --decrypt --input-type dotenv --output-type dotenv "$tmp" > "$check"
validate_required_dotenv "$check"
mv "$tmp" "$encrypted"
trap - EXIT HUP INT TERM
rm -f "$check"

echo "Encrypted production dotenv bundle written: $encrypted"
echo "Commit only the encrypted bundle. Do not commit $plain."
