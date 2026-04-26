#!/bin/bash
set -e
echo "Seeding development data..."
cd services/crm-service && pnpm prisma db seed && cd ../..
cd services/auth-service && pnpm prisma db seed && cd ../..
echo "Seed complete."
