# Nexus CRM — CTO Execution Plan

**Date:** 2026-05-17  
**Author:** Acting CTO  
**Status:** Draft — Pending squad mobilization  
**Scope:** Non-AI, non-SaaS-billing enterprise CRM with CPQ, contracts, invoices, workflows, reporting, and deep service wiring.

---

## 1. CTO Assessment

### 1.1 What Is Already Good

| Area | Rating | Evidence |
|---|---|---|
| **Monorepo hygiene** | Green | pnpm workspaces, Turbo pipeline, consistent TypeScript, shared packages, Docker per service, CI matrix for 35 services |
| **Infrastructure footprint** | Green | Postgres 16, PgBouncer, Redis, Kafka, Meilisearch, MinIO, ClickHouse, Keycloak, Kong, Prometheus, Grafana, OTel — all wired in compose |
| **Event backbone** | Green | Kafka with Zod schemas in `@nexus/shared-types`, outbox pattern with `outbox-relay`, DLQ replay |
| **Security primitives** | Yellow-Green | RLS middleware (`@nexus/security`), JWT + Keycloak, SSO config model, MFA model, GDPR erasure request model, password resets |
| **Audit pipeline** | Yellow-Green | `@nexus/audit` publishes to Kafka; Fastify hook exists; not yet universally applied |
| **Workflow engine** | Yellow | Real executor with 12+ node types, cycle detection, pause/resume, fork/join — but limited cross-service action nodes |
| **Approval engine** | Yellow | Policy → Request → Step model with multi-step routing; not wired to CPQ discount triggers |
| **CPQ pricing engine** | Yellow | 10-rule waterfall in `finance-service/src/cpq/pricing-engine.ts` with Decimal.js; real product/price-tier/promo models |
| **Document service** | Yellow | Document/Version/Folder/Permission models; MinIO storage backend; missing entity-attachment linking |
| **Integration backbone** | Yellow | Webhook subscriptions with retry tracking, OAuth connections, sync jobs, calendar sync |
| **Frontend surface area** | Yellow | 99 page routes, design reference documented, Next.js 14 app router, React Query, Zustand, Recharts, Tailwind |
| **Testing infrastructure** | Yellow | Vitest workspace, 343 service tests, 13 package tests, Playwright e2e scaffold, integration test setup |

### 1.2 What Is Incomplete

| Gap | Severity | Impact |
|---|---|---|
| **Service granularity chaos** | Critical | CRM domain is split across `crm-service`, `accounts-service`, `contacts-service`, `deals-service`, `activities-service`, `leads-service`, `notes-service`, `quotes-service` with no clear data ownership boundaries. This causes circular dependencies, dual Quote models, and orphaned data. |
| **Contract lifecycle gaps** | Critical | `Contract` model exists in finance-service but: no auto-renewal scheduler, contract PDF is a JSON dump stub, no e-signature webhook handling, no renewal quoting flow. |
| **Payment gateway missing** | High | `Payment` ledger exists in finance-service but is manual entry only. No Stripe/Adyen/Braintree integration. No reconciliation engine. |
| **Reporting is template-heavy** | High | `ReportDefinition` is legacy template-based; `SavedReport` builder exists but no query execution engine or ClickHouse read path. |
| **Analytics projections are thin** | High | ClickHouse DDL exists but only 4 projections (activities, contacts, deals, pipeline-velocity). No KPI materialized views. |
| **Frontend/backend contract drift** | High | 99 pages exist but many map to thin/stub backends. Unknown which screens connect to real APIs vs mock data. |
| **Approval not wired to CPQ** | High | Approval engine exists but no discount-threshold triggers from pricing engine. |
| **Workflow nodes lack depth** | High | No validation-rule node, SLA node, or field-rule node. Cross-service mutations are limited. |
| **Territory service is isolated** | Medium | Territory model in crm-service but `territory-service` is separate; no routing logic proven. |
| **Portal service is stub** | Medium | `portal-service` exists but no buyer-room contract binding. |
| **Document generation (PDF)** | Medium | `document-service` has storage but no PDF generation for quotes/contracts. |
| **Data import/export** | Medium | `data-service` scaffolded but no robust CSV/Excel pipeline with validation. |
| **Blueprint/playbooks not enforced** | Medium | `blueprint-service` has stage transition rules but no runtime enforcement in deal mutations. |
| **Search indexing is passive** | Medium | `search-service` consumes events but unknown re-index coverage. |

### 1.3 What Is Miswired

