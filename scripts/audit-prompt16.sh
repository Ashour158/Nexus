#!/bin/bash
set -euo pipefail

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; }

# 1 requireEnv exported + used in >=5 services
if rg -n "export \* from './env\.js'" "packages/service-utils/src/index.ts" >/dev/null && [ "$(rg -n "requireEnv\(" services/*/src/index.ts --count | awk -F: '{sum+=$2} END {print sum+0}')" -ge 5 ]; then
  pass "requireEnv exported and used in at least 5 services"
else
  fail "requireEnv export/usage requirement"
fi

# 2 Dockerfiles for all 24 TS services
svc_count=$(rg -n "^" services/*/Dockerfile --files-with-matches | wc -l | tr -d ' ')
if [ "$svc_count" -ge 24 ]; then
  pass "Multi-stage Dockerfiles exist for all services (found $svc_count)"
else
  fail "Dockerfiles count too low: $svc_count"
fi

# 3 web standalone output
if rg -n "output:\s*'standalone'" "apps/web/next.config.mjs" >/dev/null; then
  pass "apps/web standalone output enabled"
else
  fail "apps/web standalone output missing"
fi

# 4 nginx routes all service prefixes
if rg -n "location /api/(crm|finance|workflow|analytics|storage|billing|integration|blueprint|approval|data|document|chatbot|cadence|territory|planning|reporting|portal|knowledge|incentive)/" "infrastructure/nginx/nginx.conf" >/dev/null; then
  pass "nginx has service prefix routes"
else
  fail "nginx service routes incomplete"
fi

# 5 ci workflow lint+test+build
if rg -n "lint-and-typecheck:|test:|build:" ".github/workflows/ci.yml" >/dev/null; then
  pass "CI has lint/test/build jobs"
else
  fail "CI jobs missing"
fi

# 6 deploy ssh step
if rg -n "appleboy/ssh-action" ".github/workflows/deploy.yml" >/dev/null; then
  pass "Deploy workflow has SSH step"
else
  fail "Deploy SSH step missing"
fi

# 7 prometheus targets all 24 services (sample includes tail services)
if rg -n "knowledge-service:3023|incentive-service:3024|portal-service:3022|reporting-service:3021" "infrastructure/prometheus/prometheus.yml" >/dev/null; then
  pass "Prometheus includes full service target set"
else
  fail "Prometheus targets incomplete"
fi

# 8 grafana provisioning files
if [ -f "infrastructure/grafana/provisioning/datasources/prometheus.yml" ] && [ -f "infrastructure/grafana/provisioning/dashboards/dashboard.yml" ]; then
  pass "Grafana provisioning files exist"
else
  fail "Grafana provisioning missing files"
fi

# 9 env examples all services + web
env_count=$(rg -n "^PORT=" services/*/.env.example --files-with-matches | wc -l | tr -d ' ')
if [ "$env_count" -ge 24 ] && [ -f "apps/web/.env.example" ]; then
  pass ".env.example exists for all services and web"
else
  fail "env examples missing (services: $env_count)"
fi

# 10 migrate-all lists prisma services
if rg -n "crm-service|auth-service|finance-service|document-service" "scripts/migrate-all.sh" >/dev/null; then
  pass "migrate-all.sh lists expected services"
else
  fail "migrate-all.sh missing expected service list"
fi

# 11 Makefile targets
if rg -n "^dev:|^prod:|^build:|^test:|^lint:|^db-migrate:|^db-seed:|^certs:" "Makefile" >/dev/null; then
  pass "Makefile has required targets"
else
  fail "Makefile targets incomplete"
fi

# 12 README sections
if rg -n "Quick Start \(Development\)|Architecture \(Services\)|Monitoring" "README.md" >/dev/null; then
  pass "README has required sections"
else
  fail "README sections missing"
fi

# 13 helmet security plugin
if rg -n "@fastify/helmet|securityPlugin" "packages/service-utils/src/security.ts" >/dev/null; then
  pass "Security plugin added"
else
  fail "Security plugin missing"
fi

# 14 nginx in compose
if rg -n "^\s+nginx:" "docker-compose.yml" >/dev/null; then
  pass "Nginx added to docker-compose"
else
  fail "Nginx service missing in compose"
fi
#!/bin/bash
set -euo pipefail

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; }

