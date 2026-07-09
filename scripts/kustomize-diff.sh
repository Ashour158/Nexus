#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Kustomize Diff Script
# Usage: ./kustomize-diff.sh [environment]

ENVIRONMENT="${1:-staging}"

echo "=== Kustomize Diff for $ENVIRONMENT ==="

kustomize build infrastructure/k8s/overlays/$ENVIRONMENT | kubectl diff -f - || true

echo "✅ Kustomize diff complete"
