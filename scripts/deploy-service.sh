#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Service Deployment Script
# Usage: ./deploy-service.sh <service-name> [environment]

SERVICE_NAME="${1:-}"
ENVIRONMENT="${2:-staging}"

if [[ -z "$SERVICE_NAME" ]]; then
  echo "Usage: $0 <service-name> [environment]"
  echo "Example: $0 crm-service staging"
  exit 1
fi

echo "=== Deploying $SERVICE_NAME to $ENVIRONMENT ==="

# Build Docker image
docker build -t "nexus-crm/$SERVICE_NAME:latest" -t "nexus-crm/$SERVICE_NAME:$(git rev-parse --short HEAD)" "services/$SERVICE_NAME"

# Push to ECR (if configured)
if [[ -n "${ECR_REGISTRY:-}" ]]; then
  docker tag "nexus-crm/$SERVICE_NAME:latest" "$ECR_REGISTRY/$SERVICE_NAME:latest"
  docker push "$ECR_REGISTRY/$SERVICE_NAME:latest"
fi

# Deploy to Kubernetes using immutable git-SHA tag
IMAGE_TAG="$(git rev-parse --short HEAD)"
kubectl set image "deployment/$SERVICE_NAME" "$SERVICE_NAME=nexus-crm/$SERVICE_NAME:$IMAGE_TAG" -n nexus
kubectl rollout status "deployment/$SERVICE_NAME" -n nexus --timeout=300s

echo "✅ $SERVICE_NAME deployed successfully"
