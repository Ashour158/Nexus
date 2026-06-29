#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Tailscale Access Script

echo "=== Tailscale Access ==="

# Check if tailscale is installed
if ! command -v tailscale &> /dev/null; then
  echo "⚠️ Tailscale not installed. Install from https://tailscale.com/download"
  exit 1
fi

# Connect to tailnet
tailscale up --accept-routes

echo "✅ Connected to Tailscale"
echo "Access services at:"
echo "  - http://nexus-crm:3000"
echo "  - http://postgres:5432"
echo "  - http://redis:6379"
