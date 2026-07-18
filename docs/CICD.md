# CI/CD

This repo is a pnpm + Turborepo monorepo (Node 20, pnpm 9). All CI/CD lives in
`.github/workflows/`. Gate commands are the repo's real scripts — the workflows
call `pnpm <script>`, which fans out through Turbo across every workspace
(`apps/*`, `services/*`, `packages/*`).

## Workflows at a glance

| Workflow | File | Trigger | Purpose |
| --- | --- | --- | --- |
| **CI** | `ci.yml` | push to `main`/`develop`/`fix/local-boot`, PR to `main`/`develop` | Quality gates + build, plus image build & security/load scans on `main`. |
| **CD — Build & Deploy** | `cd.yml` | `workflow_dispatch`, push to `production` | Build+push all images, then SSH deploy to the droplet. Registry-agnostic. |
| **Deploy to Production** | `deploy.yml` | `workflow_dispatch` | Manual SSH deploy that **pulls** pre-built GHCR images (no build step). |
| **Deploy to Staging** | `deploy-staging.yml` | `workflow_run` after CI on `main` | Auto SSH deploy to staging once CI passes. |
| **Deploy via ArgoCD** | `deploy-argocd.yml` | `workflow_dispatch` | GitOps path: bump image tags + `argocd app sync`. |

`ci.yml` and `cd.yml` are the CI/CD foundation. `deploy*.yml` are the
pre-existing deploy paths and are left intact — pick the one that matches your
target topology (plain droplet vs. Kubernetes/ArgoCD).

## CI (`ci.yml`)

Runs on pull requests and pushes. All jobs use `actions/setup-node@v4` with the
`pnpm` cache and `pnpm install --frozen-lockfile`.

