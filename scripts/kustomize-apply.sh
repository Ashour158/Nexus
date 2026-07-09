#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Kustomize Apply Script
# Usage: ./kustomize-apply.sh [environment]

ENVIRONMENT="${1:-staging}"

echo "=== Kustomize Apply for $ENVIRONMENT ==="

kustomize build infrastructure/k8s/overlays/$ENVIRONMENT | kubectl apply -f -

echo "✅ Kustomize apply complete"
