#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Infrastructure Cost Estimate

echo "=== Monthly Cost Estimate (AWS) ==="

cat <<EOF
Service               | Count | Unit Cost | Monthly
----------------------|-------|-----------|--------
EKS Control Plane     | 1     | \$73      | \$73
EKS Worker Nodes      | 3     | \$73/m5   | \$219
RDS PostgreSQL        | 1     | \$350     | \$350
RDS Read Replica      | 1     | \$350     | \$350
ElastiCache Redis     | 1     | \$45      | \$45
MSK Kafka             | 3     | \$200    | \$600
ALB                   | 1     | \$20      | \$20
S3 Storage            | 500GB | \$0.023   | \$12
CloudWatch            | -     | -         | \$50
Data Transfer         | -     | -         | \$100
----------------------|-------|-----------|--------
TOTAL                                       | ~\$1819
EOF

echo ""
echo "Note: Actual costs may vary based on usage and region."