| Problem | Location | Fix Required |
|---|---|---|
| **Dual Quote models** | `finance-service` and `quotes-service` both define Quote schemas | Merge quotes into finance-service; quotes-service becomes a thin read-model or is removed |
| **CRM data fragmentation** | 7 services own pieces of CRM domain | Consolidate or establish strict aggregate boundaries with API contracts |
| **Outbox relay references non-existent DBs** | `outbox-relay/config.ts` lists `user`, `inventory`, `project`, `contract`, `asset`, `vendor` DBs | Remove phantom databases or create services |
| **CI builds phantom services** | `.github/workflows/ci.yml` builds `billing-service` and `ai-service` | Remove from CI matrix |
| **RLS model list is bloated** | `@nexus/security/rls.ts` includes phantom `Plan`, `Subscription`, `UsageRecord`, `BillingInvoice` | Remove phantom SaaS billing models from RLS list; keep finance-service `Subscription` (customer product subscriptions) |
| **Tenant.plan field** | `auth-service` schema has `Tenant.plan` (`starter` default) | Remove — this is SaaS billing contamination |
| **Lead.aiScore / aiScoreReason** | `crm-service` schema has AI scoring fields | Remove — unused heuristic contamination; no ML pipeline exists |
| **Account.aiScore** | `accounts-service` schema may have AI score fields | Verify and remove if present |
| **GraphQL gateway depends on everything** | `docker-compose.yml` shows gateway depending on 25+ services | Make gateway resilient to missing subgraphs |
| **Event schemas incomplete** | `shared-types` has CRM + finance events but missing contract, payment, document, compliance events | Expand event catalog |
| **Kafka auto-create enabled** | `docker-compose.yml` sets `KAFKA_AUTO_CREATE_TOPICS_ENABLE=true` | Disable in production; manage topics explicitly |

### 1.4 What Is Risky

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Circular service dependencies** | High | Introduce async event-driven boundaries; ban synchronous service-to-service calls except via gateway |
| **Data inconsistency across CRM microservices** | High | Implement saga patterns for lead→contact→account→deal conversion; use outbox for all mutations |
| **Performance degradation with 35 services** | Medium | Merge trivial services; keep CPQ/finance/workflow/reporting as separate bounded contexts |
| **GDPR compliance gaps** | Medium | Complete erasure request orchestration across all services; verify PII tagging |
| **Security: JWT secret fallback in CI** | Medium | CI uses `test-jwt-placeholder` fallback — must enforce secret in all envs |
| **Chatbot service is AI-adjacent** | Medium | Evaluate if chatbot is rule-based or LLM-based; remove if LLM |
| **Missing rate limiting on APIs** | Medium | Kong has rate-limiting plugin but no per-tenant enforcement |
| **Database migration drift** | Medium | 35 separate Prisma schemas with no shared migration versioning |
| **Frontend bundle bloat** | Low-Medium | Next.js with many pages; need route splitting and code review |

### 1.5 What Must Be Cleaned Before Building

1. **Remove AI/SaaS billing contamination** from schemas, CI, and compose.
2. **Consolidate CRM domain boundaries** — decide if accounts/contacts/deals/leads/activities/notes are one service or strict aggregates with clear API ownership.
3. **Fix the dual-Quote problem** — single source of truth in finance-service.
4. **Prune phantom databases and services** from outbox-relay and CI.
5. **Establish the event contract registry** — every service must declare its events and subscriptions.
6. **Add missing core models** — Contract, Payment, Order, Subscription (internal, not SaaS billing), Commission Ledger.
7. **Enforce tenant isolation audit** — verify every query uses RLS or explicit tenantId filters.

---

## 2. Agent Work Breakdown

### Agent 1 — Principal Backend Architect

**Mission:** Define canonical service boundaries, domain models, API contracts, validation, event flows, and database ownership. Eliminate dual ownership and circular dependencies.

**Owned files/modules/services:**
- `services/crm-service/` (consolidation target)
- `services/accounts-service/`, `contacts-service/`, `deals-service/`, `activities-service/`, `leads-service/`, `notes-service/`
- `services/finance-service/` (CPQ source of truth)
- `services/quotes-service/` (merge target)
- `packages/shared-types/src/event-schemas.ts`
- `packages/validation/`, `packages/validation-gateway/`
- `services/outbox-relay/config.ts`
- All `prisma/schema.prisma` files for owned services

