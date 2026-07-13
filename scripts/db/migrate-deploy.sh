#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Nexus CRM — Prisma Migrate: deploy migrations into a running container
# ---------------------------------------------------------------------------
# Copies a service's prisma/migrations tree into its running container and runs
# `prisma migrate deploy` against that service's CUSTOM generated client schema
# (each service generates to node_modules/.prisma/<client>).
#
# Usage:
#   scripts/db/migrate-deploy.sh <svc> <container> <client>
#
#   <svc>        service dir under services/*        e.g. crm-service
#   <container>  docker compose service/container    e.g. nexus-crm
#   <client>     generated client dir under
#                node_modules/.prisma/               e.g. crm-client
#
# Example:
#   scripts/db/migrate-deploy.sh crm-service nexus-crm crm-client
#
# ---------------------------------------------------------------------------
# FIRST-TIME BASELINE NOTE (READ THIS BEFORE THE FIRST RUN)
# ---------------------------------------------------------------------------
# Production was built with `prisma db push` and has NO migration history.
# The 00000000000000_init migration in each service is a BASELINE that
# reproduces the schema already live in prod. Running `migrate deploy` against
# such a database would try to CREATE tables that already exist and fail.
#
# So, exactly once per service/database, mark the baseline as already-applied
# instead of deploying it (this runs NO SQL, it only writes a row into the
# _prisma_migrations bookkeeping table):
#
#   scripts/db/migrate-deploy.sh <svc> <container> <client> --baseline
#
# which runs, inside the container:
#   npx prisma migrate resolve --applied 00000000000000_init \
#       --schema=node_modules/.prisma/<client>/schema.prisma
#
# After the baseline is resolved once, all future migrations use the normal
# (no-flag) deploy path below.
# ---------------------------------------------------------------------------

svc="${1:?usage: migrate-deploy.sh <svc> <container> <client> [--baseline]}"
container="${2:?missing <container>}"
client="${3:?missing <client>}"
mode="${4:-deploy}"   # "deploy" (default) or "--baseline"

schema_path="node_modules/.prisma/${client}/schema.prisma"

echo "→ [$svc] copying migrations into $container ..."
docker compose cp "services/${svc}/prisma/migrations" "${container}:/app/prisma/migrations"

if [ "$mode" = "--baseline" ]; then
  echo "→ [$svc] BASELINE: marking 00000000000000_init as already-applied (no SQL run) ..."
  docker compose exec -T "$container" sh -c \
    "npx prisma migrate resolve --applied 00000000000000_init --schema=${schema_path}"
  echo "  ✓ [$svc] baseline resolved — future runs use plain 'migrate deploy'"
else
  echo "→ [$svc] running: prisma migrate deploy ..."
  docker compose exec -T "$container" sh -c \
    "npx prisma migrate deploy --schema=${schema_path}"
  echo "  ✓ [$svc] migrate deploy complete"
fi
