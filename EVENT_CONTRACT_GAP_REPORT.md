# Event contract gap and production readiness report

Date: 2026-07-19
Branch: `chore/event-contract-guard`
Base: `fix/local-boot` at `57bb265`

## Release assessment

The implementation in this branch is suitable for review, but the repository is **not yet
production-ready for reliable event-driven processing**. The new guard is intentionally red:
it finds 45 published events with no statically verified started consumer, 78 handlers with no
statically verified publisher, 9 published topics outside the canonical `TOPICS` catalog, and
35 source shapes that the dependency-free static analyzer cannot prove.

The most urgent release blockers are the nine off-contract topics, especially
`nexus.crm.custom-fields`, and the unsupported source shapes that can hide real publisher or
consumer relationships. The empty allowlist is deliberate; no finding was suppressed merely
to make CI green.

## What changed

### Workstream 1 — startup-aware event contract guard

- Added `scripts/check-event-contracts.mjs`, a Node-built-ins-only ESM analyzer.
- Added `scripts/check-event-contracts.test.mjs` and fixtures under
  `scripts/__fixtures__/event-contracts/`.
- Added the justified-entry allowlist at `scripts/event-contract-allowlist.json`; it is empty.
- Added `events:check` and `events:test` root package scripts.
- Added the guard to `.github/workflows/ci.yml`.
- Regenerated `docs/EVENTS.md` from repository source.
- Removed the stale parallel TypeScript scanner under `tools/event-contract/` and its obsolete
  Vitest workspace entry so there is one canonical guard.
- The scanner includes all services, including protected read-only source such as
  `analytics-service`; protected paths were inspected but not modified.

The guard resolves canonical topics, direct publishers, transactional outbox writes, handler
registrations, subscriptions, helper-registered handlers, service boot imports, and
`buildServer()`-delegated startup. Its fixture suite proves the wrong-topic `invoice.paid`
shape fails.

### Workstream 2 — credential hygiene

- Updated `scripts/seed-demo-live.mjs` and `scripts/seed-commercial-live.mjs` to require
  `PASSWORD` with no fallback and to fail before network access when it is absent.
- Removed auth response, token, tenant/owner claim, email, and temporary-password logging.
- Added recursive sensitive-key redaction for generic error snippets.
- Added `scripts/seed-credential-hygiene.test.mjs`.

### Workstream 3 — effect-level health probes

- Added the reusable probe registry in `packages/service-utils/src/effect-probes.ts`, its tests,
  and package export.
- Extended `registerHealthRoutes` with an optional fourth argument; existing three-argument
  callers retain their behavior.
- Added output-oriented Prometheus metrics for interval inputs, committed writes, last
  successful output, pending outbox depth/age, DLQ depth/first-observed age, observation age,
  probe status, and sampler/interval failures.
- Added warning-versus-failure semantics: warnings degrade the report while retaining HTTP 200;
  failures return HTTP 503.
- Wired outbox depth/age and relay interval results into `services/outbox-relay`.
- Updated stale outbox-relay fixtures to use the current `PENDING`, `SENT`, and `FAILED` states.

Kafka lag is intentionally not treated as a health signal.

## Gate results

### Before the changes

The targeted baseline runs captured before implementation were:

```text
packages/service-utils
Test Files  7 passed (7)
Tests       32 passed (32)

services/outbox-relay
Test Files  1 failed | 1 passed (2)
Tests       2 failed | 10 passed (12)
```

The two relay failures were stale test fixtures that still modeled the previous outbox status
contract, not product-code failures. CRM and finance baselines were 134/134 and 123/123.

### After the changes

