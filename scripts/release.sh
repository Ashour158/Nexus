#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Release Script
# Usage: ./release.sh <version>

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 v2.0.0"
  exit 1
fi

echo "=== Releasing $VERSION ==="

# Update version in all package.json files
find . -name package.json -not -path "*/node_modules/*" -exec \
  sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/g" {} \;

# Update Helm chart version
sed -i "s/version: .*/version: $VERSION/" infrastructure/helm/nexus-crm/Chart.yaml
sed -i "s/appVersion: \".*\"/appVersion: \"$VERSION\"/" infrastructure/helm/nexus-crm/Chart.yaml

# Build all services
pnpm build

# Run tests
pnpm test

# Create git tag
git add -A
git commit -m "Release $VERSION" || true
git tag -a "$VERSION" -m "Release $VERSION"

echo "✅ Release $VERSION ready"
echo "Push with: git push origin $VERSION"
