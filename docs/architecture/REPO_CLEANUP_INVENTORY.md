# Repo Cleanup Inventory

Date: 2026-05-19

## Current State

The repository is in an active cleanup and hardening phase. The working tree already removes obsolete Cursor prompts, gap-analysis documents, AI-service files, SaaS billing-service files, and validation billing schema files. Those deletions align with the project direction: non-AI CRM, no SaaS billing.

The repo also contains a large set of untracked files from recent implementation work. Treat those as active work, not garbage, until they are reviewed module by module.

## Confirmed Cleanup

- CI no longer references `services/ai-service` or `services/billing-service`.
- `docker-compose.yml` and `docker-compose.prod.yml` no longer reference `ai-service` or `billing-service`.
- `.gitignore` excludes Cursor prompts, gap-analysis artifacts, temporary Word lock files, local env files, Codex logs, and backup files.
- Normal Windows web build is supported by disabling Next standalone output locally while preserving standalone output for Linux/Docker.

## Files And Folders That Should Stay Deleted

- `.cursorrules`
- `CURSOR_*.md`
- `cursor-*.skill`
- `NEXUS_*Gap_Analysis*.docx`
- `NEXUS_BUILD_AUDIT.md`
- `NEXUS_BEYOND_SALESFORCE.md`
- `services/ai-service`
- `services/billing-service`
- `packages/validation/src/billing.schema.ts`
- one-off audit prompt scripts

## Active But Needs Review

These are not safe to delete blindly:

- `services/accounts-service`
- `services/contacts-service`
- `services/deals-service`
- `services/leads-service`
- `services/quotes-service`
- `services/finance-service`
- `services/cadence-service`
- `services/workflow-service`
- `services/approval-service`
- `services/metadata-service`
- `services/data-service`
- `services/reporting-service`
- `services/realtime-service`
- `apps/web/src/app/api/**`
- `apps/web/src/app/(dashboard)/**`
- `packages/service-utils`
- `packages/kafka`
- `packages/outbox`
- `packages/cqrs`
- `packages/validation`

## Cleanup Rules

1. Delete only files that are obsolete, generated, duplicated, or explicitly superseded.
2. Do not delete untracked service folders until their package, routes, Dockerfile, migrations, and frontend proxy usage are checked.
3. Keep frontend route URLs stable while backend ownership is reorganized.
4. Prefer compatibility shims during migration, then delete old paths after tests prove the new domain path is canonical.
5. Every deleted runtime path must have either no callers or a documented replacement.

## Phase 1 Exit Criteria

- Repo ignores local/generated clutter.
- Obsolete AI/billing/prompt/gap artifacts are removed or ignored.
- A canonical architecture map exists.
- Service ownership is clear enough to start Phase 2.
- Web build and targeted service typechecks pass after cleanup.

