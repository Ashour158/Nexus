#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Network Setup Script

echo "=== Network Setup ==="

# Install MetalLB
if ! kubectl get ns metallb-system &> /dev/null; then
  echo "Installing MetalLB..."
  kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.0/config/manifests/metallb-native.yaml
fi

# Wait for MetalLB
kubectl wait --for=condition=ready --timeout=300s pod -l app=metallb -n metallb-system

# Apply IP pool
kubectl apply -f infrastructure/k8s/metallb.yaml

echo "✅ Network setup complete"
