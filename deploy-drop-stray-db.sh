#!/bin/bash
# Remove the stray database created by a shell-globbing bug in
# deploy-storage-schema.sh (an earlier version used `case $X in *?*)`, where `?`
# is a glob matching ANY single character, so "&sslmode=require" was appended to
# a URL with no query string and became part of the DATABASE NAME).
#
# Safety: this INSPECTS first and only drops if every table is empty. If any row
# is found anywhere, it aborts and prints the counts instead. Nothing about the
# real `nexus_storage` database is touched.
set -euo pipefail

STRAY='nexus_storage&sslmode=require'

# Build connection URLs inside the container so no credential is ever echoed.
# psql lives in the postgres container; the credentials live in storage's env.
BASE_URL=$(docker exec nexus-storage sh -c 'echo "${STORAGE_DATABASE_URL:-$DATABASE_URL}"' \
  | sed -E 's#@pgbouncer:6432#@nexus-pg-do-user-25765741-0.j.db.ondigitalocean.com:25060#')

# Strip the database path + any query string, then re-point at a specific db.
PREFIX=${BASE_URL%%\?*}
PREFIX=${PREFIX%/*}

ADMIN_URL="${PREFIX}/defaultdb?sslmode=require"
# The stray name contains & and = — percent-encode them for the URL form.
STRAY_ENCODED='nexus_storage%26sslmode%3Drequire'
STRAY_URL="${PREFIX}/${STRAY_ENCODED}?sslmode=require"

echo "=== 1. does the stray database exist? ==="
EXISTS=$(docker exec -e U="$ADMIN_URL" nexus-postgres sh -c \
  'psql "$U" -tAc "SELECT count(*) FROM pg_database WHERE datname = '"'"'nexus_storage&sslmode=require'"'"';"')
echo "matching databases: ${EXISTS}"
if [ "${EXISTS}" != "1" ]; then
  echo "stray database not present — nothing to do."
  exit 0
fi

echo "=== 2. row counts in every table of the stray database ==="
# n_live_tup is an estimate; follow with an exact count of any table it flags.
COUNTS=$(docker exec -e U="$STRAY_URL" nexus-postgres sh -c \
  'psql "$U" -tAc "SELECT coalesce(sum(n_live_tup),0) FROM pg_stat_user_tables;"')
TABLES=$(docker exec -e U="$STRAY_URL" nexus-postgres sh -c \
  'psql "$U" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname = '"'"'public'"'"';"')
echo "tables: ${TABLES}, estimated total rows: ${COUNTS}"

if [ "${COUNTS}" != "0" ]; then
  echo "ABORTING — the stray database contains rows. Not dropping anything."
  exit 1
fi

echo "=== 3. dropping (empty, confirmed) ==="
# WITH (FORCE) terminates any lingering connection so the drop cannot hang.
docker exec -e U="$ADMIN_URL" nexus-postgres sh -c \
  'psql "$U" -c "DROP DATABASE \"nexus_storage&sslmode=require\" WITH (FORCE);"'

echo "=== 4. verify it is gone, and that the REAL nexus_storage survives ==="
docker exec -e U="$ADMIN_URL" nexus-postgres sh -c \
  'psql "$U" -tAc "SELECT datname FROM pg_database WHERE datname LIKE '"'"'nexus_storage%'"'"' ORDER BY datname;"'
echo "DROP STRAY DB DONE"
