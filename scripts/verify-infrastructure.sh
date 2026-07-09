#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Infrastructure Verification Script

echo "=== Nexus CRM Infrastructure Verification ==="

# Check Docker
echo "[1/8] Checking Docker..."
docker info > /dev/null 2>&1 || { echo "❌ Docker not running"; exit 1; }
echo "✅ Docker OK"

# Check Kubernetes
echo "[2/8] Checking Kubernetes..."
kubectl version --client > /dev/null 2>&1 || { echo "❌ kubectl not found"; exit 1; }
echo "✅ kubectl OK"

# Check Terraform
echo "[3/8] Checking Terraform..."
terraform version > /dev/null 2>&1 || { echo "❌ Terraform not found"; exit 1; }
echo "✅ Terraform OK"

# Check Helm
echo "[4/8] Checking Helm..."
helm version > /dev/null 2>&1 || { echo "❌ Helm not found"; exit 1; }
echo "✅ Helm OK"

# Check AWS CLI
echo "[5/8] Checking AWS CLI..."
aws --version > /dev/null 2>&1 || { echo "❌ AWS CLI not found"; exit 1; }
echo "✅ AWS CLI OK"

# Check Node.js
echo "[6/8] Checking Node.js..."
node --version > /dev/null 2>&1 || { echo "❌ Node.js not found"; exit 1; }
echo "✅ Node.js OK"

# Check pnpm
echo "[7/8] Checking pnpm..."
pnpm --version > /dev/null 2>&1 || { echo "❌ pnpm not found"; exit 1; }
echo "✅ pnpm OK"

# Check Git
echo "[8/8] Checking Git..."
git --version > /dev/null 2>&1 || { echo "❌ Git not found"; exit 1; }
echo "✅ Git OK"

echo ""
echo "=== All checks passed ==="
