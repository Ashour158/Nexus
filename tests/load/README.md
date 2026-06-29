# Load Testing

This directory contains K6 load tests for the Nexus CRM platform.

## Prerequisites

- [K6](https://k6.io/) installed
- Nexus CRM running (via docker-compose or Kubernetes)
- Kong API Gateway configured

## Running Load Tests

### Local Development

```bash
# Start the platform
make dev

# Run load tests against Kong proxy
k6 run -e BASE_URL=http://localhost:8000 tests/load/api-load-test.js
```

### Production/Staging

```bash
# Run against production
k6 run -e BASE_URL=https://api.nexus-crm.com tests/load/api-load-test.js

# With custom configuration
k6 run \
  -e BASE_URL=https://api.nexus-crm.com \
  -e K6_PROMETHEUS_RW_SERVER_URL=https://prometheus-prod.example.com \
  tests/load/api-load-test.js
```

## Test Scenarios

The load test covers:

- **Deals API** (40% of requests) - CRUD operations on deals
- **Contacts API** (20% of requests) - Contact management
- **Accounts API** (15% of requests) - Account operations
- **Quotes API** (10% of requests) - Quote management
- **Analytics API** (10% of requests) - Reporting queries
- **GraphQL API** (5% of requests) - Federated queries

## Performance Thresholds

- 95% of requests < 500ms response time
- Error rate < 10%
- GraphQL queries < 1000ms

## Monitoring

Load test results are automatically sent to Prometheus for analysis in Grafana.

## CI/CD Integration

Load tests run automatically in GitHub Actions after successful builds.

## Scaling Tests

For higher load testing:

```bash
# 1000 concurrent users
k6 run --vus 1000 --duration 30m tests/load/api-load-test.js

# Ramp up test
k6 run --stage 1m:100,5m:100,1m:200,5m:200,1m:0 tests/load/api-load-test.js
```