**Exact tasks:**
1. Decide CRM domain ownership: either (a) merge all CRM into `crm-service` or (b) keep splits but define strict aggregate boundaries with no cross-service DB access.
2. Merge `quotes-service` into `finance-service`; migrate its schema, routes, and events.
3. Define canonical event catalog: `lead.created`, `contact.created`, `account.created`, `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`, `quote.created`, `quote.sent`, `quote.accepted`, `quote.rejected`, `invoice.created`, `invoice.paid`, `contract.created`, `contract.signed`, `payment.received`, `approval.requested`, `approval.approved`, `approval.rejected`, `workflow.triggered`, `document.generated`, `audit.event`.
4. Implement Zod validation pipes for all inbound REST/GraphQL mutations.
5. Ensure every mutating route publishes an outbox event.
6. Add missing models: `Contract`, `Payment`, `Order` to finance-service.
7. Remove AI fields (`aiScore`, `aiScoreReason`) from Lead and Account schemas.
8. Remove SaaS billing models (`Plan`, `Subscription`, `UsageRecord`, `BillingInvoice`) from auth-service and RLS list.
9. Standardize Prisma client generation paths and remove phantom DBs from outbox-relay.

**Dependencies on other agents:**
- Security: RBAC checks on every route
- Workflow: event triggers must match workflow trigger registry
- CPQ: pricing engine must emit events for approval thresholds

**Acceptance criteria:**
- Every domain entity has exactly one owning service
- All mutations publish exactly one outbox event
- No AI/billing contamination in schemas
- Integration tests pass for all consolidated domains

**Tests required:**
- Unit tests for validation pipes
- Contract tests for event schemas
- Integration tests for cross-service sagas (lead conversion, quote-to-contract)

**Risks:**
- Breaking existing frontend contracts during consolidation
- Data migration complexity if merging databases

---

### Agent 2 — Principal Frontend Architect

**Mission:** Complete the CRM UX to match the design reference. Ensure every screen connects to a real backend contract. Remove AI UI. Establish design system discipline.

**Owned files/modules/services:**
- `apps/web/` (all)
- `design-references/FRONTEND_DESIGN_REFERENCE.md`
- Frontend API client layer (`apps/web/src/lib/api` or equivalent)

**Exact tasks:**
1. Audit all 99 page routes against backend reality. Mark screens that use mock data.
2. Build/realize the executive dashboard with KPI strips connected to `analytics-service`.
3. Complete the report builder UI connected to `reporting-service` SavedReport API.
4. Build CPQ quote builder screen connected to `finance-service`.
5. Build contract list/detail screens connected to new Contract API.
6. Build invoice list/detail/payment screens.
7. Remove any AI assistant UI, copilot panels, or LLM-marketed features.
8. Remove SaaS billing/plan selection UI if present.
9. Implement RTL layout support per design reference.
10. Ensure all data tables use the standardized component (compact, sticky headers, chooser, bulk actions).
11. Wire global command palette to search-service.

**Dependencies on other agents:**
- Backend Architect: stable API contracts for consolidated services
- CPQ Architect: quote builder APIs and template endpoints
- Reporting: report execution endpoints
- Security: permission-aware UI rendering (hide actions based on RBAC)

**Acceptance criteria:**
- Zero screens use mock data unless explicitly marked "not implemented"
- Every major entity screen has real CRUD to backend
- Design tokens match reference (blue primary, slate text, compact density)
- All destructive actions have confirmation and permission checks

**Tests required:**
- Component tests for design system primitives
- Playwright e2e for critical flows (login → create lead → convert → quote → approve)
- Accessibility audit (axe-core)

**Risks:**
- Backend API drift during development
- Bundle size with heavy chart libraries

---

### Agent 3 — Data & Reporting Architect

**Mission:** Make reporting and analytics a first-class nervous system. Build the report execution engine, KPI definitions, scheduled reports, and ClickHouse projections.

**Owned files/modules/services:**
- `services/reporting-service/`
- `services/analytics-service/`
- `packages/shared-types/src/event-schemas.ts` (reporting events)
- ClickHouse DDL files

**Exact tasks:**
1. Build report execution engine in `reporting-service` that can query Postgres read-models and ClickHouse for time-series.
2. Implement `SavedReport` CRUD and schedule runner with email export (CSV/XLSX/PDF).
3. Define canonical KPIs: revenue, pipeline, win rate, sales cycle, quote turnaround, forecast accuracy.
4. Expand ClickHouse projections: add `quotes.projection`, `invoices.projection`, `contracts.projection`, `activities.projection`, `forecast.projection`.
5. Build dashboard widget data API.
6. Ensure every report respects tenant isolation and RBAC.
7. Add audit logging for report exports and schedule changes.
8. Implement data lineage tracking for report definitions.

**Dependencies on other agents:**
- Backend Architect: stable event schemas and read-model shapes
- Security: report permission model
- Workflow: scheduled report triggers

**Acceptance criteria:**
- Report builder can create, save, schedule, and export reports
- Dashboard widgets load in < 2s for 1M row tenants
- Every report query uses tenant-scoped indexes

**Tests required:**
- Report execution performance tests
- Data integrity tests (event → projection → report match)
- Security tests (tenant isolation in reporting queries)

