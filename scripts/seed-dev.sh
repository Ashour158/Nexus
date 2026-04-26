#!/bin/bash
set -e
echo "Seeding development data..."
if [ -f "services/auth-service/prisma/seed.ts" ]; then
  cd services/auth-service && pnpm prisma db seed && cd ../..
  echo "✓ auth-service seeded"
fi
if [ -f "services/crm-service/prisma/seed.ts" ]; then
  cd services/crm-service && pnpm prisma db seed && cd ../..
  echo "✓ crm-service seeded"
fi
echo "✅ Dev seed complete."