```text
npx turbo typecheck
Tasks:    64 successful, 64 total
Cached:   19 cached, 64 total
Time:     1m32.002s

npx turbo build
@nexus/graphql-gateway failed while downloading:
https://rover.apollo.dev/tar/supergraph/x86_64-pc-windows-msvc/latest-2
Cause: operation timed out

npx turbo build --filter=!@nexus/graphql-gateway
Tasks:    51 successful, 51 total
Cached:   32 cached, 51 total
Time:     49.083s

services/crm-service / npx vitest run
Test Files  18 passed (18)
Tests       134 passed (134)

services/finance-service / npx vitest run
Test Files  14 passed (14)
Tests       123 passed (123)

packages/service-utils / npx vitest run
Test Files  8 passed (8)
Tests       50 passed (50)

services/outbox-relay / npx vitest run
Test Files  2 passed (2)
Tests       15 passed (15)

pnpm events:test
tests 14
pass 14
fail 0

node --test scripts/seed-credential-hygiene.test.mjs
tests 5
pass 5
fail 0
```

Prisma generation initially hit a Windows parallel-engine rename `EPERM`; generating each
service client sequentially succeeded. The final typecheck above is after that generation.

The expected-red contract gate reports:

```text
Event contracts: 141 publishers, 223 handlers,
45 boot-started consumer units, 0 allowlisted.
Finding counts: unreachable=0, unconsumed=45, unpublished=78,
unknownTopic=9, unsupported=35
```

## GUARD-FINDINGS

Assessments are conservative. **Real bug** means the current source demonstrably violates the
canonical topic contract or is the confirmed open defect from the brief. **Unsure** means a
product owner or service owner must decide whether the event is intentionally external/future,
or the static analyzer must first be extended to resolve the relevant wrapper/dynamic shape.
There are no intentional allowlisted findings in this branch.

### (a) Unreachable handlers — 0

None. The seeded wrong-topic `invoice.paid` fixture is detected by the test suite. In the real
repository, the analytics consumer is now boot-started and subscribes `TOPICS.PAYMENTS`, so
`invoice.paid` is correctly not reported in this category.

### (b) Published events with no started consumer — 45