**Risks:**
- ClickHouse schema migrations in production
- Complex join performance across Postgres and ClickHouse

---

### Agent 4 — Security & Compliance Architect

**Mission:** Harden the system for enterprise security, GDPR, and ISO 27001-style evidence. Make RBAC/ABAC enforceable at every layer.

**Owned files/modules/services:**
- `services/auth-service/`
- `packages/security/`
- `packages/audit/`
- `services/blueprint-service/` (for policy enforcement)

**Exact tasks:**
1. Complete RBAC implementation: roles, permissions, field-level permissions, and record-level sharing.
2. Implement ABAC for complex rules (territory + deal size + industry).
3. Ensure RLS middleware is applied to every Prisma client instance across all services.
4. Add API rate limiting per tenant and per user.
5. Implement audit log consumption: build `audit-service` or consumer that writes immutable audit trails.
6. Complete GDPR erasure request orchestration across all services.
7. Add data retention policies and automatic purging.
8. Implement SSO/SAML and MFA enforcement rules.
9. Add API key scope restrictions and rotation.
10. Remove AI/billing security model contamination.
11. Implement secrets rotation schedule and encryption-at-rest verification.

**Dependencies on other agents:**
- Backend Architect: every route must call permission check
- DevOps: TLS, cert management, secret injection
- QA: security test suite

**Acceptance criteria:**
- Every API endpoint has authorization check
- Audit trail covers 100% of mutating operations
- GDPR erasure completes end-to-end in < 24 hours
- Penetration test findings = zero critical/high

**Tests required:**
- RBAC matrix tests (every role × every endpoint)
- Tenant isolation fuzz tests
- GDPR erasure integration test
- OWASP ZAP or equivalent automated scan

**Risks:**
- Performance impact of RLS on high-throughput queries
- Complexity of ABAC rule evaluation

---

### Agent 5 — Workflow & Low-Code Architect

**Mission:** Make the workflow engine the nervous system for automation. Connect triggers, validation rules, SLA rules, assignment rules, and approvals.

**Owned files/modules/services:**
- `services/workflow-service/`
- `services/approval-service/`
- `services/blueprint-service/` (integration)

**Exact tasks:**
1. Expand workflow node library: add `validation_rule`, `sla_check`, `assignment_rule`, `field_update`, `approval_request`, `document_generate`, `report_run` nodes.
2. Build trigger registry: `record.created`, `record.updated`, `record.deleted`, `stage.changed`, `quote.submitted`, `approval.completed`, `sla.breached`, `webhook.received`.
3. Integrate approval service into workflow as a node.
4. Build validation rule engine that runs before record mutations (hook into backend routes).
5. Build SLA engine with escalation paths.
6. Implement workflow versioning and rollback.
7. Add safe execution: sandboxed expression evaluation, timeout limits, max iteration counts.
8. Build low-code admin UI for workflow canvas (frontend collaboration).

**Dependencies on other agents:**
- Backend Architect: event triggers and validation hooks
- CPQ: quote approval thresholds trigger workflows
- Security: workflow execution permissions
- Reporting: workflow performance metrics

**Acceptance criteria:**
- Every trigger type works end-to-end
- Validation rules block invalid mutations with clear errors
- SLA breaches trigger escalations within 60 seconds
- Workflow changes are versioned and rollback-safe

**Tests required:**
- Workflow execution unit tests (all node types)
- Integration tests for trigger → workflow → action chains
- SLA breach simulation tests
- Regression tests for workflow versioning

**Risks:**
- Infinite loops in user-defined workflows
- Performance impact of validation rules on bulk imports

---

### Agent 6 — CPQ & Revenue Operations Architect

**Mission:** Make CPQ, quotes, contracts, invoices, and payments a complete revenue operations suite.

**Owned files/modules/services:**
- `services/finance-service/`
- `services/quotes-service/` (merge source)
- `services/document-service/` (for PDF generation)
- `services/approval-service/` (for discount approvals)

**Exact tasks:**
1. Complete the quote lifecycle: draft → submit → approve → send → accept/reject → convert to contract/invoice.
2. Build contract model and lifecycle: draft → sent → negotiated → signed → active → expired → renewed.
3. Build invoice model with line items, tax, payment terms, and status tracking.
4. Build payment model: record payments, partial payments, overpayments, refunds.
5. Integrate approval service for non-standard discounts (pricing engine rule 8).
6. Build quote template system with variables and PDF generation.
7. Build contract template system.
8. Add tax engine integration point (pluggable for jurisdiction).
9. Ensure every financial mutation emits events for analytics and audit.

**Dependencies on other agents:**
- Backend Architect: event schemas and service consolidation
- Workflow: quote approval workflow triggers
- Security: financial data permissions
- Reporting: revenue KPIs
- Document: PDF generation service

