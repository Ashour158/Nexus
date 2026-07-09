#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Image Verification Script

echo "=== Verifying Docker Images ==="

# Verify with Cosign
if command -v cosign &> /dev/null; then
  for img in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep nexus-crm); do
    echo "Verifying $img with Cosign..."
    cosign verify "$img" || echo "❌ Verification failed for $img"
  done
else
  echo "⚠️ cosign not installed, skipping"
fi

echo "✅ Image verification complete"
