#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Storage Setup Script

echo "=== Storage Setup ==="

# Install Longhorn
if ! kubectl get ns longhorn-system &> /dev/null; then
  echo "Installing Longhorn..."
  kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.6.0/deploy/longhorn.yaml
fi

# Wait for Longhorn
kubectl wait --for=condition=available --timeout=300s deployment/longhorn-ui -n longhorn-system

# Set default storage class
kubectl patch storageclass longhorn -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'

echo "✅ Storage setup complete"
