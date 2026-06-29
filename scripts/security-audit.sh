#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Security Audit Script

echo "=== Nexus CRM Security Audit ==="

# Check for secrets in code
echo "[1/5] Scanning for secrets..."
if command -v git-secrets &> /dev/null; then
  git secrets --scan
else
  echo "⚠️ git-secrets not installed, skipping"
fi

# Check for vulnerabilities in dependencies
echo "[2/5] Scanning dependencies..."
pnpm audit --audit-level moderate || true

# Check Docker images for vulnerabilities
echo "[3/5] Scanning Docker images..."
if command -v trivy &> /dev/null; then
  for img in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep nexus-crm); do
    echo "Scanning $img..."
    trivy image --severity HIGH,CRITICAL "$img" || true
  done
else
  echo "⚠️ Trivy not installed, skipping"
fi

# Check Terraform for misconfigurations
echo "[4/5] Scanning Terraform..."
if command -v checkov &> /dev/null; then
  checkov -d infrastructure/terraform/aws || true
else
  echo "⚠️ Checkov not installed, skipping"
fi

# Check Kubernetes manifests
echo "[5/5] Scanning K8s manifests..."
if command -v kube-score &> /dev/null; then
  kube-score score infrastructure/k8s/*.yaml || true
else
  echo "⚠️ kube-score not installed, skipping"
fi

echo "✅ Security audit complete"
