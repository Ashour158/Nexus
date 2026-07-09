#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Image Signing Script

echo "=== Signing Docker Images ==="

# Sign with Cosign
if command -v cosign &> /dev/null; then
  for img in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep nexus-crm); do
    echo "Signing $img with Cosign..."
    cosign sign --yes "$img"
  done
else
  echo "⚠️ cosign not installed, skipping"
fi

# Sign with Notary
if command -v notary &> /dev/null; then
  for img in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep nexus-crm); do
    echo "Signing $img with Notary..."
    notary sign -s https://notary.nexus-crm.io "$img"
  done
else
  echo "⚠️ notary not installed, skipping"
fi

echo "✅ Image signing complete"
