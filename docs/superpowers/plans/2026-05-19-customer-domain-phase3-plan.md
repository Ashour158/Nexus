# Customer Domain Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Move customer-domain mass operations for contacts and accounts out of route handlers and into a shared customer use-case boundary.

**Architecture:** Contacts and accounts remain exposed through the same `/api/v1` routes. Route handlers validate transport payloads and permissions, while the customer-domain use-case owns allowed-field governance, service-layer routing, archival behavior, and recycle-bin handoff.

**Tech Stack:** TypeScript, Fastify, Prisma, `@nexus/domain-core`, existing CRM services, Vitest.

---

### Task 1: Create Customer Domain Use-Case

**Files:**
- Create: `services/crm-service/src/use-cases/customer-records.use-case.ts`
- Create: `services/crm-service/src/use-cases/__tests__/customer-records.use-case.test.ts`

- [x] Implement single-record create, update, archive, and restore through module services.
- [x] Implement customer mass update through module services.
- [x] Implement customer mass archive through module services.
- [x] Validate allowed update fields per customer entity.
- [x] Preserve recycle-bin handoff through an injected callback.
- [x] Implement contact/lead duplicate checks behind the customer use-case.
- [x] Implement account duplicate checks behind the customer use-case.

### Task 2: Wire Existing Routes

**Files:**
- Modify: `services/crm-service/src/routes/contacts.routes.ts`
- Modify: `services/crm-service/src/routes/accounts.routes.ts`

- [x] Replace direct `updateMany` in contact mass update.
- [x] Replace direct `updateMany` in account mass update.
- [x] Replace direct mass delete route archival with use-case archival.
- [x] Replace contact/account create, update, archive, and restore route orchestration with customer use-case calls.
- [x] Replace contacts and accounts duplicate route logic with customer use-case calls.
- [x] Preserve existing route URLs and response envelopes.

### Task 3: Verification

**Commands:**
- [x] `pnpm --filter @nexus/crm-service test -- src/use-cases/__tests__/customer-records.use-case.test.ts`
- [x] `pnpm --filter @nexus/crm-service typecheck`
- [x] `pnpm --filter @nexus/web typecheck`
- [x] `git diff --check`