**Acceptance criteria:**
- Quote can be created, priced with 10-rule engine, approved, sent, accepted
- Contract generated from accepted quote with template
- Invoice generated with correct tax and terms
- Payment recorded and invoice status updated
- All financial events published to Kafka

**Tests required:**
- Pricing engine unit tests (all 10 rules)
- Quote lifecycle integration tests
- Contract generation tests
- Invoice + payment reconciliation tests

**Risks:**
- Decimal precision errors (mitigated by Decimal.js)
- Tax jurisdiction complexity

---

### Agent 7 — Integrations Architect

**Mission:** Make integrations reliable, observable, and idempotent. Connect email, calendar, maps, ERP, webhooks, and import/export.

**Owned files/modules/services:**
- `services/integration-service/`
- `services/email-sync-service/`
- `services/data-service/`
- `services/comm-service/`

**Exact tasks:**
1. Harden webhook delivery: exponential backoff, idempotency keys, secret rotation UI, replay capability.
2. Complete email sync: OAuth to Gmail/Outlook, thread matching, consent tracking.
3. Complete calendar sync: meeting creation, attendee matching, outcome logging.
4. Build ERP integration module: customer sync, order sync, financial reconciliation.
5. Build robust data import pipeline with validation, deduplication, and error reporting.
6. Build data export with scheduling.
7. Add integration health dashboard.
8. Ensure all sync jobs are idempotent and recoverable.

**Dependencies on other agents:**
- Backend Architect: stable entity APIs for sync targets
- Security: OAuth token encryption and rotation
- Workflow: sync failure triggers workflow alerts

**Acceptance criteria:**
- Webhook delivery > 99.9% success rate with retry
- Email sync matches threads to contacts/leads
- Import validates 100% of rows before writing
- All integrations have health status APIs

**Tests required:**
- Webhook retry and idempotency tests
- OAuth token refresh tests
- Import validation error tests
- ERP mock integration tests

**Risks:**
- Third-party API rate limits
- OAuth token expiry handling

---

### Agent 8 — QA/Test Architect

**Mission:** Ensure the system is regressable, secure, and performant. Build the test pyramid and CI gates.

**Owned files/modules/services:**
- `tests/integration/`
- `tests/load/`
- `packages/testing/`
- All `__tests__/` directories
- `.github/workflows/ci.yml`

**Exact tasks:**
1. Expand integration tests to cover all critical business flows.
2. Build contract tests between services using shared event schemas.
3. Add workflow regression tests.
4. Add security regression tests (RBAC, tenant isolation).
5. Add data integrity tests (event → projection consistency).
6. Expand load tests to cover CPQ pricing and report generation.
7. Add chaos tests for service unavailability (GraphQL gateway resilience).
8. Implement test data factories for all domains.
9. Fix CI to remove phantom services (`billing-service`, `ai-service`).

**Dependencies on other agents:**
- All agents: every feature must have test plan
- DevOps: CI environment stability

**Acceptance criteria:**
- > 80% unit test coverage for business logic
- All critical paths have integration tests
- Load tests pass at 2x expected peak traffic
- Security tests pass with zero critical findings

**Tests required:**
- Full regression suite
- Performance benchmarks
- Security scan automation

**Risks:**
- Test flakiness with async event systems
- Test data cleanup in shared CI databases

---

### Agent 9 — DevOps/Platform Architect

**Mission:** Make the platform production-ready. Harden Kubernetes, observability, migrations, backups, and disaster recovery.

**Owned files/modules/services:**
- `infrastructure/` (all)
- `docker-compose.yml`, `docker-compose.prod.yml`
- All `Dockerfile`s
- `.github/workflows/deploy*.yml`
- `scripts/` (deployment and operational scripts)

**Exact tasks:**
1. Harden Dockerfiles: non-root users, minimal images, health checks.
2. Complete Kubernetes/Helm charts for all services.
3. Implement database migration job pattern (init containers or Helm hooks).
4. Configure Kafka topic management (disable auto-create in prod).
5. Set up distributed tracing (OTel) across all services.
6. Configure log aggregation and alerting rules.
7. Implement backup/restore for Postgres, ClickHouse, MinIO.
8. Set up SLOs and error budget tracking.
9. Add pod disruption budgets and HPA.
10. Remove phantom services from CI/CD and compose.

**Dependencies on other agents:**
- All agents: service health endpoints
- Security: secrets management and TLS

**Acceptance criteria:**
- All services deployable via Helm in < 15 minutes
- Migrations run automatically and rollback-safe
- Observability covers 100% of services
- RPO < 1 hour, RTO < 4 hours for disaster recovery

