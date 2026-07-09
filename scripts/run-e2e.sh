#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — E2E Test Runner

echo "=== Running E2E Tests ==="

# Start services if not running
if ! curl -s http://localhost:3001/health > /dev/null; then
  echo "Starting services..."
  docker compose up -d
  sleep 15
fi

# Run Playwright tests
cd apps/web
npx playwright test

echo "✅ E2E tests complete"
