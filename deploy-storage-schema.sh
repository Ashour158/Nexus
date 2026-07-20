#!/bin/bash
# Create the missing storage tables (FileAttachment, StorageUsage, OutboxMessage).
#
# storage-service logs P2021 "The table public.FileAttachment does not exist",
# so its schema was never applied to nexus_storage. Both the document list and
# upload are down as a result.
#
# Two deliberate safety choices:
#  - DDL goes DIRECT to the managed Postgres, not through pgbouncer. Prisma DDL
#    over a transaction-pooled connection fails on this droplet.
#  - No --accept-data-loss. If the push would drop or alter anything, it fails
#    and we stop rather than trading one outage for a worse one.
set -euo pipefail
set -x

# The schema declares url = env("STORAGE_DATABASE_URL"), not DATABASE_URL, so
# that is the variable the CLI reads. Derive the direct (non-pooled) form from
# whichever of the two the container actually has set.
docker exec nexus-storage sh -c '
  SRC="${STORAGE_DATABASE_URL:-$DATABASE_URL}"
  DIRECT=$(echo "$SRC" | sed -E "s#@pgbouncer:6432#@nexus-pg-do-user-25765741-0.j.db.ondigitalocean.com:25060#")
  # NOTE: `*?*` would be wrong here — in shell globbing `?` matches ANY single
  # character, so that pattern is true for every non-empty string. An earlier
  # version used it and appended "&sslmode=require" to a URL with no query
  # string, which made the DATABASE NAME "nexus_storage&sslmode=require" and
  # caused Prisma to create that database. Match a literal `?` with `*\?*`.
  case "$DIRECT" in
    *sslmode=*) ;;
    *\?*)       DIRECT="${DIRECT}&sslmode=require" ;;
    *)          DIRECT="${DIRECT}?sslmode=require" ;;
  esac
  export STORAGE_DATABASE_URL="$DIRECT"
  cd /tmp && npx prisma db push --schema=/tmp/schema.prisma --skip-generate
'

echo "STORAGE SCHEMA PUSH DONE"
docker compose -f /opt/nexus/docker-compose.yml restart storage-service
