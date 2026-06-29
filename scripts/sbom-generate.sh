#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — SBOM Generation

echo "=== Generating SBOM ==="

mkdir -p docs/sbom

# Generate SBOM for Node.js dependencies
if command -v cyclonedx-npm &> /dev/null; then
  cyclonedx-npm --output-file docs/sbom/sbom-npm.json
else
  echo "⚠️ cyclonedx-npm not installed, skipping"
fi

# Generate SBOM for Docker images
if command -v syft &> /dev/null; then
  for img in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep nexus-crm); do
    echo "Generating SBOM for $img..."
    syft "$img" -o cyclonedx-json > "docs/sbom/sbom-$(echo $img | tr '/' '-').json"
  done
else
  echo "⚠️ syft not installed, skipping"
fi

echo "✅ SBOM generation complete. Files in docs/sbom/"
