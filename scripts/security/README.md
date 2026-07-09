# Security regression tests

Repeatable proofs for multi-tenant isolation (MT-02) and server-side RBAC (SEC-06).

## What they prove

- **Tenant isolation** — a record created by tenant B is **not** readable by a tenant-A admin
  (cross-tenant `GET` returns `404`), while the owning tenant reads it `200`.
- **RBAC enforced server-side** — a read-only user (`deals:read` only) is blocked with `403` from
  creating deals, hitting admin quote-config, and listing roles, but `GET /deals` works.

Scoping is derived from the JWT `tenantId`/`permissions` in every service, so these hold regardless
of client-supplied headers.

## Run (against a live stack)

```bash
# 1. Seed the two extra principals (idempotent) — run inside the auth container:
docker cp scripts/security/seed-test-principals.mjs nexus-auth:/tmp/seed.mjs
docker exec -e AUTH_DATABASE_URL="$(docker exec nexus-auth printenv DATABASE_URL | sed s/pgbouncer:6432/postgres:5432/)" \
  nexus-auth node /tmp/seed.mjs

# 2. Run the probe — run inside the crm container (same docker network):
docker cp scripts/security/isolation-rbac-test.mjs nexus-crm:/tmp/probe.mjs
docker exec nexus-crm node /tmp/probe.mjs
```

Expected tail: `ALL ISOLATION + RBAC CHECKS PASSED` then `PROBE-DONE`.

Seeded principals (demo passwords — rotate/remove before real production):
`admin@rival.com` / `Rival1234!` (tenant B), `viewer@demo.com` / `Viewer1234!` (read-only, demo tenant).