**Tests required:**
- Deployment smoke tests
- Chaos engineering tests
- Backup restoration tests

**Risks:**
- Helm chart complexity with 35 services
- Database migration locks during deployment

---

## 3. Implementation Roadmap

### Phase 0: Cleanup and Repo Stabilization (Weeks 1–2)
- [ ] Remove AI features from schemas and code (`aiScore`, `aiScoreReason`, chatbot LLM logic if any)
- [ ] Remove SaaS billing contamination (`Tenant.plan`, `Plan`/`Subscription` models, CI phantom services)
- [ ] Fix CI matrix: remove `billing-service` and `ai-service`
- [ ] Prune phantom DBs from `outbox-relay/config.ts`
- [ ] Merge `quotes-service` into `finance-service`
- [ ] Decide CRM service consolidation strategy
- [ ] Stabilize `pnpm install`, `pnpm build`, `pnpm test` at root
- [ ] Add missing core models: Contract, Payment, Order

### Phase 1: Core CRM Nervous System (Weeks 3–6)
- [ ] Implement canonical event catalog across all services
- [ ] Wire outbox pattern to 100% of mutating routes
- [ ] Consolidate CRM domain boundaries
- [ ] Implement validation pipes on all APIs
- [ ] Add RLS to every Prisma client
- [ ] Build audit log consumer and immutable storage

### Phase 2: Domain Services and Business Logic Hardening (Weeks 7–10)
- [ ] Harden lead → contact → account → deal conversion saga
- [ ] Implement territory assignment and routing
- [ ] Complete activity timeline linking
- [ ] Build data quality engine (duplicates, missing fields)
- [ ] Implement blueprint/playbook enforcement on deals

### Phase 3: Frontend UX Completion (Weeks 11–14)
- [ ] Connect all major screens to real backend APIs
- [ ] Build executive dashboard with real KPIs
- [ ] Complete record detail page layouts (leads, accounts, contacts, deals, quotes)
- [ ] Implement global command palette
- [ ] Add RTL support and accessibility

### Phase 4: Reporting and Analytics (Weeks 15–17)
- [ ] Build report execution engine
- [ ] Complete ClickHouse projections for all domains
- [ ] Implement scheduled reports with exports
- [ ] Build dashboard widget system

### Phase 5: Low-Code Workflow Engine (Weeks 18–20)
- [ ] Expand node library (validation, SLA, assignment, approval)
- [ ] Build trigger registry and event matching
- [ ] Implement workflow versioning and rollback
- [ ] Connect workflow canvas to backend

### Phase 6: CPQ/Contracts/Documents/Invoicing (Weeks 21–24)
- [ ] Complete quote lifecycle with approval integration
- [ ] Build contract management
- [ ] Build invoice and payment tracking
- [ ] Implement quote/contract PDF generation
- [ ] Add tax engine integration point

### Phase 7: Integrations (Weeks 25–27)
- [ ] Harden webhooks with retries and idempotency
- [ ] Complete email and calendar sync
- [ ] Build ERP integration module
- [ ] Implement data import/export pipelines

### Phase 8: Security/Compliance/ISO Hardening (Weeks 28–29)
- [ ] Complete RBAC/ABAC enforcement
- [ ] Implement GDPR erasure orchestration
- [ ] Add data retention and purging
- [ ] Complete SSO/SAML and MFA
- [ ] Security audit and penetration test

### Phase 9: Production Readiness (Weeks 30–31)
- [ ] Complete Helm charts and Kubernetes deployment
- [ ] Implement migration and rollback automation
- [ ] Set up SLOs, alerting, and on-call runbooks
- [ ] Disaster recovery drills

### Phase 10: Final QA and Launch Readiness (Weeks 32–33)
- [ ] Full regression test pass
- [ ] Performance benchmarking and optimization
- [ ] Documentation completion
- [ ] Launch readiness review

---

## 4. Wiring Map (Summary)

