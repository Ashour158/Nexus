#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Seal Secrets Script

echo "=== Sealing Secrets ==="

# Check if kubeseal is installed
if ! command -v kubeseal &> /dev/null; then
  echo "⚠️ kubeseal not installed. Install from https://github.com/bitnami-labs/sealed-secrets"
  exit 1
fi

# Seal all secrets
for file in infrastructure/k8s/secrets/*.yaml; do
  echo "Sealing $file..."
  kubeseal --format yaml < "$file" > "${file%.yaml}-sealed.yaml"
done

echo "✅ Secrets sealed"
