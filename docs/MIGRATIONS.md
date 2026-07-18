# Database Migrations (Prisma Migrate)

Nexus is a ~30-service monorepo. Each service under `services/*` owns its own
Prisma schema (`prisma/schema.prisma`) and its own Postgres database, and
generates a **custom** Prisma client to `node_modules/.prisma/<svc>-client`.

Historically, production schema was applied with **`prisma db push`** — no
migration history, no reproducible DDL, no review of what changed. We are
adopting **Prisma Migrate** with a **baseline** so every schema change from now
on is a reviewed, versioned SQL file that deploys deterministically.

> **Golden rule: never run `prisma db push` against a production database again.**
> `db push` is fine only for throwaway/scratch local databases.

---

## 1. How the baselines were generated

Every service now has a baseline migration:

```
services/<svc>/prisma/migrations/
  ├── migration_lock.toml           # provider = "postgresql"
  └── 00000000000000_init/
        └── migration.sql           # full CURRENT schema as CREATE TABLE ... DDL
```

Each `migration.sql` was generated **offline** (no database connection) with
Prisma 5.22 — the version this repo pins — from the service's schema:

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel services/<svc>/prisma/schema.prisma \
  --script > services/<svc>/prisma/migrations/00000000000000_init/migration.sql
```

`--from-empty --to-<current schema>` yields the DDL that builds the schema from
nothing — i.e. a faithful snapshot of what is **already live in production**.
The baseline is therefore something we *mark as applied*, not something we run.

> Note: `prisma migrate diff` accepts `--to-schema-datamodel` on Prisma 5/6.
> On Prisma 7 the equivalent flag is `--to-schema`. Match the CLI to the repo's
> pinned Prisma version.

---

## 2. First deploy: resolve-then-deploy

Because prod already has these tables (created by the old `db push`), running
`migrate deploy` on the baseline would try to `CREATE TABLE` things that exist
and fail. So the very first time, per service/database, you **resolve** the
baseline as already-applied (writes a bookkeeping row, runs **no SQL**):

```bash
# once per service, against the existing prod DB:
scripts/db/migrate-deploy.sh <svc> <container> <client> --baseline
# e.g.
scripts/db/migrate-deploy.sh crm-service nexus-crm crm-client --baseline
```

Internally that runs, inside the container:

```bash
npx prisma migrate resolve --applied 00000000000000_init \
    --schema=node_modules/.prisma/<client>/schema.prisma
```

From then on, deploying new migrations is the normal path:

```bash
scripts/db/migrate-deploy.sh <svc> <container> <client>
# runs, in the container:
#   npx prisma migrate deploy --schema=node_modules/.prisma/<client>/schema.prisma
```

`migrate deploy` applies only migrations not yet recorded in
`_prisma_migrations`, in order, and never prompts — safe for CI/CD and prod.

> **Fresh/empty database (no prod data yet)?** Skip the `--baseline` step and
> run plain `migrate deploy` directly — it will apply `00000000000000_init` and
> create the schema from scratch.

---

## 3. Authoring a NEW migration going forward

Never hand-write DDL and never `db push` in prod. Instead:

1. Edit the service's `prisma/schema.prisma`.
2. Generate a migration **locally against a scratch database** (dev-only), using
   `--create-only` so Prisma writes the SQL but does **not** apply it — giving
   you a chance to review/edit it:

   ```bash
   cd services/<svc>
   # SCRATCH_DATABASE_URL points at a disposable local Postgres, NOT prod
   npx prisma migrate dev --create-only --name <short_change_name>
   ```

   This creates `prisma/migrations/<timestamp>_<short_change_name>/migration.sql`.

3. **Review** the generated `migration.sql` (watch for destructive ops — dropped
   columns, narrowed types, non-nullable adds without defaults). Adjust if
   needed, then apply locally to test:

   ```bash
   npx prisma migrate dev   # applies pending migrations to the scratch DB
   ```

4. **Commit** the new `migration.sql` (and any `migration_lock.toml` change)
   alongside the schema change in the same PR.

5. **Deploy** runs `migrate deploy` (via `scripts/db/migrate-deploy.sh`), which
   applies the committed migration to staging/prod. No `db push`, ever.

---

## 4. Quick reference

| Situation | Command |
|---|---|
| Regenerate a baseline (offline, no DB) | `prisma migrate diff --from-empty --to-schema-datamodel <schema> --script` |
| First prod deploy (schema already exists) | `scripts/db/migrate-deploy.sh <svc> <container> <client> --baseline` |
| Normal deploy (staging/prod/CI) | `scripts/db/migrate-deploy.sh <svc> <container> <client>` |
| Author a new migration (local scratch DB) | `prisma migrate dev --create-only --name <name>` |
| Apply pending migrations locally | `prisma migrate dev` |
| Inspect applied migrations | `prisma migrate status` |

**Do not** use `prisma db push` or `prisma migrate reset` against any shared or
production database.