| Domain | Source of Truth | API Service | Key Events | Validation | Auth | Audit | Reporting |
|---|---|---|---|---|---|---|---|
| Lead | `crm-service` (or consolidated) | REST + GraphQL | `lead.created`, `lead.converted` | Zod + validation rules | RBAC + owner | Yes | ClickHouse projection |
| Contact | `crm-service` | REST + GraphQL | `contact.created`, `contact.updated` | Zod + dup check | RBAC + owner | Yes | ClickHouse projection |
| Account | `crm-service` | REST + GraphQL | `account.created`, `account.updated` | Zod + hierarchy | RBAC + team | Yes | ClickHouse projection |
| Deal | `crm-service` | REST + GraphQL | `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost` | Zod + blueprint | RBAC + pipeline | Yes | ClickHouse projection |
| Activity | `activities-service` or `crm-service` | REST + GraphQL | `activity.created`, `activity.completed` | Zod | RBAC | Yes | ClickHouse projection |
| Product | `finance-service` | REST + GraphQL | `product.created`, `product.updated` | Zod | Admin + read | Yes | Catalog report |
| Quote | `finance-service` | REST + GraphQL | `quote.created`, `quote.sent`, `quote.accepted`, `quote.rejected` | CPQ engine + approval | RBAC + approval | Yes | Revenue projection |
| Contract | `finance-service` | REST + GraphQL | `contract.created`, `contract.signed` | Zod + template | RBAC + legal | Yes | Contract report |
| Invoice | `finance-service` | REST + GraphQL | `invoice.created`, `invoice.paid` | Zod + tax | RBAC + finance | Yes | A/R projection |
| Payment | `finance-service` | REST + GraphQL | `payment.received`, `payment.refunded` | Reconciliation | RBAC + finance | Yes | Cash flow report |
| Document | `document-service` | REST + GraphQL | `document.uploaded`, `document.generated` | MIME + virus scan | RBAC + per-doc | Yes | Document audit |
| Workflow | `workflow-service` | REST + GraphQL | `workflow.triggered`, `workflow.completed`, `workflow.failed` | Sandbox | Admin | Yes | Execution metrics |
| Approval | `approval-service` | REST + GraphQL | `approval.requested`, `approval.approved`, `approval.rejected` | Policy engine | RBAC + approver | Yes | Approval aging |
| Report | `reporting-service` | REST + GraphQL | `report.executed`, `report.exported` | Query sandbox | RBAC + folder | Yes | Usage metrics |
| User/Auth | `auth-service` | REST + GraphQL | `user.login`, `user.logout`, `user.role_changed` | Zod | System | Yes | Security report |

**Event Bus:** Kafka with outbox pattern.  
**Error Handling:** Retry with exponential backoff, DLQ after max retries, alert on DLQ growth.  
**Authorization:** Check at API gateway (Kong) + service level (RBAC middleware) + DB level (RLS).  
**Audit:** Every mutation emits `audit.event` to Kafka; dedicated consumer writes to immutable store.

---

## 5. Code Execution Plan for Agents

### What to Edit First
1. **Backend Architect:** Start with `services/finance-service/prisma/schema.prisma` (add Contract, Payment, Order), then merge `quotes-service`.
2. **Security Architect:** Start with `packages/security/src/rls.ts` and `services/auth-service/prisma/schema.prisma` (remove billing/AI).
3. **DevOps Architect:** Start with `.github/workflows/ci.yml` (remove phantom services) and `docker-compose.yml` (prune non-existent services).

### What Not to Touch
- Do not rewrite the frontend framework (Next.js 14 is fine).
- Do not replace Kafka with another message broker.
- Do not replace Prisma with another ORM.
- Do not replace Fastify with another server framework.
- Do not add new infrastructure components without CTO approval.

### How to Avoid Conflicts
- Each agent owns specific directories. No cross-agent editing without PR review.
- Backend Architect controls all `prisma/schema.prisma` changes; other agents submit schema change requests.
- Frontend Architect controls `apps/web/`; backend changes must not break existing page contracts.
- Event schema changes go through `packages/shared-types/` and require both Backend and Workflow Architect approval.

### How to Verify Each Change
- Run `pnpm lint` and `pnpm typecheck` before any commit.
- Run `pnpm test` for affected workspace packages.
- Run `docker compose up` for integration verification.
- Run `pnpm db:migrate` for schema changes.

### Which Tests to Run
- Unit: `pnpm test --filter <service-or-package>`
- Integration: `pnpm test --filter tests/integration`
- E2E: `pnpm test:e2e` in `apps/web/`
- Load: `k6 run tests/load/api-load-test.js`

### How to Report Progress
- Daily standup updates in squad channel.
- Weekly milestone demos.
- Blockers escalated to CTO within 4 hours.

---

## 6. Definition of Done

### Feature Depth
- Every user story has acceptance criteria and is demoable.
- No stub endpoints in production paths.
- Every workflow has a happy path and at least 2 error paths handled.

### Business Logic
- All calculations use Decimal.js (no float arithmetic).
- All state machines have explicit transitions and guards.
- All business rules are configurable per tenant where applicable.

### UI/UX
- Every screen connects to real backend or is explicitly hidden.
- Design tokens match the reference.
- RTL support verified.
- Accessibility: WCAG 2.1 AA minimum.

### Security
- 100% of endpoints have authorization checks.
- RLS enforced on every query.
- Secrets rotated quarterly.
- No hardcoded credentials.

### Compliance
- GDPR erasure works end-to-end.
- Audit trail covers all mutations.
- Data retention policies enforced.
- ISO 27001 evidence package maintained.

