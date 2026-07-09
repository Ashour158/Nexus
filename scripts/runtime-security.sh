#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Runtime Security Check

echo "=== Runtime Security Check ==="

# Check Tetragon events
if kubectl get pods -n kube-system -l app=tetragon &> /dev/null; then
  echo "[1/3] Tetragon events:"
  kubectl logs -n kube-system -l app=tetragon --tail=50 | grep -i "alert\|deny\|kill" || true
else
  echo "⚠️ Tetragon not running"
fi

# Check Falco events
if kubectl get pods -n nexus-monitoring -l app=falco &> /dev/null; then
  echo "[2/3] Falco events:"
  kubectl logs -n nexus-monitoring -l app=falco --tail=50 | grep -i "warning\|error\|critical" || true
else
  echo "⚠️ Falco not running"
fi

# Check Hubble flows
if kubectl get pods -n kube-system -l app=hubble-relay &> /dev/null; then
  echo "[3/3] Hubble flows:"
  hubble observe --last 50 --namespace nexus || true
else
  echo "⚠️ Hubble not running"
fi

echo "✅ Runtime security check complete"