Real gate commands (do not rename — these are the repo's actual scripts):

| Job | Command | What it resolves to |
| --- | --- | --- |
| `quality` | `pnpm lint` + `pnpm typecheck` | `turbo lint` / `turbo typecheck` across the workspace |
| `test` | `pnpm test` | `vitest run --workspace vitest.workspace.ts` |
| `build` | `pnpm build` | `turbo build` (packages → services → web) |

Extra `main`-only jobs already present: `docker` (build+push images to GHCR),
`security-scan` (Trivy → GitHub Security tab), `load-test` (k6),
`smoke-test-staging` (registry manifest check). Any failing job fails the run.

**Database service:** `test` starts Postgres/Redis/Kafka service containers and
runs `pnpm db:migrate` first. The current unit tests mock Prisma or test pure
logic (e.g. `auth-service` tests note they run "without requiring a live
database"), so the DB is not strictly required today — but it is kept so the
suite keeps working when integration tests that need `DATABASE_URL` are added.

## CD (`cd.yml`)

A single self-contained pipeline: **preflight → build-push → deploy**.

- **preflight** — checks that `SSH_HOST`, `SSH_USER`, `SSH_KEY` are all set.
  If any is missing it emits a warning, sets `configured=false`, and the
  downstream jobs are skipped. The workflow still finishes green — a safe no-op
  on forks or unconfigured repos.
- **build-push** — matrix build of every service + web image, pushed as
  `${REGISTRY}/${GHCR_OWNER}/nexus-<name>:<tag>` (tag = input `image_tag` or the
  commit SHA, plus `latest`). Tags line up with `docker-compose.prod.yml`.
- **deploy** — SSH to the droplet, optional registry login, `docker compose -f
  docker-compose.prod.yml pull`, `prisma migrate deploy` (via
  `scripts/migrate-all.sh`, skippable), `up -d --wait`, prune, then a
  health-check smoke test with rollback via `scripts/rollback.sh`.

Trigger it manually (Actions → *CD — Build & Deploy* → Run workflow) or by
pushing to the dedicated `production` branch. It deliberately does **not** run on
`main`, so it never collides with `ci.yml`'s image build or the staging
auto-deploy.

## Required GitHub secrets / vars

Set these in **Settings → Secrets and variables → Actions**. Only the first
three are required; the rest have defaults. `GHCR_OWNER` is a repo **variable**;
everything else is a **secret**.

| Name | Kind | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `SSH_HOST` | secret | ✅ | — | Droplet hostname/IP to deploy to. |
| `SSH_USER` | secret | ✅ | — | SSH username on the droplet. |
| `SSH_KEY` | secret | ✅ | — | Private SSH key (PEM) for `SSH_USER`. |
| `SSH_PORT` | secret | — | `22` | SSH port. |
| `REGISTRY` | secret | — | `ghcr.io` | Container registry host. |
| `REGISTRY_USER` | secret | — | `github.actor` | Registry username. |
| `REGISTRY_TOKEN` | secret | — | `GITHUB_TOKEN` | Registry push token (GHCR works with the built-in `GITHUB_TOKEN`). |
| `GHCR_OWNER` | var | — | `repository_owner` | Image namespace; must match `docker-compose.prod.yml`. |
| `DEPLOY_PATH` | secret | — | `/opt/nexus` | Compose project path on the droplet. |
| `APP_URL` | secret | — | (blank) | Public URL used for the deployment status link. |

The pre-existing `deploy.yml` / `deploy-staging.yml` use their own secret names
(kept as-is so nothing breaks): `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`,
`DEPLOY_PORT`, `APP_URL`, `SLACK_WEBHOOK_URL` (prod/manual) and `STAGING_HOST`,
`STAGING_USER`, `STAGING_SSH_KEY`, `STAGING_SSH_PORT` (staging).
`deploy-argocd.yml` additionally needs `ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`.
`ci.yml`'s optional scans use `CI_JWT_SECRET`, `PROMETHEUS_REMOTE_WRITE_URL`,
`PROMETHEUS_USERNAME`, `PROMETHEUS_PASSWORD`.

## How the deploy stays safe without secrets

`cd.yml`'s `preflight` job gates `build-push` and `deploy` behind
`configured == 'true'`. With no `SSH_*` secrets the two heavy jobs are skipped
and the run is a green no-op — CD never builds images it can't ship and never
fails a repo that hasn't been wired up. The existing `deploy.yml`/
`deploy-staging.yml` also reference secrets only (never hardcoded); with none
set the SSH step simply can't connect. Image tags are validated against
`[!A-Za-z0-9._-]` before use to prevent injection.

## Branch → environment mapping

| Branch / action | Environment | Path |
| --- | --- | --- |
| PR to `main`/`develop` | none (gates only) | `ci.yml` |
| push `fix/local-boot` (working branch) | none (gates only) | `ci.yml` |
| push `main` | staging (auto) | `ci.yml` builds → `deploy-staging.yml` deploys |
| `production` branch push or manual dispatch | production | `cd.yml` (build+deploy) or `deploy.yml` (deploy only) |

## Adding a staging environment

Staging already exists via `deploy-staging.yml`. To run **staging through
`cd.yml`** as well:

1. **Second set of secrets.** In GitHub, create an environment named `staging`
   (Settings → Environments) and give it staging-scoped `SSH_HOST`, `SSH_USER`,
   `SSH_KEY`, `DEPLOY_PATH`, `APP_URL`. `cd.yml` already binds
   `environment: ${{ inputs.environment }}`, so running the workflow with
   `environment: staging` picks up that environment's secrets automatically.
2. **A `staging` compose profile.** Add a `staging` profile to the compose
   stack — e.g. a `docker-compose.staging.yml` overlay (smaller replica counts,
   staging hostnames, `IMAGE_TAG` still from CI). Point the deploy step at it by
   making the compose file a variable, e.g. set
   `COMPOSE_FILE=docker-compose.staging.yml` for the staging environment and use
   `docker compose -f "$COMPOSE_FILE" ...` in the SSH script. Alternatively use
   Docker Compose profiles (`--profile staging`) inside `docker-compose.prod.yml`.
3. **Branch mapping (optional).** Add a long-lived `staging` branch to `cd.yml`'s
   `push:` list and select the environment from the branch (e.g. `staging`
   branch → `staging` env, `production` branch → `production` env) so pushes
   promote automatically.
