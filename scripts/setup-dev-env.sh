#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Development Environment Setup

echo "=== Nexus CRM Dev Environment Setup ==="

# Install dependencies
echo "[1/5] Installing dependencies..."
pnpm install

# Generate Prisma clients
echo "[2/5] Generating Prisma clients..."
pnpm db:generate

# Start infrastructure
echo "[3/5] Starting infrastructure services..."
docker compose up -d postgres redis kafka zookeeper clickhouse meilisearch minio

# Wait for services
echo "[4/5] Waiting for services to be ready..."
sleep 10

# Run migrations
echo "[5/5] Running database migrations..."
pnpm db:migrate

# Seed data
pnpm seed

echo "✅ Dev environment ready"
echo "Run 'pnpm dev' to start all services"
