.PHONY: dev infra prod stop build test test-watch lint typecheck db-migrate db-seed certs clean logs

dev: infra
	pnpm dev

infra:
	docker compose up -d postgres redis kafka zookeeper meilisearch minio clickhouse
	@echo "⏳ Waiting for infrastructure..."
	@sleep 5
	@echo "✅ Infrastructure ready"

prod: certs
	docker compose up -d --build --wait
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
	docker compose logs -f --tail=100 nexus-$*

clean:
	docker compose down -v --remove-orphans
	pnpm clean
	@echo "✅ Clean complete. Run 'make dev' to start fresh."
