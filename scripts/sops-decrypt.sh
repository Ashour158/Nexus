#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — SOPS Decryption Script

echo "=== SOPS Decryption ==="

# Decrypt secrets
for file in infrastructure/k8s/secrets/*.yaml; do
  echo "Decrypting $file..."
  sops --decrypt --in-place "$file"
done

echo "✅ Secrets decrypted"
