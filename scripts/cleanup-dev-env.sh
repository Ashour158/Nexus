#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Cleanup Development Environment

echo "=== Cleaning up dev environment ==="

# Stop Docker containers
docker compose down -v

# Clean build artifacts
rm -rf services/*/dist
rm -rf packages/*/dist
rm -rf apps/*/dist

echo "✅ Cleanup complete"