| Finding | Assessment |
| --- | --- |
| `activities-service: activity.overdue @ nexus.crm.activities` (`reminders.poller.ts:138`) | unsure |
| `approval-service: approval.step.advanced @ nexus.automation.workflows` (`requests.service.ts:333`) | unsure |
| `approval-service: approval.step.delegated @ nexus.automation.workflows` (`requests.service.ts:459`) | unsure |
| `auth-service: auth.governance.audited @ nexus.compliance.audit` (`unified-audit.ts:93`) | unsure |
| `auth-service: data.ownership.transfer @ data.ownership.transfer` (`data-ownership.routes.ts:40`) | **real bug** — also off-contract |
| `auth-service: gdpr.export.requested @ gdpr.export.requested` (`gdpr.routes.ts:96`) | **real bug** — also off-contract |
| `billing-service: payment.received @ nexus.finance.payments` (`webhooks.routes.ts:61`) | unsure |
| `billing-service: credit_note.issued @ nexus.finance.invoices` (`creditnotes.routes.ts:111`) | unsure |
| `blueprint-service: blueprint.playbook.created @ nexus.blueprint.events` (`playbooks.service.ts:48`) | unsure |
| `blueprint-service: blueprint.playbook.updated @ nexus.blueprint.events` (`playbooks.service.ts:63`) | unsure |
| `blueprint-service: blueprint.stage.upserted @ nexus.blueprint.events` (`playbooks.service.ts:106`) | unsure |
| `blueprint-service: blueprint.transition.function @ nexus.blueprint.events` (`transition-actions.service.ts:203`) | unsure |
| `blueprint-service: blueprint.transition.created @ nexus.blueprint.events` (`transitions.service.ts:107`) | unsure |
| `blueprint-service: blueprint.transition.completed @ nexus.blueprint.events` (`transitions.service.ts:378`) | unsure |
| `cadence-service: cadence.enrolled @ nexus.automation.workflows` (`enrollments.service.ts:196`) | unsure |
| `cadence-service: cadence.step.processed @ nexus.automation.workflows` (`queue.service.ts:173`) | unsure |
| `campaign-service: campaign.member_added @ nexus.analytics.events` (`members.service.ts:50`) | unsure |
| `comm-service: call.logged @ nexus.comms.calls` (`telephony.routes.ts:254`) | unsure |
| `comm-service: whatsapp.sent @ nexus.comms.calls` (`whatsapp-outbound.routes.ts:87`) | unsure |
| `comm-service: email.sent @ nexus.comms.emails` (`outbox.service.ts:154`) | unsure |
| `crm-service: record.reassigned @ nexus.crm.leads` (`assignment-rules.routes.ts:184`) | unsure |
| `crm-service: record.reassigned @ nexus.crm.deals` (`assignment-rules.routes.ts:184`) | unsure |
| `crm-service: record.reassigned @ nexus.crm.accounts` (`assignment-rules.routes.ts:184`) | unsure |
| `crm-service: record.reassigned @ nexus.crm.contacts` (`assignment-rules.routes.ts:184`) | unsure |
| `crm-service: deal.team.updated @ nexus.crm.deals` (`deal-team.service.ts:70`) | unsure |
| `crm-service: deal.archived @ nexus.crm.deals` (`dedup.service.ts:845`) | unsure |
| `crm-service: deal.restored @ nexus.crm.deals` (`deals.service.ts:997`) | unsure |
| `crm-service: deal.reopened @ nexus.crm.deals` (`deals.service.ts:1203`) | unsure |
| `crm-service: deal.meddic_updated @ nexus.crm.deals` (`deals.service.ts:1346`) | unsure |
| `crm-service: records.bulk.reassigned @ records.bulk.reassigned` (`bulk-records.use-case.ts:208`) | **real bug** — also off-contract |
| `finance-service: contract.deleted @ nexus.finance.contracts` (`contracts.service.ts:212`) | unsure |
| `finance-service: subscription.creation_failed @ nexus.finance.contracts` (`commercial-records.use-case.ts:2987`) | unsure |
| `integration-service: integration.sync.started @ nexus.integration.events` (`sync.service.ts:60`) | unsure |
| `integration-service: integration.sync.completed @ nexus.integration.events` (`sync.service.ts:136`) | unsure |
| `integration-service: integration.sync.failed @ nexus.integration.events` (`sync.service.ts:157`) | unsure |
| `notification-service: whatsapp.received @ nexus.comms.calls` (`whatsapp-webhook.routes.ts:123`) | unsure |
| `planning-service: forecast.submitted @ nexus.analytics.events` (`forecasts.service.ts:40`) | unsure |
| `planning-service: forecast.reviewed @ nexus.analytics.events` (`forecasts.service.ts:148`) | unsure |
| `portal-service: portal.engagement @ nexus.crm.activities` (`portal-events.ts:40`) | unsure |
| `portal-service: portal.case.submitted @ nexus.crm.activities` (`portal-events.ts:85`) | unsure |
| `portal-service: portal.case.commented @ nexus.crm.activities` (`portal-events.ts:119`) | unsure |
| `portal-service: portal.deal.registered @ nexus.crm.leads` (`portal-events.ts:160`) | unsure |
| `quotes-service: order.requested @ nexus.finance.contracts` (`quote-events.ts:78`) | unsure |
| `workflow-service: workflow.completed @ nexus.automation.workflows` (`executor.ts:134`) | unsure |
| `workflow-service: journey.enrolled @ nexus.automation.workflows` (`command-journeys.service.ts:142`) | unsure |

### (c) Handlers with no statically verified publisher — 78

Every entry in this category is **unsure**, not allowlisted. Many quote, ticket, campaign, and
generic record publishers use wrapper functions or computed event types that also appear in
category (e), so treating these as proven dead code would be premature.

