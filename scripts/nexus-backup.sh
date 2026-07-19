#!/bin/sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  ENV_FILE=/etc/nexus/prod.env sh scripts/nexus-backup.sh
  sh scripts/nexus-backup.sh --preflight

Creates one age-encrypted backup artifact for Postgres, ClickHouse,
Meilisearch, and MinIO, uploads it to a scoped rclone prefix, verifies the
remote object, and applies safe local/remote retention.
USAGE
}

log() { printf '[nexus-backup] %s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die() { printf '[nexus-backup] ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }
is_placeholder() { case "${1:-}" in ""|CHANGE_ME*|REPLACE_WITH*|REPLACE_*|example*|EXAMPLE*) return 0;; *) return 1;; esac; }
json_escape() { printf '%s' "$1" | jq -Rs .; }
urlencode() { printf '%s' "$1" | jq -sRr @uri; }

load_env() {
  if [ -n "${ENV_FILE:-}" ]; then
    [ -f "$ENV_FILE" ] || die "ENV_FILE does not exist: $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

preflight() {
  for c in psql pg_dump curl jq age rclone sha256sum tar flock docker find awk sed sort wc mc; do need "$c"; done
  command -v nice >/dev/null 2>&1 || log "nice unavailable; continuing without CPU priority lowering"
  command -v ionice >/dev/null 2>&1 || log "ionice unavailable; continuing without IO priority lowering"
}

validate_rclone_dest() {
  case "$1" in
    *..*|*/|"") die "BACKUP_RCLONE_DEST must be a scoped prefix without .. or trailing slash" ;;
    *:*/*) : ;;
    *) die "BACKUP_RCLONE_DEST must be remote:scoped/path, not a remote root" ;;
  esac
  remote=${1%%:*}
  prefix=${1#*:}
  [ -n "$remote" ] && [ -n "$prefix" ] || die "BACKUP_RCLONE_DEST must include remote and path"
  case "$prefix" in /*|"") die "BACKUP_RCLONE_DEST path must be relative under the remote" ;; esac
}

require_config() {
  : "${BACKUP_AGE_RECIPIENT:?required}"
  identity=${BACKUP_AGE_IDENTITY_FILE:-${AGE_IDENTITY_FILE:-}}
  [ -n "$identity" ] || die "BACKUP_AGE_IDENTITY_FILE or AGE_IDENTITY_FILE is required for decrypt verification"
  : "${BACKUP_RCLONE_DEST:?required, for example nexus-remote:nexus/prod/backups}"
  : "${BACKUP_PGHOST:?required}"
  : "${BACKUP_PGPORT:?required; must be managed Postgres direct port, not PgBouncer 6432}"
  : "${BACKUP_PGUSER:?required}"
  : "${BACKUP_PGPASSWORD:?required}"
  : "${MEILI_MASTER_KEY:?required}"
  : "${MINIO_ROOT_PASSWORD:?required}"
  is_placeholder "$BACKUP_AGE_RECIPIENT" && die "BACKUP_AGE_RECIPIENT is a placeholder"
  is_placeholder "$BACKUP_RCLONE_DEST" && die "BACKUP_RCLONE_DEST is a placeholder"
  is_placeholder "$BACKUP_PGHOST" && die "BACKUP_PGHOST is a placeholder"
  [ "$BACKUP_PGPORT" != "6432" ] || die "BACKUP_PGPORT=6432 is PgBouncer; use direct managed Postgres port 5432/25060"
  [ -f "$identity" ] || die "backup age identity file missing"
  validate_rclone_dest "$BACKUP_RCLONE_DEST"
}

run_low() {
  if command -v ionice >/dev/null 2>&1; then
    ionice -c2 -n7 nice -n 10 "$@"
  elif command -v nice >/dev/null 2>&1; then
    nice -n 10 "$@"
  else
    "$@"
  fi
}

safe_rm_tree() {
  target=$1; root=$2
  [ -n "$target" ] && [ -n "$root" ] || die "internal cleanup path error"
  rt=$(cd "$root" 2>/dev/null && pwd -P) || return 0
  pt=$(cd "$target" 2>/dev/null && pwd -P) || return 0
  case "$pt" in "$rt"/*) rm -rf -- "$pt";; *) die "refusing cleanup outside scratch root: $pt";; esac
}

pg_table_rows_from_dump() {
  db=$1
  docker exec "$PG_VERIFY_CONTAINER" psql -U drill -d "$db" -Atc "
with tables as (
  select n.nspname as schema_name, c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema')
), counts as (
  select format('%I.%I', schema_name, table_name) as table_name,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schema_name, table_name), false, true, '')))[1]::text::bigint as rows
  from tables
)
select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'rows', rows) order by table_name), '[]'::jsonb) from counts;"
}

postgres_backup() {
  log "capturing Postgres database inventory from direct managed endpoint"
  export PGPASSWORD=$BACKUP_PGPASSWORD
  mkdir -p "$STAGE/postgres" "$STAGE/evidence"
  dbs=$(psql -h "$BACKUP_PGHOST" -p "$BACKUP_PGPORT" -U "$BACKUP_PGUSER" -d "${BACKUP_PGDATABASE:-postgres}" -Atc \
    "select datname from pg_database where not datistemplate and datallowconn and has_database_privilege(current_user, datname, 'CONNECT') order by datname")
  [ -n "$dbs" ] || die "no non-template Postgres databases found"
  printf '%s\n' "$dbs" > "$STAGE/postgres/databases.txt"
  log "starting resource-limited scratch Postgres to derive exact counts from each dump"
  docker run -d --name "$PG_VERIFY_CONTAINER" \
    --cpus "${BACKUP_VERIFY_CPUS:-1.0}" \
    --memory "${BACKUP_VERIFY_MEMORY:-768m}" \
    -e POSTGRES_PASSWORD=drill \
    -e POSTGRES_USER=drill \
    postgres:16-alpine >/dev/null
  ready=0
  until docker exec "$PG_VERIFY_CONTAINER" pg_isready -U drill >/dev/null 2>&1; do
    ready=$((ready + 1))
    [ "$ready" -lt 60 ] || die "scratch Postgres did not become ready for dump verification"
    sleep 1
  done
  printf '[' > "$STAGE/evidence/postgres.json"
  first=1
  verify_index=0
  printf '%s\n' "$dbs" | while IFS= read -r db; do
    [ -n "$db" ] || continue
    case "$db" in *[!A-Za-z0-9_.-]*) die "refusing unsafe database name from server inventory: $db";; esac
    out="$STAGE/postgres/$db.dump"
    log "pg_dump -Fc database $db"
    run_low pg_dump -h "$BACKUP_PGHOST" -p "$BACKUP_PGPORT" -U "$BACKUP_PGUSER" -Fc -d "$db" -f "$out"
    [ -s "$out" ] || die "empty Postgres dump for $db"
    verify_index=$((verify_index + 1))
    verify_db="verify_$verify_index"
    docker exec "$PG_VERIFY_CONTAINER" createdb -U drill "$verify_db"
    docker exec -i "$PG_VERIFY_CONTAINER" pg_restore \
      -U drill --no-owner --no-privileges -d "$verify_db" < "$out"
    rows=$(pg_table_rows_from_dump "$verify_db" | jq -c 'sort_by(.table)')
    docker exec "$PG_VERIFY_CONTAINER" dropdb -U drill "$verify_db"
    sum=$(sha256sum "$out" | awk '{print $1}')
    [ "$first" = 1 ] || printf ',' >> "$STAGE/evidence/postgres.json"
    first=0
    jq -nc --arg name "$db" --arg file "postgres/$db.dump" --arg sha "$sum" --argjson rows "$rows" \
      '{name:$name,dump_file:$file,sha256:$sha,table_rows:$rows}' >> "$STAGE/evidence/postgres.json"
  done
  printf ']' >> "$STAGE/evidence/postgres.json"
  docker rm -f "$PG_VERIFY_CONTAINER" >/dev/null
}

clickhouse_checksum() {
  container=$1; db=$2; tbl=$3
  docker exec "$container" clickhouse-client --format JSONEachRow --query \
    "SELECT count() AS rows, toString(sum(cityHash64(*))) AS sum_cityhash64, toString(groupBitXor(cityHash64(*))) AS xor_cityhash64 FROM \`$db\`.\`$tbl\`"
}

clickhouse_backup() {
  mkdir -p "$STAGE/clickhouse" "$STAGE/evidence"
  ch_container=${CLICKHOUSE_CONTAINER:-nexus-clickhouse}
  docker inspect "$ch_container" >/dev/null 2>&1 || die "ClickHouse container $ch_container not found"
  log "capturing ClickHouse application tables sequentially"
  unsupported=$(docker exec "$ch_container" clickhouse-client --format TSV --query \
    "select database, name, engine from system.tables where database not in ('system','INFORMATION_SCHEMA','information_schema') and engine like '%View' order by database, name")
  [ -z "$unsupported" ] || die "ClickHouse view-like schemas require an explicit restore order and are not silently skipped: $unsupported"
  docker exec "$ch_container" clickhouse-client --format TSV --query \
    "select database, name from system.tables where database not in ('system','INFORMATION_SCHEMA','information_schema') and engine not like '%View' order by database, name" \
    > "$STAGE/clickhouse/tables.tsv"
  printf '[' > "$STAGE/evidence/clickhouse.json"
  first=1
  while IFS="$(printf '\t')" read -r db tbl; do
    [ -n "$db" ] || continue
    case "$db.$tbl" in *[!A-Za-z0-9_.$-]*) die "unsafe ClickHouse identifier in inventory: $db.$tbl";; esac
    schema="$STAGE/clickhouse/${db}.${tbl}.schema.sql"
    data="$STAGE/clickhouse/${db}.${tbl}.native"
    docker exec "$ch_container" clickhouse-client --query "SHOW CREATE TABLE \`$db\`.\`$tbl\`" > "$schema"
    grep -Eq 'CREATE TABLE|ATTACH TABLE' "$schema" || die "unsupported ClickHouse schema for $db.$tbl"
    run_low docker exec "$ch_container" clickhouse-client --query "SELECT * FROM \`$db\`.\`$tbl\` FORMAT Native" > "$data"
    stat=$(clickhouse_checksum "$ch_container" "$db" "$tbl")
    schema_sha=$(sha256sum "$schema" | awk '{print $1}')
    data_sha=$(sha256sum "$data" | awk '{print $1}')
    [ "$first" = 1 ] || printf ',' >> "$STAGE/evidence/clickhouse.json"
    first=0
    jq -nc --arg db "$db" --arg tbl "$tbl" --arg schema_file "clickhouse/${db}.${tbl}.schema.sql" --arg data_file "clickhouse/${db}.${tbl}.native" \
      --arg schema_sha "$schema_sha" --arg data_sha "$data_sha" --argjson stat "$stat" \
      '{database:$db,table:$tbl,schema_file:$schema_file,data_file:$data_file,schema_sha256:$schema_sha,data_sha256:$data_sha,rows:$stat.rows,sum_cityhash64:$stat.sum_cityhash64,xor_cityhash64:$stat.xor_cityhash64}' >> "$STAGE/evidence/clickhouse.json"
  done < "$STAGE/clickhouse/tables.tsv"
  printf ']' >> "$STAGE/evidence/clickhouse.json"
}

meili_dump_dir() {
  if [ -n "${MEILI_DUMPS_DIR:-}" ]; then printf '%s\n' "$MEILI_DUMPS_DIR"; return; fi
  docker inspect nexus-meilisearch --format '{{range .Mounts}}{{if eq .Destination "/meili_data"}}{{.Source}}{{end}}{{end}}'
}

meili_backup() {
  mkdir -p "$STAGE/meilisearch" "$STAGE/evidence"
  url=${MEILI_URL:-http://127.0.0.1:7700}
  log "creating Meilisearch dump through supported API"
  task=$(curl -fsS -X POST "$url/dumps" -H "Authorization: Bearer $MEILI_MASTER_KEY" | jq -r '.taskUid // .uid')
  [ -n "$task" ] && [ "$task" != "null" ] || die "Meilisearch dump task was not returned"
  i=0
  details=
  while :; do
    details=$(curl -fsS "$url/tasks/$task" -H "Authorization: Bearer $MEILI_MASTER_KEY")
    status=$(printf '%s' "$details" | jq -r '.status')
    [ "$status" = "succeeded" ] && break
    [ "$status" = "failed" ] && die "Meilisearch dump task failed"
    i=$((i + 1)); [ "$i" -le "${MEILI_DUMP_POLL_LIMIT:-120}" ] || die "Meilisearch dump task timed out"
    sleep 2
  done
  dump_uid=$(printf '%s' "$details" | jq -r '.details.dumpUid // .details.uid // empty')
  [ -n "$dump_uid" ] || die "Meilisearch task details did not include dump UID"
  dump_dir=$(meili_dump_dir)
  [ -n "$dump_dir" ] && [ -d "$dump_dir" ] || die "Meilisearch dump dir not found; set MEILI_DUMPS_DIR"
  src="$dump_dir/$dump_uid.dump"
  [ -s "$src" ] || src="$dump_dir/dumps/$dump_uid.dump"
  [ -s "$src" ] || die "Meilisearch dump file missing: $src"
  cp "$src" "$STAGE/meilisearch/meilisearch.dump"
  stats=$(curl -fsS "$url/stats" -H "Authorization: Bearer $MEILI_MASTER_KEY" | jq -c '[.indexes // {} | to_entries[] | {uid:.key, documents:(.value.numberOfDocuments // 0)}] | sort_by(.uid)')
  sum=$(sha256sum "$STAGE/meilisearch/meilisearch.dump" | awk '{print $1}')
  jq -nc --arg file "meilisearch/meilisearch.dump" --arg uid "$dump_uid" --arg sha "$sum" --argjson indexes "$stats" \
    '{dump_file:$file,dump_uid:$uid,sha256:$sha,indexes:$indexes}' > "$STAGE/evidence/meilisearch.json"
}

minio_backup() {
  mkdir -p "$STAGE/minio" "$STAGE/evidence"
  endpoint=${MINIO_ENDPOINT:-http://127.0.0.1:9000}
  case "$endpoint" in
    http://*) endpoint_scheme=http; endpoint_host=${endpoint#http://} ;;
    https://*) endpoint_scheme=https; endpoint_host=${endpoint#https://} ;;
    *) die "MINIO_ENDPOINT must start with http:// or https://" ;;
  esac
  user=${MINIO_ROOT_USER:-nexus}
  alias_name=nexus_src
  export "MC_HOST_${alias_name}=$endpoint_scheme://$(urlencode "$user"):$(urlencode "$MINIO_ROOT_PASSWORD")@$endpoint_host"
  bucket_list=$(mc ls "$alias_name") || die "mc ls failed against source MinIO; not silently backing up zero buckets"
  printf '%s\n' "$bucket_list" | awk 'NF {print $NF}' | sed 's,/$,,' | LC_ALL=C sort > "$STAGE/minio/buckets.txt"
  printf '[' > "$STAGE/evidence/minio.json"
  first_bucket=1
  while IFS= read -r bucket; do
    [ -n "$bucket" ] || continue
    case "$bucket" in *[!A-Za-z0-9_.-]*) die "unsafe MinIO bucket name: $bucket";; esac
    mkdir -p "$STAGE/minio/$bucket"
    run_low mc mirror --overwrite "$alias_name/$bucket" "$STAGE/minio/$bucket"
    manifest="$STAGE/minio/$bucket.objects.json"
    (cd "$STAGE/minio/$bucket" && find . -type f | sed 's#^\./##' | LC_ALL=C sort | while IFS= read -r rel; do
      size=$(wc -c < "$rel" | tr -d ' ')
      sha=$(sha256sum "$rel" | awk '{print $1}')
      jq -nc --arg path "$rel" --arg sha "$sha" --argjson size "$size" '{path:$path,bytes:$size,sha256:$sha}'
    done) | jq -cs 'sort_by(.path)' > "$manifest"
    objects=$(jq 'length' "$manifest")
    bytes=$(jq '[.[].bytes] | add // 0' "$manifest")
    [ "$first_bucket" = 1 ] || printf ',' >> "$STAGE/evidence/minio.json"
    first_bucket=0
    jq -nc --arg name "$bucket" --arg file "minio/$bucket.objects.json" --argjson objects "$objects" --argjson bytes "$bytes" --slurpfile items "$manifest" \
      '{name:$name,objects:$objects,bytes:$bytes,manifest_file:$file,items:$items[0]}' >> "$STAGE/evidence/minio.json"
  done < "$STAGE/minio/buckets.txt"
  printf ']' >> "$STAGE/evidence/minio.json"
}

write_manifest() {
  jq -n \
    --arg id "$BACKUP_ID" \
    --arg captured "$CAPTURED_AT" \
    --slurpfile pg "$STAGE/evidence/postgres.json" \
    --slurpfile ch "$STAGE/evidence/clickhouse.json" \
    --slurpfile meili "$STAGE/evidence/meilisearch.json" \
    --slurpfile minio "$STAGE/evidence/minio.json" \
    '{backup_id:$id,captured_at_utc:$captured,postgres:{databases:$pg[0]},clickhouse:{tables:$ch[0]},meilisearch:$meili[0],minio:{buckets:$minio[0]},complete:true}' \
    > "$MANIFEST"
  jq -e '.complete == true' "$MANIFEST" >/dev/null
}

publish_and_retain() {
  mkdir -p "$LOCAL_OUT"
  tar_path="$SCRATCH/${BACKUP_ID}.tar"
  enc_tmp="$SCRATCH/${BACKUP_ID}.tar.age.tmp"
  enc_final="$LOCAL_OUT/${BACKUP_ID}.tar.age"
  (cd "$STAGE" && tar -cf "$tar_path" .)
  age -r "$BACKUP_AGE_RECIPIENT" -o "$enc_tmp" "$tar_path"
  [ -s "$enc_tmp" ] || die "encrypted artifact is empty"
  identity=${BACKUP_AGE_IDENTITY_FILE:-${AGE_IDENTITY_FILE:-}}
  age -d -i "$identity" -o /dev/null "$enc_tmp" || die "encrypted artifact decrypt verification failed"
  mv "$enc_tmp" "$enc_final"
  local_sum=$(sha256sum "$enc_final" | awk '{print $1}')
  rclone copyto "$enc_final" "$BACKUP_RCLONE_DEST/${BACKUP_ID}.tar.age"
  remote_size=$(rclone lsjson "$BACKUP_RCLONE_DEST/${BACKUP_ID}.tar.age" | jq -r '.[0].Size // empty')
  local_size=$(wc -c < "$enc_final" | tr -d ' ')
  [ "$remote_size" = "$local_size" ] || die "remote artifact size verification failed"
  log "uploaded encrypted backup to $BACKUP_RCLONE_DEST/${BACKUP_ID}.tar.age sha256=$local_sum"
  find "$LOCAL_OUT" -maxdepth 1 -type f -name 'nexus-backup-*.tar.age' -mtime +"${BACKUP_LOCAL_RETENTION_DAYS:-7}" -exec rm -f {} +
  rclone delete "$BACKUP_RCLONE_DEST" --include 'nexus-backup-*.tar.age' --min-age "${BACKUP_REMOTE_RETENTION_DAYS:-30}d"
}

case "${1:-}" in -h|--help) usage; exit 0;; --preflight) load_env; preflight; require_config; log "preflight ok"; exit 0;; "") ;; *) usage; exit 2;; esac
load_env
preflight
require_config

LOCK=${BACKUP_LOCK_FILE:-/var/lock/nexus-backup.lock}
LOCAL_OUT=${BACKUP_LOCAL_DIR:-/var/backups/nexus}
SCRATCH_ROOT=${BACKUP_SCRATCH_ROOT:-/var/tmp/nexus-backup}
mkdir -p "$(dirname "$LOCK")" "$SCRATCH_ROOT"
BACKUP_ID="nexus-backup-$(date -u +%Y%m%dT%H%M%SZ)"
PG_VERIFY_CONTAINER="nexus-backup-pgverify-$(date -u +%Y%m%dT%H%M%SZ)"
CAPTURED_AT=$(date -u +%FT%TZ)
SCRATCH="$SCRATCH_ROOT/$BACKUP_ID"
STAGE="$SCRATCH/stage"
MANIFEST="$STAGE/manifest.json"
cleanup() {
  docker rm -f "$PG_VERIFY_CONTAINER" >/dev/null 2>&1 || true
  safe_rm_tree "$SCRATCH" "$SCRATCH_ROOT"
}
trap cleanup EXIT INT TERM

(
  flock -n 9 || die "another backup is already running"
  umask 077
  mkdir -p "$STAGE"
  postgres_backup
  clickhouse_backup
  meili_backup
  minio_backup
  write_manifest
  publish_and_retain
) 9>"$LOCK"
