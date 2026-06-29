#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Flux Reconciliation Script

echo "=== Flux Reconciliation ==="

# Trigger manual reconciliation
flux reconcile kustomization nexus-crm --with-source

echo "✅ Flux reconciliation triggered"