| Service | Events flagged (each is **unsure**) | Subscribed topics / source |
| --- | --- | --- |
| analytics-service | `quote.created`, `quote.created_from_rfq`, `quote.sent`, `quote.accepted`, `quote.rejected` | broad analytics consumer subscription; `events.consumer.ts:226-233` |
| analytics-service | `contact.deleted` | broad analytics consumer subscription; `events.consumer.ts:320` |
| analytics-service | `order.created`, `quote.converted_to_order`, `order.updated` | broad analytics consumer subscription; `events.consumer.ts:366-371` |
| analytics-service | `ticket.created`, `ticket.updated`, `ticket.assigned`, `ticket.status_changed`, `ticket.resolved`, `ticket.closed`, `ticket.reopened` | broad analytics consumer subscription; `events.consumer.ts:409-415` |
| analytics-service | `campaign.created`, `campaign.updated`, `campaign.status_changed`, `campaign.launched` | broad analytics consumer subscription; `events.consumer.ts:436-439` |
| analytics-service | `subscription.created` | broad analytics consumer subscription; `events.consumer.ts:468` |
| billing-service | `subscription.created` | `nexus.finance.contracts`; `finance-subscription.consumer.ts:282` |
| cadence-service | `email.received` | `nexus.comms.emails`, `nexus.crm.activities`; `index.ts:90` |
| comm-service | `quote.sent` | activities/deals/quotes; `trigger.consumer.ts:37` |
| crm-service | `email.opened`, `page.viewed`, `content.downloaded` | activities/deals/leads; `scoring.consumer.ts:95-115` |
| deals-service | `quote.created`, `quote.created_from_rfq`, `quote.submitted_for_approval`, `quote.approved`, `quote.rejected`, `quote.sent`, `quote.signature_requested`, `quote.signed`, `quote.accepted`, `quote.expired`, `quote.voided`, `quote.converted_to_order`, `quote.revision_created` | `nexus.finance.quotes`; `quote-projection.consumer.ts:25` |
| finance-service | `rfq.created` | deals/quotes; `auto-quote.consumer.ts:468` |
| integration-service | `activity.updated` | CRM topics and quotes; `events.consumer.ts:87` |
| notification-service | `quote.sent`, `quote.accepted`, `quote.rejected` | `nexus.finance.quotes`; `quote.consumer.ts:113-171` |
| realtime-service | `lead.qualified`, `lead.unqualified`, `lead.deleted` | `nexus.crm.leads`; `lead.consumer.ts:42-54` |
| realtime-service | `quote.created`, `quote.sent`, `quote.accepted`, `quote.rejected`, `quote.voided`, `quote.updated`, `quote.duplicated`, `rfq.created`, `rfq.converted_to_quote`, `order.created`, `quote.converted_to_order`, `quote.document.rendered`, `quote.esign.sent` | `nexus.finance.quotes`; `quote.consumer.ts:38-82` |
| search-service | `activity.updated`, `activity.deleted` | broad indexer subscription; `indexer.consumer.ts:86-88` |
| search-service | `quote.created`, `quote.updated`, `quote.sent`, `quote.accepted`, `quote.rejected`, `quote.voided` | broad indexer subscription; `indexer.consumer.ts:91-96` |
| search-service | `kb.article.created`, `kb.article.updated`, `kb.article.published`, `kb.article.archived` | broad indexer subscription; `indexer.consumer.ts:102-105` |
| workflow-service | `quote.created`, `quote.sent`, `quote.accepted`, `quote.rejected` | broad workflow trigger subscription; `trigger.consumer.ts:96-99` |
| workflow-service | `custom_button.workflow.trigger` | broad workflow trigger subscription; `trigger.consumer.ts:141` |

### (d) Published topics absent from `TOPICS` — 9

