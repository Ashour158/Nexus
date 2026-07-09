# Nexus CRM Infrastructure — Terraform

## Structure

```
infrastructure/terraform/
├── aws/              # AWS provider — EKS, RDS, ElastiCache, ALB, WAF, MSK, etc.
├── elasticache/      # Redis ElastiCache module
└── redis/            # Self-managed Redis (placeholder)
```

## AWS Module

### Resources

- **VPC** — 3 AZs, public + private subnets, NAT gateway
- **EKS** — Managed node groups with cluster autoscaler
- **RDS** — PostgreSQL 16.2 primary + read replica (prod only)
- **ElastiCache** — Redis 7 cluster with encryption
- **MSK** — Managed Kafka 3.6.0 with TLS
- **ALB** — Application Load Balancer with HTTPS redirect
- **WAF** — AWS Managed Rules + rate limiting (prod only)
- **S3** — Encrypted backups + assets buckets with lifecycle
- **KMS** — Key rotation enabled for all encryption
- **ECR** — Immutable image repositories with scan-on-push
- **Route53** — DNS records for app + api
- **CloudWatch** — Log groups + dashboard
- **Secrets Manager** — JWT keys + API keys

### Usage

```bash
cd infrastructure/terraform/aws
terraform init
terraform workspace new staging
terraform plan -var="environment=staging"
terraform apply
```

### Environments

| Environment | Nodes | RDS | Redis | Kafka | WAF |
|-------------|-------|-----|-------|-------|-----|
| staging     | 2-10  | db.t3.medium | cache.t3.micro | 2 brokers | No |
| production  | 3-10  | db.r6g.xlarge | cache.r6g.large | 3 brokers | Yes |