# 1 requireEnv exported + used in >=5 services
if rg -n "export \* from './env\.js'" "packages/service-utils/src/index.ts" >/dev/null && [ "$(rg -n "requireEnv\(" services/*/src/index.ts --count | awk -F: '{sum+=$2} END {print sum+0}')" -ge 5 ]; then
  pass "requireEnv exported and used in at least 5 services"
else
  fail "requireEnv export/usage requirement"
fi

# 2 Dockerfiles for all 24 TS services
svc_count=$(rg -n "^" services/*/Dockerfile --files-with-matches | wc -l | tr -d ' ')
if [ "$svc_count" -ge 24 ]; then pass "Multi-stage Dockerfiles exist for all services (found $svc_count)"; else fail "Dockerfiles count too low: $svc_count"; fi

# 3 web standalone output
if rg -n "output:\s*'standalone'" "apps/web/next.config.mjs" >/dev/null; then pass "apps/web standalone output enabled"; else fail "apps/web standalone output missing"; fi

# 4 nginx routes all service prefixes
if rg -n "location /api/(crm|finance|workflow|analytics|storage|billing|integration|blueprint|approval|data|document|chatbot|cadence|territory|planning|reporting|portal|knowledge|incentive)/" "infrastructure/nginx/nginx.conf" >/dev/null; then pass "nginx has service prefix routes"; else fail "nginx service routes incomplete"; fi

# 5 ci workflow lint+test+build
if rg -n "lint-and-typecheck:|test:|build:" ".github/workflows/ci.yml" >/dev/null; then pass "CI has lint/test/build jobs"; else fail "CI jobs missing"; fi

# 6 deploy ssh step
if rg -n "appleboy/ssh-action" ".github/workflows/deploy.yml" >/dev/null; then pass "Deploy workflow has SSH step"; else fail "Deploy SSH step missing"; fi

# 7 prometheus targets all 24 services (sample includes tail services)
if rg -n "knowledge-service:3023|incentive-service:3024|portal-service:3022|reporting-service:3021" "infrastructure/prometheus/prometheus.yml" >/dev/null; then pass "Prometheus includes full service target set"; else fail "Prometheus targets incomplete"; fi

# 8 grafana provisioning files
if [ -f "infrastructure/grafana/provisioning/datasources/prometheus.yml" ] && [ -f "infrastructure/grafana/provisioning/dashboards/dashboard.yml" ]; then pass "Grafana provisioning files exist"; else fail "Grafana provisioning missing files"; fi

# 9 env examples all services + web
env_count=$(rg -n "^PORT=" services/*/.env.example --files-with-matches | wc -l | tr -d ' ')
if [ "$env_count" -ge 24 ] && [ -f "apps/web/.env.example" ]; then pass ".env.example exists for all services and web"; else fail "env examples missing (services: $env_count)"; fi

# 10 migrate-all lists prisma services
if rg -n "crm-service|auth-service|finance-service|document-service" "scripts/migrate-all.sh" >/dev/null; then pass "migrate-all.sh lists expected services"; else fail "migrate-all.sh missing expected service list"; fi

# 11 Makefile targets
if rg -n "^dev:|^prod:|^build:|^test:|^lint:|^db-migrate:|^db-seed:|^certs:" "Makefile" >/dev/null; then pass "Makefile has required targets"; else fail "Makefile targets incomplete"; fi

# 12 README sections
if rg -n "Quick Start \(Development\)|Architecture \(Services\)|Monitoring" "README.md" >/dev/null; then pass "README has required sections"; else fail "README sections missing"; fi

# 13 helmet security plugin
if rg -n "@fastify/helmet|securityPlugin" "packages/service-utils/src/security.ts" >/dev/null; then pass "Security plugin added"; else fail "Security plugin missing"; fi

# 14 nginx in compose
if rg -n "^\s+nginx:" "docker-compose.yml" >/dev/null; then pass "Nginx added to docker-compose"; else fail "Nginx service missing in compose"; fi
