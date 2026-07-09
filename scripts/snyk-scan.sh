#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Snyk Security Scan

echo "=== Snyk Security Scan ==="

# Scan dependencies
echo "[1/3] Scanning dependencies..."
snyk test --severity-threshold=high || true

# Scan Docker images
echo "[2/3] Scanning Docker images..."
for img in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep nexus-crm); do
  echo "Scanning $img..."
  snyk container test "$img" --severity-threshold=high || true
done

# Monitor project
echo "[3/3] Setting up monitoring..."
snyk monitor || true

echo "✅ Snyk scan complete"