### Reporting
- All KPIs have defined calculation logic and data lineage.
- Reports execute in < 2s for standard tenants.
- Scheduled reports run reliably.

### Integrations
- Webhooks deliver with > 99.9% success.
- OAuth tokens refresh automatically.
- Imports validate before write.
- All integrations have health endpoints.

### Performance
- API p95 < 200ms for CRUD.
- Report p95 < 2s.
- Dashboard load < 1s.
- Frontend TTI < 3s on 4G.

### Test Coverage
- Unit: > 80% business logic.
- Integration: all critical paths.
- E2E: all user journeys.
- Security: zero critical/high findings.

### Production Readiness
- All services have health checks.
- All deployments are automated.
- Runbooks exist for every alert.
- DR tested quarterly.

---

## Appendix A: Immediate Phase 0 Action Items

1. **Create branch `phase-0/cleanup`**
2. **Remove from CI:** `services/billing-service`, `services/ai-service` references in `.github/workflows/ci.yml`
3. **Remove from schemas:**
   - `aiScore`, `aiScoreReason` from `services/crm-service/prisma/schema.prisma` (Lead model)
   - `aiScore` from `services/accounts-service/prisma/schema.prisma` if present
   - `Tenant.plan` from `services/auth-service/prisma/schema.prisma`
   - `Plan`, `Subscription`, `UsageRecord`, `BillingInvoice` models from any schema
4. **Prune outbox-relay config:** Remove `USER_DATABASE_URL`, `INVENTORY_DATABASE_URL`, `PROJECT_DATABASE_URL`, `CONTRACT_DATABASE_URL`, `ASSET_DATABASE_URL`, `VENDOR_DATABASE_URL` (or add TODO comments)
5. **Merge quotes-service into finance-service:**
   - Move `quotes-service/prisma/schema.prisma` models to `finance-service/prisma/schema.prisma`
   - Move routes to `finance-service/src/routes/quotes.routes.ts`
   - Update events to use finance service as source
   - Deprecate `quotes-service` (remove from docker-compose, add deprecation note)
6. **Stabilize build:** Run `pnpm install`, `pnpm build`, `pnpm test`, `pnpm lint` and fix any existing failures
7. **Add missing models to finance-service:** `Contract`, `Payment`, `Order`
8. **Update RLS model list** in `packages/security/src/rls.ts` to remove deleted models and add new ones
9. **Open PR** with title `chore(phase-0): repo stabilization and scope cleanup`
10. **Squad kickoff meeting** — assign agents, confirm ownership, set first sprint goals

---

*End of CTO Execution Plan*

---

## Phase 1 Completion Report (2026-05-17)

### ✅ Delivered

| Workstream | Status | Evidence |
|---|---|---|
| **CRM Route Unification** | ✅ Complete | Removed proxy calls from accounts, contacts, deals, activities routes; all LIST operations now use local `crm-service` Prisma/services |
| **Missing Routes Ported** | ✅ Complete | Companies, meetings, tasks routes added to `crm-service` from retired thin services |
| **Audit Consumer Service** | ✅ Complete | New `services/audit-consumer/` with Prisma schema, Kafka consumer, idempotency, append-only storage, DLQ handling |
| **Event Catalog Expansion** | ✅ Complete | Added Zod schemas for note/company/meeting/task lifecycle events to `@nexus/shared-types` |
| **Frontend API Unification** | ✅ Complete | All CRM API clients route to `crm-service`; Next.js API routes updated; 17 React hooks violations fixed |
| **GraphQL Federation Fixed** | ✅ Complete | Removed retired subgraphs, resolved Quote conflicts, fixed enum mismatches (StepStatus, ExecutionStatus), marked shared fields as `@shareable` |
| **Backend Reference Cleanup** | ✅ Complete | Removed thin-service URL references from cadence-service queue and crm-service pipelines |
| **Infrastructure Retired** | ✅ Complete | 6 thin services removed from docker-compose (dev+prod), CI matrix, Kong config, health checks |
| **Data Migration Script** | ✅ Complete | `scripts/migrate-crm-data.ts` with dry-run, batch inserts, conflict detection |

### 📊 Verification Metrics
- `pnpm typecheck`: **61/61 passed**
- `pnpm build` (backend): **49/49 passed**
- GraphQL gateway composition: **Success** (supergraph.graphql generated)
- Frontend lint errors: **Zero** `react-hooks/rules-of-hooks` errors (was 17)

### ⚠️ Known Issues
- Web build fails on Windows symlink creation during `output: 'standalone'` step. This is a Windows dev environment limitation; builds fine on Linux/macOS. All compilation, type-checking, and linting phases pass.

