#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — AWS IAM Setup Script

echo "=== Setting up AWS IAM roles ==="

CLUSTER_NAME="nexus-crm"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
OIDC_PROVIDER=$(aws eks describe-cluster --name $CLUSTER_NAME --query "cluster.identity.oidc.issuer" --output text | sed -e "s/^https:\/\///")

# Create IAM role for service accounts
echo "[1/5] Creating IRSA role for cluster-autoscaler..."
cat > /tmp/cluster-autoscaler-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_PROVIDER}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${OIDC_PROVIDER}:sub": "system:serviceaccount:kube-system:cluster-autoscaler"
        }
      }
    }
  ]
}
EOF

aws iam create-role \
  --role-name cluster-autoscaler \
  --assume-role-policy-document file:///tmp/cluster-autoscaler-trust-policy.json || true

aws iam attach-role-policy \
  --role-name cluster-autoscaler \
  --policy-arn arn:aws:iam::aws:policy/AutoScalingFullAccess || true

echo "✅ AWS IAM setup complete"
