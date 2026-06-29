#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Canary Deployment Script
# Usage: ./canary-deploy.sh <service-name> <new-image>

SERVICE_NAME="${1:-}"
NEW_IMAGE="${2:-}"

if [[ -z "$SERVICE_NAME" || -z "$NEW_IMAGE" ]]; then
  echo "Usage: $0 <service-name> <new-image>"
  echo "Example: $0 crm-service nexus-crm/crm-service:v2.0.0"
  exit 1
fi

echo "=== Canary Deployment: $SERVICE_NAME ==="

# Deploy canary version
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${SERVICE_NAME}-canary
  namespace: nexus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${SERVICE_NAME}
      version: canary
  template:
    metadata:
      labels:
        app: ${SERVICE_NAME}
        version: canary
    spec:
      containers:
        - name: ${SERVICE_NAME}
          image: ${NEW_IMAGE}
          ports:
            - containerPort: 3000
EOF

# Wait for canary to be ready
kubectl rollout status deployment/${SERVICE_NAME}-canary -n nexus --timeout=300s

# Monitor metrics for 5 minutes
echo "Monitoring canary for 5 minutes..."
sleep 300

# Check error rate
ERROR_RATE=$(kubectl exec -n nexus-monitoring deploy/prometheus -- \
  wget -qO- 'http://localhost:9090/api/v1/query?query=sum(rate(http_requests_total{service="'${SERVICE_NAME}'-canary",status=~"5.."}[5m]))/sum(rate(http_requests_total{service="'${SERVICE_NAME}'-canary"}[5m]))' | \
  jq -r '.data.result[0].value[1] // "0"')

echo "Canary error rate: $ERROR_RATE"

if (( $(echo "$ERROR_RATE > 0.05" | bc -l) )); then
  echo "❌ Canary failed, rolling back..."
  kubectl delete deployment/${SERVICE_NAME}-canary -n nexus
  exit 1
fi

# Promote canary to production
echo "✅ Canary successful, promoting..."
kubectl set image deployment/${SERVICE_NAME} ${SERVICE_NAME}=${NEW_IMAGE} -n nexus
kubectl rollout status deployment/${SERVICE_NAME} -n nexus --timeout=300s

# Remove canary
kubectl delete deployment/${SERVICE_NAME}-canary -n nexus

echo "✅ Canary deployment complete"
