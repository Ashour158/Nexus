#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Chaos Engineering Test Script
# Requires: chaos-mesh or litmus installed

echo "=== Nexus CRM Chaos Tests ==="

# Check if chaos-mesh is installed
if ! kubectl get ns chaos-mesh &> /dev/null; then
  echo "⚠️ Chaos Mesh not installed. Install with:"
  echo "  helm install chaos-mesh chaos-mesh/chaos-mesh -n chaos-mesh --create-namespace"
  exit 1
fi

# Pod failure test
echo "[1/3] Running pod failure test..."
cat <<EOF | kubectl apply -f -
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: pod-failure-test
  namespace: chaos-mesh
spec:
  action: pod-failure
  mode: one
  duration: 30s
  selector:
    namespaces:
      - nexus
    labelSelectors:
      app.kubernetes.io/name: nexus-crm
EOF

# Network delay test
echo "[2/3] Running network delay test..."
cat <<EOF | kubectl apply -f -
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: network-delay-test
  namespace: chaos-mesh
spec:
  action: delay
  mode: all
  duration: 30s
  delay:
    latency: 100ms
    correlation: "100"
    jitter: 0ms
  selector:
    namespaces:
      - nexus
    labelSelectors:
      app.kubernetes.io/name: nexus-crm
EOF

# CPU stress test
echo "[3/3] Running CPU stress test..."
cat <<EOF | kubectl apply -f -
apiVersion: chaos-mesh.org/v1alpha1
kind: StressChaos
metadata:
  name: cpu-stress-test
  namespace: chaos-mesh
spec:
  duration: 30s
  mode: one
  stressors:
    cpu:
      workers: 2
      load: 80
  selector:
    namespaces:
      - nexus
    labelSelectors:
      app.kubernetes.io/name: nexus-crm
EOF

echo "✅ Chaos tests submitted. Monitor with: kubectl get podchaos,networkchaos,stresschaos -n chaos-mesh"