| Finding | Assessment |
| --- | --- |
| `auth-service: ? @ comm.email.send` (`routes/auth.ts:190`) | **real bug** — outbox topic is outside the catalog and the event type is not statically enumerable |
| `auth-service: data.ownership.transfer @ data.ownership.transfer` (`data-ownership.routes.ts:40`) | **real bug** — literal topic outside the catalog |
| `auth-service: gdpr.erasure.requested @ gdpr.erasure.requested` (`gdpr.routes.ts:39`) | **real bug** — consumers now match the literal, but the topic remains outside the canonical contract |
| `auth-service: gdpr.export.requested @ gdpr.export.requested` (`gdpr.routes.ts:96`) | **real bug** — literal topic outside the catalog and no verified consumer |
| `crm-service: ? @ nexus.crm.custom-fields` (`prisma.ts:98`) | **real bug, confirmed open** — `validateTopic()` can reject the publish and the calling path swallows the failure |
| `crm-service: records.bulk.reassigned @ records.bulk.reassigned` (`bulk-records.use-case.ts:208`) | **real bug** — literal topic outside the catalog and no verified consumer |
| `knowledge-service: ? @ nexus.knowledge.articles` (`knowledge.service.ts:51`) | **real bug** — locally defined topic constant is missing from the canonical catalog |
| `knowledge-service: kb.article.deleted @ nexus.knowledge.articles` (`knowledge.service.ts:66`) | **real bug** — same catalog gap, with a resolved event |
| `ticket-service: ? @ nexus.ticket.events` (`tickets.service.ts:69`) | **real bug** — locally defined topic constant is missing from the canonical catalog |

No category (d) item is allowlisted.

### Additional analyzer findings — unsupported source shapes (35)

These are analysis-coverage gaps rather than category (a)-(d) conclusions. They remain release
risk because a real contract defect can hide behind them:

- Dynamic subscription inputs: `audit-consumer`, outbox DLQ replay, and workflow automation DLQ.
- Dynamic handler registration: campaign, CRM finance timeline/quote projection, integration,
  realtime quote status, workflow scoring/journey enrollment, and an ambiguous
  router-coprocessor call.
- Wrapper/computed publishers: auth email outbox; campaign, chatbot, CRM bulk/lead/prisma,
  data import, email enrichment, finance quote/versioning/commercial outbox, knowledge, leads,
  metadata, notes, quotes, storage, territory, ticket, and workflow notification/rule/journey
  publishers.

The exact 35 locations remain in the guard's terminal output. These should be reduced by adding
small, deterministic static patterns and fixtures rather than by silently ignoring them.

## Assumptions and judgement calls

- Protected source was treated as read-only, not invisible. The scanner reads
  `analytics-service` because repository-wide results are otherwise false.
- “No publisher” and “no consumer” mean “not statically verified in this monorepo.” External
  producers/consumers and runtime-computed contracts need explicit, justified allowlist entries.
- The empty allowlist is preferable to guessing product intent.
- DLQ age is measured from the first observation of non-zero backlog because the current DLQ
  interface does not expose the oldest record timestamp. The metric name documents this.
- Probe samplers are cached for at least 15 seconds to avoid turning health/metrics scraping into
  database load.
- Warning thresholds return HTTP 200; only failed effect probes return 503.
- Existing three-argument `registerHealthRoutes` callers were intentionally left unchanged.

## Blocked items

- The full build can only be completed through the allowed GraphQL exception: Apollo Rover's
  Windows binary download timed out. All other 51 build tasks passed.
- The event guard remains red by design. A release cannot claim complete event-contract safety
  until findings are fixed or intentionally allowlisted with owner-approved reasons.
- The 35 unsupported shapes prevent a claim that the static inventory is complete.

No do-not-touch file was modified.

## Recommended hardening order

1. Fix the nine off-contract topics, beginning with `nexus.crm.custom-fields`, then add focused
   regression fixtures for each contract shape.
2. Extend the analyzer for the publisher wrappers and computed handlers behind the 35
   unsupported findings; rerun category (b)/(c) classification afterward.
3. Assign owners to the remaining orphan and phantom entries. Fix real defects and allowlist
   only intentional external/future contracts with expiry or review dates in the reason.
4. Adopt effect probes in every event-processing engine, with engine-specific thresholds and
   dashboards/alerts for zero-output-with-input, pending outbox age, DLQ backlog, and stale
   observations.
5. Add a Linux CI build job with cached/pinned Rover so GraphQL composition is no longer
   dependent on a live binary download during the gate.
