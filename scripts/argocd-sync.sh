#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — ArgoCD Sync Script

echo "=== ArgoCD Sync ==="

# Sync all applications
argocd app sync -l app.kubernetes.io/part-of=nexus-crm

echo "✅ ArgoCD sync triggered"
