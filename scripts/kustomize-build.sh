#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Kustomize Build Script
# Usage: ./kustomize-build.sh [environment]

ENVIRONMENT="${1:-staging}"

echo "=== Kustomize Build for $ENVIRONMENT ==="

kustomize build infrastructure/k8s/overlays/$ENVIRONMENT > kustomize-output.yaml

echo "✅ Kustomize build complete: kustomize-output.yaml"
