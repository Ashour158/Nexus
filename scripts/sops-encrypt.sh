#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — SOPS Encryption Script

echo "=== SOPS Encryption ==="

# Check if sops is installed
if ! command -v sops &> /dev/null; then
  echo "⚠️ sops not installed. Install from https://github.com/getsops/sops"
  exit 1
fi

# Encrypt secrets
for file in infrastructure/k8s/secrets/*.yaml; do
  echo "Encrypting $file..."
  sops --encrypt --in-place "$file"
done

echo "✅ Secrets encrypted"
