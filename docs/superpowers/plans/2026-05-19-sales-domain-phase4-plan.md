# Sales Domain Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Move leads and deals sales-domain lifecycle operations out of route handlers and into a shared Sales use-case boundary.

**Architecture:** Leads and deals keep the same `/api/v1` routes and response envelopes. Route handlers continue to validate HTTP payloads and permissions, while sales use-cases own create/update/archive/restore, mass operations, lead conversion, duplicate checks, and deal transition commands.

**Tech Stack:** TypeScript, Fastify, Prisma, `@nexus/domain-core`, existing CRM lead/deal services, Vitest.

---

### Task 1: Create Sales Domain Use-Case

**Files:**
- Create: `services/crm-service/src/use-cases/sales-records.use-case.ts`
- Create: `services/crm-service/src/use-cases/__tests__/sales-records.use-case.test.ts`

- [x] Implement lead/deal create, update, archive, restore through module services.
- [x] Implement lead/deal mass update through module services with allowed fields.
- [x] Implement lead/deal mass archive through module services with best-effort recycle tracking.
- [x] Implement lead conversion boundary.
- [x] Implement deal stage, won, and lost transition boundaries.
- [x] Implement lead duplicate check boundary.

### Task 2: Wire Existing Routes

**Files:**
- Modify: `services/crm-service/src/routes/leads.routes.ts`
- Modify: `services/crm-service/src/routes/deals.routes.ts`

- [x] Replace direct lead/deal mass `updateMany` logic.
- [x] Replace direct lead/deal mass delete logic.
- [x] Route create/update/archive/restore through Sales use-case.
- [x] Route lead conversion through Sales use-case.
- [x] Route deal stage/won/lost transitions through Sales use-case.
- [x] Preserve existing route URLs and response envelopes.

### Task 3: Verification

**Commands:**
- [x] `pnpm --filter @nexus/crm-service test -- src/use-cases/__tests__/sales-records.use-case.test.ts`
- [x] `pnpm --filter @nexus/crm-service typecheck`
- [x] `pnpm --filter @nexus/web typecheck`
- [x] `git diff --check`

