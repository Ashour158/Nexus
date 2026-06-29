#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Teleport Access Script

echo "=== Teleport Access ==="

# Check if tsh is installed
if ! command -v tsh &> /dev/null; then
  echo "⚠️ tsh not installed. Install from https://goteleport.com/download"
  exit 1
fi

# Login to Teleport
tsh login --proxy=teleport.nexus-crm.io

# Access Kubernetes
tsh kube login nexus-crm

echo "✅ Connected to Teleport"
echo "Run 'kubectl get pods -n nexus' to access cluster"
