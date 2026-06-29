.PHONY: dev infra prod stop build test test-watch lint typecheck db-migrate db-seed certs clean logs backup restore k8s-deploy k8s-delete helm-install helm-upgrade load-test graphql-compose kong-reload

dev: infra
	pnpm dev

infra:
	docker compose up -d postgres redis kafka zookeeper meilisearch minio clickhouse keycloak kong
	@echo "⏳ Waiting for infrastructure..."
	@sleep 10
	@echo "✅ Infrastructure ready"

prod: certs
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait
	@echo "✅ NEXUS running at https://localhost"

stop:
	docker compose down

build:
	pnpm build

test:
	pnpm test

test-watch:
	pnpm test --watch

lint:
	pnpm lint

typecheck:
	pnpm typecheck

db-migrate:
	@bash scripts/migrate-all.sh

db-seed:
	@bash scripts/seed-dev.sh

certs:
	@if [ ! -f infrastructure/nginx/certs/nexus.crt ]; then \
		bash infrastructure/nginx/generate-certs.sh; \
	else \
		echo "Certs already exist — skipping"; \
	fi

logs:
	docker compose logs -f --tail=100

logs-%:
	docker compose logs -f --tail=100 $*

backup:
	@bash infrastructure/postgres/backup.sh

restore:
	@bash infrastructure/postgres/restore.sh

# GraphQL Federation
graphql-compose:
	cd services/graphql-gateway && pnpm compose

graphql-dev:
	cd services/graphql-gateway && pnpm dev

# Kong API Gateway
kong-reload:
	docker compose restart kong

kong-logs:
	docker compose logs -f kong

# Kubernetes
k8s-deploy:
	kubectl apply -f infrastructure/k8s/

k8s-delete:
	kubectl delete -f infrastructure/k8s/

k8s-status:
	kubectl get pods,services,ingress -n nexus-system

# Helm
helm-install:
	helm install nexus-crm infrastructure/helm/nexus-crm -n nexus-system --create-namespace

helm-upgrade:
	helm upgrade nexus-crm infrastructure/helm/nexus-crm -n nexus-system

helm-delete:
	helm uninstall nexus-crm -n nexus-system

# Load Testing
load-test:
	k6 run tests/load/api-load-test.js

load-test-prod:
	k6 run -e BASE_URL=https://api.nexus-crm.com tests/load/api-load-test.js

# Development setup
setup-dev:
	@bash scripts/setup-dev-env.sh

# Monitoring
monitoring-up:
	docker compose up -d prometheus grafana

monitoring-down:
	docker compose down prometheus grafana

# Full platform
platform-up: infra
	@echo "🚀 Starting NEXUS CRM platform..."
	docker compose up -d
	@echo "⏳ Waiting for services to be healthy..."
	@sleep 30
	@echo "✅ NEXUS CRM platform ready!"
	@echo "🌐 Web UI: http://localhost:3100"
	@echo "🚪 API Gateway: http://localhost:8000"
	@echo "📊 GraphQL: http://localhost:4000/graphql"
	@echo "👑 Kong Admin: http://localhost:8001"
	@echo "📈 Grafana: http://localhost:3001"

platform-down:
	docker compose down

clean:
	docker compose down -v --remove-orphans
	pnpm clean
	@echo "✅ Clean complete. Run 'make dev' to start fresh."

backup:
	@bash infrastructure/postgres/backup.sh

restore:
	@echo "Usage: make restore DB=nexus_crm TS=20260426_020000"
	@bash infrastructure/postgres/restore.sh $(DB) $(TS)

kafka-topics: ## Bootstrap Kafka topics with correct partition/RF config
	pnpm tsx scripts/bootstrap-kafka-topics.ts
