#!/bin/sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  ENV_FILE=/etc/nexus/prod.env BACKUP_AGE_IDENTITY_FILE=/root/.config/sops/age/nexus-prod-keys.txt sh scripts/nexus-restore-drill.sh /path/to/nexus-backup-YYYYmmddTHHMMSSZ.tar.age

Restores one encrypted artifact into scratch targets only, asserts equality with
the backup manifest, and writes an atomic JSON evidence report. It never writes
to production targets.
USAGE
}

log() { printf '[nexus-restore-drill] %s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die() { printf '[nexus-restore-drill] ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"; }
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

safe_rm_tree() {
  target=$1; root=$2
  rt=$(cd "$root" 2>/dev/null && pwd -P) || return 0
  pt=$(cd "$target" 2>/dev/null && pwd -P) || return 0
  case "$pt" in "$rt"/*) rm -rf -- "$pt";; *) die "refusing cleanup outside scratch root: $pt";; esac
}

guard_name() {
  case "$1" in nexus_drill_*|nexus-drill-*) return 0;; *) die "scratch name lacks nexus_drill/nexus-drill guard prefix: $1";; esac
}

start_container() {
  name=$1; shift
  guard_name "$name"
  docker run -d --name "$name" --cpus "${RESTORE_DRILL_CPUS:-1.0}" --memory "${RESTORE_DRILL_MEMORY:-768m}" "$@" >/dev/null
}

finish_container() {
  name=$1
  if [ "${KEEP_SCRATCH:-0}" = "1" ]; then
    docker stop "$name" >/dev/null
  else
    docker rm -f "$name" >/dev/null
  fi
}

validate_archive() {
  archive=$1
  if ! tar -tf "$archive" | while IFS= read -r entry; do
    case "$entry" in
      ""|/*|..|../*|*/..|*/../*) exit 1 ;;
    esac
  done; then
    die "backup archive contains an unsafe path"
  fi
  tar -tvf "$archive" | awk '
    {
      type = substr($1, 1, 1)
      if (type != "-" && type != "d") {
        exit 1
      }
    }
  ' || die "backup archive contains a link or unsupported entry type"
}

assert_json_equal() {
  expected=$1; actual=$2; label=$3
  jq -S . "$expected" > "$expected.sorted"
  jq -S . "$actual" > "$actual.sorted"
  cmp -s "$expected.sorted" "$actual.sorted" || die "$label mismatch between manifest and scratch restore"
}

pg_table_rows_scratch() {
  container=$1; db=$2
  docker exec "$container" psql -U drill -d "$db" -Atc "
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

verify_postgres() {
  pg_container="$RUN_ID-postgres"; guard_name "$pg_container"
  start_container "$pg_container" -e POSTGRES_PASSWORD=drill -e POSTGRES_USER=drill postgres:16-alpine
  i=0; until docker exec "$pg_container" pg_isready -U drill >/dev/null 2>&1; do i=$((i + 1)); [ "$i" -lt 60 ] || die "scratch Postgres did not become ready"; sleep 1; done
  expected="$SCRATCH/expected-postgres.json"
  actual="$SCRATCH/actual-postgres.json"
  jq -c '[.postgres.databases[] | {name,table_rows:(.table_rows|sort_by(.table))}] | sort_by(.name)' "$MANIFEST" > "$expected"
  printf '[' > "$actual"; first=1
  jq -r '.postgres.databases[] | @base64' "$MANIFEST" | while IFS= read -r encoded; do
    db=$(printf '%s' "$encoded" | base64 -d | jq -r '.name')
    file=$(printf '%s' "$encoded" | base64 -d | jq -r '.dump_file')
    sha=$(printf '%s' "$encoded" | base64 -d | jq -r '.sha256')
    case "$db" in *[!A-Za-z0-9_.-]*) die "unsafe Postgres database name in manifest: $db" ;; esac
    [ "$file" = "postgres/$db.dump" ] || die "unexpected Postgres dump path in manifest: $file"
    dump="$SCRATCH/$file"
    [ -s "$dump" ] || die "Postgres dump missing: $file"
    actual_sha=$(sha256sum "$dump" | awk '{print $1}')
    [ "$actual_sha" = "$sha" ] || die "Postgres dump sha mismatch for $db"
    scratch_db="${RUN_ID}_${db}"; guard_name "$scratch_db"
    docker exec "$pg_container" createdb -U drill "$scratch_db"
    docker exec -i "$pg_container" pg_restore \
      -U drill --no-owner --no-privileges -d "$scratch_db" < "$dump"
    rows=$(pg_table_rows_scratch "$pg_container" "$scratch_db" | jq -c 'sort_by(.table)')
    [ "$first" = 1 ] || printf ',' >> "$actual"; first=0
    jq -nc --arg name "$db" --argjson rows "$rows" '{name:$name,table_rows:$rows}' >> "$actual"
  done
  printf ']' >> "$actual"
  jq -c 'sort_by(.name)' "$actual" > "$actual.tmp" && mv "$actual.tmp" "$actual"
  assert_json_equal "$expected" "$actual" "Postgres table_rows"
  finish_container "$pg_container"
}

rewrite_clickhouse_schema() {
  in=$1; out=$2; old_db=$3; old_tbl=$4; new_db=$5
  if grep -Eq "^(CREATE|ATTACH) TABLE \`$old_db\`\.\`$old_tbl\`" "$in"; then
    sed "s/^\(CREATE\|ATTACH\) TABLE \`$old_db\`\.\`$old_tbl\`/\1 TABLE \`$new_db\`.\`$old_tbl\`/" "$in" > "$out"
  elif grep -Eq "^(CREATE|ATTACH) TABLE $old_db\\.$old_tbl" "$in"; then
    sed "s/^\(CREATE\|ATTACH\) TABLE $old_db\\.$old_tbl/\1 TABLE \`$new_db\`.\`$old_tbl\`/" "$in" > "$out"
  elif grep -Eq "^(CREATE|ATTACH) TABLE \`$old_tbl\`" "$in"; then
    sed "s/^\(CREATE\|ATTACH\) TABLE \`$old_tbl\`/\1 TABLE \`$new_db\`.\`$old_tbl\`/" "$in" > "$out"
  elif grep -Eq "^(CREATE|ATTACH) TABLE $old_tbl" "$in"; then
    sed "s/^\(CREATE\|ATTACH\) TABLE $old_tbl/\1 TABLE \`$new_db\`.\`$old_tbl\`/" "$in" > "$out"
  else
    die "unsupported ClickHouse schema form for $old_db.$old_tbl"
  fi
}

ch_checksum_scratch() {
  container=$1; db=$2; tbl=$3
  docker exec "$container" clickhouse-client --format JSONEachRow --query \
    "SELECT count() AS rows, toString(sum(cityHash64(*))) AS sum_cityhash64, toString(groupBitXor(cityHash64(*))) AS xor_cityhash64 FROM \`$db\`.\`$tbl\`"
}

verify_clickhouse() {
  ch_container="$RUN_ID-clickhouse"; guard_name "$ch_container"
  start_container "$ch_container" clickhouse/clickhouse-server:24.3-alpine
  i=0; until docker exec "$ch_container" clickhouse-client --query "SELECT 1" >/dev/null 2>&1; do i=$((i + 1)); [ "$i" -lt 90 ] || die "scratch ClickHouse did not become ready"; sleep 1; done
  expected="$SCRATCH/expected-clickhouse.json"
  actual="$SCRATCH/actual-clickhouse.json"
  jq -c '[.clickhouse.tables[] | {database,table,rows,sum_cityhash64,xor_cityhash64}] | sort_by(.database,.table)' "$MANIFEST" > "$expected"
  printf '[' > "$actual"; first=1
  jq -r '.clickhouse.tables[] | @base64' "$MANIFEST" | while IFS= read -r encoded; do
    item=$(printf '%s' "$encoded" | base64 -d)
    db=$(printf '%s' "$item" | jq -r '.database'); tbl=$(printf '%s' "$item" | jq -r '.table')
    schema_file=$(printf '%s' "$item" | jq -r '.schema_file'); data_file=$(printf '%s' "$item" | jq -r '.data_file')
    case "$db.$tbl" in *[!A-Za-z0-9_.$-]*) die "unsafe ClickHouse identifier in manifest: $db.$tbl" ;; esac
    [ "$schema_file" = "clickhouse/${db}.${tbl}.schema.sql" ] || die "unexpected ClickHouse schema path: $schema_file"
    [ "$data_file" = "clickhouse/${db}.${tbl}.native" ] || die "unexpected ClickHouse data path: $data_file"
    [ "$(sha256sum "$SCRATCH/$schema_file" | awk '{print $1}')" = "$(printf '%s' "$item" | jq -r '.schema_sha256')" ] || die "ClickHouse schema sha mismatch for $db.$tbl"
    [ "$(sha256sum "$SCRATCH/$data_file" | awk '{print $1}')" = "$(printf '%s' "$item" | jq -r '.data_sha256')" ] || die "ClickHouse data sha mismatch for $db.$tbl"
    scratch_db="${RUN_ID}_${db}"; guard_name "$scratch_db"
    docker exec "$ch_container" clickhouse-client --query "CREATE DATABASE IF NOT EXISTS \`$scratch_db\`"
    scratch_schema="$SCRATCH/clickhouse/${db}.${tbl}.scratch.sql"
    rewrite_clickhouse_schema "$SCRATCH/$schema_file" "$scratch_schema" "$db" "$tbl" "$scratch_db"
    docker exec -i "$ch_container" clickhouse-client --multiquery < "$scratch_schema" || die "ClickHouse schema restore failed for $db.$tbl"
    docker exec -i "$ch_container" clickhouse-client --query "INSERT INTO \`$scratch_db\`.\`$tbl\` FORMAT Native" < "$SCRATCH/$data_file"
    stat=$(ch_checksum_scratch "$ch_container" "$scratch_db" "$tbl")
    [ "$first" = 1 ] || printf ',' >> "$actual"; first=0
    jq -nc --arg db "$db" --arg tbl "$tbl" --argjson stat "$stat" '{database:$db,table:$tbl,rows:$stat.rows,sum_cityhash64:$stat.sum_cityhash64,xor_cityhash64:$stat.xor_cityhash64}' >> "$actual"
  done
  printf ']' >> "$actual"
  jq -c 'sort_by(.database,.table)' "$actual" > "$actual.tmp" && mv "$actual.tmp" "$actual"
  assert_json_equal "$expected" "$actual" "ClickHouse rows/checksum"
  finish_container "$ch_container"
}

meili_stats_from_container() {
  container=$1
  docker exec "$container" /bin/sh -c 'wget -qO- --header="Authorization: Bearer drill" http://127.0.0.1:7700/stats' |
    jq -c '[.indexes // {} | to_entries[] | {uid:.key, documents:(.value.numberOfDocuments // 0)}] | sort_by(.uid)'
}

verify_meilisearch() {
  meili_container="$RUN_ID-meili"; guard_name "$meili_container"
  dump="$SCRATCH/meilisearch/meilisearch.dump"
  [ -s "$dump" ] || die "Meilisearch dump missing"
  [ "$(sha256sum "$dump" | awk '{print $1}')" = "$(jq -r '.meilisearch.sha256' "$MANIFEST")" ] || die "Meilisearch dump sha mismatch"
  start_container "$meili_container" -v "$SCRATCH/meilisearch:/dumps:ro" getmeili/meilisearch:v1.8 \
    meilisearch --master-key drill --import-dump /dumps/meilisearch.dump
  i=0
  until docker exec "$meili_container" /bin/sh -c 'wget -qO- --header="Authorization: Bearer drill" http://127.0.0.1:7700/health >/dev/null 2>&1'; do
    i=$((i + 1)); [ "$i" -lt 120 ] || die "scratch Meilisearch did not become ready from dump import"
    sleep 1
  done
  jq -c '.meilisearch.indexes | sort_by(.uid)' "$MANIFEST" > "$SCRATCH/expected-meili.json"
  meili_stats_from_container "$meili_container" > "$SCRATCH/actual-meili.json"
  assert_json_equal "$SCRATCH/expected-meili.json" "$SCRATCH/actual-meili.json" "Meilisearch index counts"
  finish_container "$meili_container"
}

verify_minio() {
  need mc
  minio_container="$RUN_ID-minio"; guard_name "$minio_container"
  user=${RESTORE_DRILL_MINIO_USER:-drill}
  pass=${RESTORE_DRILL_MINIO_PASSWORD:-drill-password-change-me}
  port=${RESTORE_DRILL_MINIO_PORT:-19000}
  start_container "$minio_container" -e "MINIO_ROOT_USER=$user" -e "MINIO_ROOT_PASSWORD=$pass" -p "127.0.0.1:$port:9000" minio/minio:RELEASE.2025-09-07T16-13-09Z server /data
  alias_name=nexus_drill_minio
  export "MC_HOST_${alias_name}=http://$(urlencode "$user"):$(urlencode "$pass")@127.0.0.1:$port"
  i=0; until mc ls "$alias_name" >/dev/null 2>&1; do i=$((i + 1)); [ "$i" -lt 60 ] || die "scratch MinIO did not become ready"; sleep 1; done
  restore_root="$SCRATCH/minio-roundtrip"
  mkdir -p "$restore_root"
  jq -r '.minio.buckets[]?.name' "$MANIFEST" | while IFS= read -r bucket; do
    [ -n "$bucket" ] || continue
    case "$bucket" in *[!A-Za-z0-9_.-]*) die "unsafe MinIO bucket name in manifest: $bucket" ;; esac
    mc mb "$alias_name/$bucket" >/dev/null
    mc mirror --overwrite "$SCRATCH/minio/$bucket" "$alias_name/$bucket"
    mkdir -p "$restore_root/$bucket"
    mc mirror --overwrite "$alias_name/$bucket" "$restore_root/$bucket"
  done
  expected="$SCRATCH/expected-minio.json"
  actual="$SCRATCH/actual-minio.json"
  jq -c '[.minio.buckets[] | {name,items:(.items|sort_by(.path))}] | sort_by(.name)' "$MANIFEST" > "$expected"
  printf '[' > "$actual"; first_bucket=1
  jq -r '.minio.buckets[]?.name' "$MANIFEST" | while IFS= read -r bucket; do
    case "$bucket" in *[!A-Za-z0-9_.-]*) die "unsafe MinIO bucket name in manifest: $bucket" ;; esac
    manifest="$SCRATCH/$bucket.actual.json"
    if [ -d "$restore_root/$bucket" ]; then
      (cd "$restore_root/$bucket" && find . -type f | sed 's#^\./##' | LC_ALL=C sort | while IFS= read -r rel; do
        size=$(wc -c < "$rel" | tr -d ' ')
        sha=$(sha256sum "$rel" | awk '{print $1}')
        jq -nc --arg path "$rel" --arg sha "$sha" --argjson size "$size" '{path:$path,bytes:$size,sha256:$sha}'
      done) | jq -cs 'sort_by(.path)' > "$manifest"
    else
      printf '[]' > "$manifest"
    fi
    [ "$first_bucket" = 1 ] || printf ',' >> "$actual"; first_bucket=0
    jq -nc --arg name "$bucket" --slurpfile items "$manifest" '{name:$name,items:$items[0]}' >> "$actual"
  done
  printf ']' >> "$actual"
  jq -c 'sort_by(.name)' "$actual" > "$actual.tmp" && mv "$actual.tmp" "$actual"
  assert_json_equal "$expected" "$actual" "MinIO object manifest"
  finish_container "$minio_container"
}

artifact=${1:-}
case "$artifact" in -h|--help) usage; exit 0;; esac
for c in age tar jq sha256sum docker curl find awk sed sort cmp base64 date flock; do need "$c"; done
load_env
identity=${BACKUP_AGE_IDENTITY_FILE:-${AGE_IDENTITY_FILE:-}}
[ -n "$identity" ] || die "BACKUP_AGE_IDENTITY_FILE or AGE_IDENTITY_FILE is required for artifact decrypt"
[ -f "$identity" ] || die "backup age identity file missing"
[ -n "$artifact" ] || { usage; exit 2; }
[ -s "$artifact" ] || die "artifact missing or empty: $artifact"

SCRATCH_ROOT=${RESTORE_DRILL_SCRATCH_ROOT:-/var/tmp/nexus-restore-drill}
RUN_ID="nexus_drill_$(date -u +%Y%m%dT%H%M%SZ)"
guard_name "$RUN_ID"
SCRATCH="$SCRATCH_ROOT/$RUN_ID"
REPORT_DIR=${RESTORE_DRILL_REPORT_DIR:-/var/log/nexus}
REPORT="$REPORT_DIR/${RUN_ID}.json"
REPORT_TMP="$REPORT.tmp.$$"
LOCK=${RESTORE_DRILL_LOCK_FILE:-/var/lock/nexus-restore-drill.lock}
mkdir -p "$SCRATCH_ROOT" "$SCRATCH" "$REPORT_DIR" "$(dirname "$LOCK")"
exec 9>"$LOCK"
flock -n 9 || die "another restore drill is already running"
cleanup() {
  rm -f "$REPORT_TMP" "$REPORT_TMP.valid"
  if [ "${KEEP_SCRATCH:-0}" = "1" ]; then
    docker stop "$RUN_ID-postgres" "$RUN_ID-clickhouse" "$RUN_ID-meili" "$RUN_ID-minio" >/dev/null 2>&1 || true
  else
    docker rm -f "$RUN_ID-postgres" "$RUN_ID-clickhouse" "$RUN_ID-meili" "$RUN_ID-minio" >/dev/null 2>&1 || true
    safe_rm_tree "$SCRATCH" "$SCRATCH_ROOT"
  fi
}
trap cleanup EXIT INT TERM

start_epoch=$(date -u +%s)
start_iso=$(date -u +%FT%TZ)
log "decrypting artifact into scratch"
age -d -i "$identity" -o "$SCRATCH/backup.tar" "$artifact"
validate_archive "$SCRATCH/backup.tar"
tar --no-same-owner --no-same-permissions -xf "$SCRATCH/backup.tar" -C "$SCRATCH"
MANIFEST="$SCRATCH/manifest.json"
[ -f "$MANIFEST" ] || die "manifest.json missing from artifact"
jq -e '.complete == true' "$MANIFEST" >/dev/null || die "manifest.complete is not true"
captured=$(jq -r '.captured_at_utc' "$MANIFEST")
backup_epoch=$(date -u -d "$captured" +%s 2>/dev/null) || die "invalid manifest captured_at_utc"
[ "$backup_epoch" -le "$start_epoch" ] || die "manifest captured_at_utc is in the future"
rpo=$((start_epoch - backup_epoch))

verify_postgres
verify_clickhouse
verify_meilisearch
verify_minio

end_epoch=$(date -u +%s)
end_iso=$(date -u +%FT%TZ)
rto=$((end_epoch - start_epoch))
jq -n \
  --arg run_id "$RUN_ID" \
  --arg artifact "$artifact" \
  --arg started "$start_iso" \
  --arg ended "$end_iso" \
  --argjson rpo "$rpo" \
  --argjson rto "$rto" \
  '{run_id:$run_id,artifact:$artifact,started_at_utc:$started,ended_at_utc:$ended,RPO_SECONDS:$rpo,RTO_SECONDS:$rto,postgres:{verified:true},clickhouse:{verified:true},meilisearch:{verified:true},minio:{verified:true}}' \
  > "$REPORT_TMP"
jq . "$REPORT_TMP" > "$REPORT_TMP.valid"
mv "$REPORT_TMP.valid" "$REPORT"
rm -f "$REPORT_TMP"
cat "$REPORT"
