#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Update Dependencies Script

echo "=== Updating Dependencies ==="

# Update root dependencies
echo "[1/3] Updating root dependencies..."
pnpm update

# Update service dependencies
echo "[2/3] Updating service dependencies..."
for svc in services/*/; do
  echo "Updating $svc..."
  (cd "$svc" && pnpm update) || true
done

# Update package dependencies
echo "[3/3] Updating package dependencies..."
for pkg in packages/*/; do
  echo "Updating $pkg..."
  (cd "$pkg" && pnpm update) || true
done

# Audit
pnpm audit --fix || true

echo "✅ Dependencies updated"
