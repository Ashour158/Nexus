#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Database Schema Diff Script

echo "=== Schema Diff ==="

SERVICE="${1:-crm-service}"

# Generate current schema
cd "services/$SERVICE"
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script > schema-diff.sql

echo "✅ Schema diff generated: services/$SERVICE/schema-diff.sql"
