# Staging Environment & Managed-Postgres Cutover — Runbook

This is the operator runbook for the two infra items that need **your cloud credentials** to
execute (the code/config side is done: `cd.yml`, `deploy-staging.yml`, migration baselines,
`scripts/db/baseline-cutover.sh`). Nothing here is automated because it provisions billable cloud
resources and writes secrets — do it deliberately.

---

## 1. Staging environment

Goal: a second, isolated copy of the stack that CI auto-deploys on merge to `main`, so releases are
validated before they touch the production droplet.

The pipeline already exists — `.github/workflows/deploy-staging.yml` (auto after CI on `main`) and
`.github/workflows/cd.yml` (`environment: ${{ inputs.environment }}`, gated on `SSH_*` secrets). You
only need to give it a target and secrets.

### Steps
1. **Provision a staging host** — a second DigitalOcean droplet (2 vCPU is enough for a smoke env; 4
   vCPU if you want it to hold realistic data). Install Docker + compose, clone the repo to
   `/opt/nexus`, same as prod.
2. **Create a GitHub Environment named `staging`** (Repo → Settings → Environments → New). Add its
   secrets/vars — these are consumed by `cd.yml`/`deploy-staging.yml`:
   - `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`, `STAGING_SSH_PORT` (used by
     `deploy-staging.yml`), **or** the generic `SSH_HOST`/`SSH_USER`/`SSH_KEY` scoped to the
     `staging` environment (used by `cd.yml`).
   - `DEPLOY_PATH` = `/opt/nexus`, `APP_URL` = the staging URL.
3. **Separate config** — give staging its own `.env` on the host (distinct `JWT_SECRET`,
   `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, domain). Never share prod secrets with staging.
4. **(Optional) compose profile** — if you want staging to run a reduced service set, add a
   `docker-compose.staging.yml` overlay and select it with `COMPOSE_FILE=docker-compose.yml:docker-compose.staging.yml`
   in the staging `.env`. The default is to run the same compose as prod.
5. **Branch→env mapping** — `main` → staging (auto), a `production` branch or manual
   `workflow_dispatch` → prod. See `docs/CICD.md` for the full secrets table.

Result: every merge to `main` deploys to staging automatically; promotion to prod is a deliberate
manual/`production`-branch action.

---

## 2. Managed Postgres + PITR

Goal: move off the single-droplet Postgres (which is also the app host — a single point of failure
with no point-in-time recovery) to a managed instance with automated backups + PITR.

### Steps
1. **Provision** a DigitalOcean Managed PostgreSQL 16 cluster (or RDS/Cloud SQL). Enable automated
   backups + PITR. Note the connection string + CA cert.
2. **Create the per-service databases** — the stack uses one logical DB per service
   (`nexus_crm`, `nexus_finance`, `nexus_workflow`, …). Create them on the managed cluster (a small
   `for db in ...; do createdb; done` against the admin connection).
3. **Migrate data** — for a pilot with only test data, simplest is a fresh start: point services at
   the managed cluster and let the migration baseline create schemas (see §3). To carry existing
   data: `pg_dump` each `nexus_*` DB from the droplet → `pg_restore` into the managed cluster during
   a short maintenance window.
4. **Repoint the app** — set each service's `DATABASE_URL` / `<SVC>_DATABASE_URL` (and pgbouncer's
   upstream) to the managed cluster. Keep pgbouncer in front for pooling; point its `[databases]`
   section at the managed host. Update `.env` on the host.
5. **Verify** — `docker compose up`, hit `/health` on each service, run a smoke login + a few reads.
6. **Retire** the droplet Postgres container once verified.

> Right-sizing note: also split the app nodes from the DB — the 2-vCPU droplet currently runs 40+
> containers *and* Postgres, which is why it's load-fragile (~2 concurrent testers). Managed DB +
> app-only droplet(s) fixes both the SPOF and the contention.

---

## 3. Migration cutover (finish the last Phase-1 step)

The migration foundation is committed: a baseline (`00000000000000_init`) for all 33 services +
`scripts/db/baseline-cutover.sh`. **17/18 core services are already baselined live; crm is now
reconciled too.** To make `migrate deploy` the source of truth in prod (and stop using `db push`):

1. Run the cutover once per environment: `bash scripts/db/baseline-cutover.sh` on the host. It copies
   each service's migrations next to its generated client schema and `migrate resolve --applied`s
   every migration (non-destructive — records them as applied, runs no SQL). It now cleans the
   target dir first, so the nested-`migrations/` bug can't recur.
2. Confirm `migrate status` = "Database schema is up to date" for each service.
3. **Switch the deploy path** from `db push` to `prisma migrate deploy` (already wired in `cd.yml`).
   From then on, schema changes are authored as migrations (`prisma migrate dev --create-only`
   against a scratch DB → review → commit), and deploy applies them. See `docs/MIGRATIONS.md`.

Do this in a maintenance window; it's low-risk (resolve runs no SQL) but should be verified, not
rushed.
