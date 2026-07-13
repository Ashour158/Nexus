# Nexus Event Catalog

> **Generated** by `tools/event-contract/generate-catalog.ts` from a static scan of
> `services/*/src/**`. Do not edit by hand — run `npx tsx tools/event-contract/generate-catalog.ts`.
> The same scan backs the guardrail test `tools/event-contract/event-contract.test.ts`.

This catalogs every hand-rolled domain event on the `@nexus/kafka` backbone with its
publisher service(s) and consumer service(s).

**Status legend**

| Status | Meaning |
| --- | --- |
| `OK` | Published **and** consumed in-repo. |
| `DEAD` | Published, but no `consumer.on(...)` handler. `(allow-listed)` = intentional fire-and-forget (see allowlist.ts). `⚠` = unexpected, fails CI. |
| `ORPHAN` | Subscribed, but no in-repo publisher. `(allow-listed)` = produced outside the scan / known bug. `⚠` = unexpected, fails CI. |

**Summary**

- Distinct event types: **174**  (published: 159, subscribed: 94)
- OK (wired both ways): **79**
- DEAD (published, no consumer): **80**  — all allow-listed as intentional fire-and-forget.
- ORPHAN (subscribed, no publisher): **15**  — all allow-listed (external publisher or flagged bug).

## Heuristic limits

The scanner is regex/string based (it must run without Kafka or a DB). It deliberately
misses a few dynamic shapes rather than invent false edges; these are covered by the
allow-lists in `tools/event-contract/allowlist.ts`:

- **L1** — dynamic outbox CRUD mirror publishes `${model}.created|updated|deleted` template literals (`services/*/src/prisma.ts`); concrete names are not statically knowable.
- **L2** — publishes whose `type` is a pre-computed variable (`const type = inbound ? 'email.received' : 'email.sent'`).
- **L3** — consumers registered in a loop over an array of literals (`for (const t of [...]) consumer.on(t, …)`).
- **L4** — topic-level raw consumers (audit-consumer uses kafkajs `eachMessage` on a whole topic, not `consumer.on(type)`).

## Full catalog

| Event type | Publisher service(s) | Consumer service(s) | Status |
| --- | --- | --- | --- |
| `account.archived` | crm-service | analytics-service, realtime-service, workflow-service | OK |
| `account.created` | crm-service | analytics-service, integration-service, realtime-service, territory-service, workflow-service | OK |
| `account.merged` | crm-service | workflow-service | OK |
| `account.restored` | crm-service | realtime-service, workflow-service | OK |
| `account.updated` | crm-service | analytics-service, integration-service, realtime-service, workflow-service | OK |
| `activity.completed` | crm-service | analytics-service, cadence-service, incentive-service, notification-service, realtime-service, workflow-service | OK |
| `activity.created` | activities-service, comm-service, crm-service | analytics-service, comm-service, crm-service, incentive-service, integration-service, notification-service, realtime-service, workflow-service | OK |
| `activity.overdue` | activities-service | — | DEAD (allow-listed) |
| `activity.updated` | — | integration-service | ORPHAN (allow-listed) |
| `approval.request.approved` | approval-service | finance-service, notification-service, workflow-service | OK |
| `approval.request.created` | approval-service | notification-service | OK |
| `approval.request.escalated` | approval-service | notification-service | OK |
| `approval.request.rejected` | approval-service | finance-service, notification-service, workflow-service | OK |
| `approval.step.advanced` | approval-service | — | DEAD (allow-listed) |
| `approval.step.delegated` | approval-service | — | DEAD (allow-listed) |
| `auth.governance.audited` | auth-service | — | DEAD (allow-listed) |
| `automation.loop_guard.tripped` | workflow-service | — | DEAD (allow-listed) |
| `automation.rate_cap.tripped` | workflow-service | — | DEAD (allow-listed) |
| `blueprint.playbook.created` | blueprint-service | — | DEAD (allow-listed) |
| `blueprint.playbook.updated` | blueprint-service | — | DEAD (allow-listed) |
| `blueprint.sla.breached` | blueprint-service | notification-service | OK |
| `blueprint.stage.notification` | blueprint-service | notification-service | OK |
| `blueprint.stage.upserted` | blueprint-service | — | DEAD (allow-listed) |
| `blueprint.transition.completed` | blueprint-service | — | DEAD (allow-listed) |
| `blueprint.transition.created` | blueprint-service | — | DEAD (allow-listed) |
| `blueprint.transition.function` | blueprint-service | — | DEAD (allow-listed) |
| `blueprint.transition.notification` | blueprint-service | notification-service | OK |
| `cadence.enrolled` | cadence-service | — | DEAD (allow-listed) |
| `cadence.step.processed` | cadence-service | — | DEAD (allow-listed) |
| `call.logged` | comm-service | — | DEAD (allow-listed) |
| `campaign.created` | campaign-service | analytics-service | OK |
| `campaign.launched` | campaign-service | analytics-service | OK |
| `campaign.member_added` | campaign-service | — | DEAD (allow-listed) |
| `campaign.send.requested` | campaign-service | — | DEAD (allow-listed) |
| `campaign.status_changed` | campaign-service | analytics-service | OK |
| `campaign.updated` | campaign-service | analytics-service | OK |
| `commission.approved` | finance-service | analytics-service | OK |
| `commission.calculated` | finance-service | analytics-service | OK |
| `commission.clawback` | finance-service | analytics-service | OK |
| `commission.paid` | — | analytics-service | ORPHAN (allow-listed) |
| `contact.archived` | crm-service | realtime-service, workflow-service | OK |
| `contact.created` | crm-service | analytics-service, realtime-service, workflow-service | OK |
| `contact.deleted` | — | analytics-service | ORPHAN (allow-listed) |
| `contact.merged` | crm-service | workflow-service | OK |
| `contact.restored` | crm-service | realtime-service, workflow-service | OK |
| `contact.updated` | crm-service | analytics-service, realtime-service, workflow-service | OK |
| `content.downloaded` | — | crm-service | ORPHAN (allow-listed) |
| `contract.created` | finance-service | analytics-service | OK |
| `contract.deleted` | finance-service | — | DEAD (allow-listed) |
| `contract.signed` | finance-service | analytics-service | OK |
| `contract.terminated` | finance-service | analytics-service | OK |
| `credit_note.issued` | billing-service | — | DEAD (allow-listed) |
| `data.ownership.transfer` | auth-service | — | DEAD (allow-listed) |
| `deal.archived` | crm-service | — | DEAD (allow-listed) |
| `deal.assigned` | crm-service | notification-service | OK |
| `deal.at_risk` | crm-service | notification-service | OK |
| `deal.created` | crm-service, deals-service | analytics-service, crm-service, finance-service, incentive-service, planning-service, realtime-service, workflow-service | OK |
| `deal.lost` | crm-service | analytics-service, notification-service, planning-service, realtime-service, workflow-service | OK |
| `deal.meddic_updated` | crm-service | — | DEAD (allow-listed) |
| `deal.reopened` | crm-service | — | DEAD (allow-listed) |
| `deal.restored` | crm-service | — | DEAD (allow-listed) |
| `deal.rotten` | crm-service, deals-service | notification-service | OK |
| `deal.stage_changed` | crm-service, deals-service | analytics-service, blueprint-service, crm-service, finance-service, notification-service, planning-service, realtime-service, workflow-service | OK |
| `deal.team.updated` | crm-service | — | DEAD (allow-listed) |
| `deal.updated` | crm-service | crm-service, planning-service | OK |
| `deal.won` | crm-service | analytics-service, comm-service, incentive-service, notification-service, planning-service, realtime-service, workflow-service | OK |
| `drq.approved` | finance-service | — | DEAD (allow-listed) |
| `drq.rejected` | finance-service | — | DEAD (allow-listed) |
| `drq.requested` | finance-service | — | DEAD (allow-listed) |
| `email.opened` | — | crm-service | ORPHAN (allow-listed) |
| `email.received` | — | cadence-service | ORPHAN (allow-listed) |
| `email.replied` | email-sync-service | cadence-service | OK |
| `email.sent` | comm-service | — | DEAD (allow-listed) |
| `file.deleted` | storage-service | — | DEAD (allow-listed) |
| `file.uploaded` | storage-service | — | DEAD (allow-listed) |
| `forecast.reviewed` | planning-service | — | DEAD (allow-listed) |
| `forecast.submitted` | planning-service | — | DEAD (allow-listed) |
| `gdpr.erasure.requested` | auth-service | approval-service, comm-service, crm-service, finance-service, workflow-service | OK |
| `gdpr.export.requested` | auth-service | — | DEAD (allow-listed) |
| `integration.sync.completed` | integration-service | — | DEAD (allow-listed) |
| `integration.sync.failed` | integration-service | — | DEAD (allow-listed) |
| `integration.sync.started` | integration-service | — | DEAD (allow-listed) |
| `invoice.created` | billing-service, finance-service | analytics-service | OK |
| `invoice.paid` | finance-service | analytics-service | OK |
| `invoice.sent` | finance-service | analytics-service | OK |
| `journey.completed` | workflow-service | — | DEAD (allow-listed) |
| `journey.enrolled` | workflow-service | — | DEAD (allow-listed) |
| `journey.failed` | workflow-service | — | DEAD (allow-listed) |
| `journey.step` | workflow-service | — | DEAD (allow-listed) |
| `kb.article.deleted` | knowledge-service | — | DEAD (allow-listed) |
| `lead.archived` | crm-service | realtime-service | OK |
| `lead.assigned` | crm-service | analytics-service, notification-service, realtime-service | OK |
| `lead.captured` | chatbot-service | analytics-service | OK |
| `lead.converted` | crm-service | analytics-service, incentive-service, realtime-service | OK |
| `lead.created` | crm-service | analytics-service, crm-service, incentive-service, realtime-service, territory-service, workflow-service | OK |
| `lead.deleted` | — | realtime-service | ORPHAN (allow-listed) |
| `lead.qualified` | crm-service | realtime-service | OK |
| `lead.restored` | crm-service | realtime-service | OK |
| `lead.status_changed` | — | analytics-service | ORPHAN (allow-listed) |
| `lead.unqualified` | crm-service | realtime-service | OK |
| `lead.updated` | crm-service | analytics-service, crm-service, realtime-service | OK |
| `note.mentioned` | notes-service | notification-service | OK |
| `notification.created` | activities-service, chatbot-service, notification-service | realtime-service | OK |
| `notification.requested` | finance-service, ticket-service, workflow-service | notification-service | OK |
| `order.cancelled` | finance-service | — | DEAD (allow-listed) |
| `order.created` | finance-service | analytics-service, realtime-service | OK |
| `order.created_from_quote` | — | analytics-service | ORPHAN (allow-listed) |
| `order.fulfillment.created` | finance-service | — | DEAD (allow-listed) |
| `order.fulfillment.progressed` | finance-service | — | DEAD (allow-listed) |
| `order.fulfillment.updated` | finance-service | — | DEAD (allow-listed) |
| `order.requested` | quotes-service | — | DEAD (allow-listed) |
| `order.status_changed` | — | analytics-service | ORPHAN (allow-listed) |
| `order.updated` | finance-service | analytics-service | OK |
| `page.viewed` | — | crm-service | ORPHAN (allow-listed) |
| `payment.received` | billing-service | — | DEAD (allow-listed) |
| `portal.case.commented` | portal-service | — | DEAD (allow-listed) |
| `portal.case.submitted` | portal-service | — | DEAD (allow-listed) |
| `portal.deal.registered` | portal-service | — | DEAD (allow-listed) |
| `portal.engagement` | portal-service | — | DEAD (allow-listed) |
| `quote.accepted` | finance-service, quotes-service | analytics-service, notification-service, realtime-service, workflow-service | OK |
| `quote.approval.advanced` | finance-service | — | DEAD (allow-listed) |
| `quote.approved` | finance-service | — | DEAD (allow-listed) |
| `quote.converted_to_order` | finance-service | realtime-service | OK |
| `quote.created` | finance-service | analytics-service, realtime-service, workflow-service | OK |
| `quote.created_from_rfq` | finance-service | — | DEAD (allow-listed) |
| `quote.discount_request.created` | finance-service | finance-service, realtime-service | OK |
| `quote.document.rendered` | finance-service | realtime-service | OK |
| `quote.duplicated` | finance-service | realtime-service | OK |
| `quote.esign.sent` | — | realtime-service | ORPHAN (allow-listed) |
| `quote.expired` | finance-service, quotes-service | — | DEAD (allow-listed) |
| `quote.rejected` | finance-service | analytics-service, notification-service, realtime-service, workflow-service | OK |
| `quote.restored` | finance-service | — | DEAD (allow-listed) |
| `quote.revised_from_drq` | finance-service | — | DEAD (allow-listed) |
| `quote.revision_created` | finance-service | — | DEAD (allow-listed) |
| `quote.sent` | finance-service | analytics-service, comm-service, notification-service, realtime-service, workflow-service | OK |
| `quote.signature_requested` | finance-service | — | DEAD (allow-listed) |
| `quote.signed` | finance-service | — | DEAD (allow-listed) |
| `quote.submitted_for_approval` | finance-service | — | DEAD (allow-listed) |
| `quote.superseded` | finance-service | — | DEAD (allow-listed) |
| `quote.updated` | finance-service | realtime-service | OK |
| `quote.version.snapshotted` | finance-service | — | DEAD (allow-listed) |
| `quote.viewed` | finance-service | — | DEAD (allow-listed) |
| `quote.voided` | finance-service | realtime-service | OK |
| `record.reassigned` | crm-service | — | DEAD (allow-listed) |
| `records.bulk.reassigned` | crm-service | — | DEAD (allow-listed) |
| `rfq.converted` | — | realtime-service | ORPHAN (allow-listed) |
| `rfq.converted_to_quote` | finance-service | realtime-service | OK |
| `rfq.created` | finance-service | finance-service, realtime-service | OK |
| `rfq.deleted` | finance-service | — | DEAD (allow-listed) |
| `rfq.updated` | finance-service | — | DEAD (allow-listed) |
| `sla.breached` | workflow-service | notification-service | OK |
| `subscription.activated` | billing-service | — | DEAD (allow-listed) |
| `subscription.canceled` | — | analytics-service | ORPHAN (allow-listed) |
| `subscription.cancelled` | billing-service | analytics-service | OK |
| `subscription.created` | finance-service | analytics-service, billing-service | OK |
| `subscription.creation_failed` | finance-service | — | DEAD (allow-listed) |
| `subscription.dunning` | billing-service | — | DEAD (allow-listed) |
| `subscription.past_due` | billing-service | — | DEAD (allow-listed) |
| `subscription.payment_retry` | billing-service | — | DEAD (allow-listed) |
| `subscription.renewed` | billing-service | — | DEAD (allow-listed) |
| `subscription.updated` | — | analytics-service | ORPHAN (allow-listed) |
| `ticket.assigned` | ticket-service | analytics-service | OK |
| `ticket.closed` | ticket-service | analytics-service | OK |
| `ticket.comment_added` | ticket-service | — | DEAD (allow-listed) |
| `ticket.created` | ticket-service | analytics-service | OK |
| `ticket.reopened` | ticket-service | analytics-service | OK |
| `ticket.resolved` | ticket-service | analytics-service | OK |
| `ticket.sla.breached` | ticket-service | — | DEAD (allow-listed) |
| `ticket.status_changed` | ticket-service | analytics-service | OK |
| `ticket.updated` | ticket-service | analytics-service | OK |
| `whatsapp.received` | notification-service | — | DEAD (allow-listed) |
| `whatsapp.sent` | comm-service | — | DEAD (allow-listed) |
| `workflow.branch.start` | workflow-service | workflow-service | OK |
| `workflow.completed` | workflow-service | — | DEAD (allow-listed) |

## DEAD events (published, no in-repo consumer)

| Event type | Publisher(s) | Why allow-listed |
| --- | --- | --- |
| `activity.overdue` | activities-service | reminder telemetry — no command consumer today |
| `approval.step.advanced` | approval-service | approval lifecycle telemetry |
| `approval.step.delegated` | approval-service | approval lifecycle telemetry |
| `auth.governance.audited` | auth-service | audit sink — consumed by audit-consumer topic subscriber (L4) |
| `automation.loop_guard.tripped` | workflow-service | automation safety telemetry |
| `automation.rate_cap.tripped` | workflow-service | automation safety telemetry |
| `blueprint.playbook.created` | blueprint-service | blueprint lifecycle-only, not user-facing |
| `blueprint.playbook.updated` | blueprint-service | blueprint lifecycle-only, not user-facing |
| `blueprint.stage.upserted` | blueprint-service | blueprint lifecycle-only, not user-facing |
| `blueprint.transition.completed` | blueprint-service | blueprint lifecycle-only, not user-facing |
| `blueprint.transition.created` | blueprint-service | blueprint lifecycle-only, not user-facing |
| `blueprint.transition.function` | blueprint-service | blueprint custom-function hook, lifecycle-only |
| `cadence.enrolled` | cadence-service | cadence lifecycle telemetry |
| `cadence.step.processed` | cadence-service | cadence lifecycle telemetry |
| `call.logged` | comm-service | CRM activity/timeline sink |
| `campaign.member_added` | campaign-service | analytics projection sink |
| `campaign.send.requested` | campaign-service | campaign→comm send worker (outside scan) |
| `contract.deleted` | finance-service | contract lifecycle variant — no consumer yet |
| `credit_note.issued` | billing-service | finance analytics/timeline sink |
| `data.ownership.transfer` | auth-service | ownership transfer handled by request worker |
| `deal.archived` | crm-service | deal lifecycle variant — no consumer yet |
| `deal.meddic_updated` | crm-service | deal qualification telemetry — no consumer yet |
| `deal.reopened` | crm-service | deal lifecycle variant — no consumer yet |
| `deal.restored` | crm-service | deal lifecycle variant — no consumer yet |
| `deal.team.updated` | crm-service | deal-team change telemetry — no consumer yet |
| `drq.approved` | finance-service | CPQ discount-request lifecycle — no consumer today |
| `drq.rejected` | finance-service | CPQ discount-request lifecycle — no consumer today |
| `drq.requested` | finance-service | CPQ discount-request lifecycle — no consumer today |
| `email.sent` | comm-service | CRM engagement-timeline sink, consumed via loop-registered handler (L3) |
| `file.deleted` | storage-service | storage lifecycle — consumed outside scan |
| `file.uploaded` | storage-service | storage lifecycle — consumed outside scan |
| `forecast.reviewed` | planning-service | planning lifecycle telemetry |
| `forecast.submitted` | planning-service | planning lifecycle telemetry |
| `gdpr.export.requested` | auth-service | GDPR export handled by request worker |
| `integration.sync.completed` | integration-service | integration sync telemetry |
| `integration.sync.failed` | integration-service | integration sync telemetry |
| `integration.sync.started` | integration-service | integration sync telemetry |
| `journey.completed` | workflow-service | journey engine internal progression |
| `journey.enrolled` | workflow-service | journey engine internal progression |
| `journey.failed` | workflow-service | journey engine internal progression |
| `journey.step` | workflow-service | journey engine internal progression |
| `kb.article.deleted` | knowledge-service | knowledge lifecycle telemetry |
| `order.cancelled` | finance-service | order lifecycle — no consumer today |
| `order.fulfillment.created` | finance-service | fulfillment lifecycle — no consumer today |
| `order.fulfillment.progressed` | finance-service | fulfillment lifecycle — no consumer today |
| `order.fulfillment.updated` | finance-service | fulfillment lifecycle — no consumer today |
| `order.requested` | quotes-service | CPQ→finance handoff; finance creates the order authority |
| `payment.received` | billing-service | billing→finance timeline sink (also drives dunning externally) |
| `portal.case.commented` | portal-service | portal→CRM timeline sink |
| `portal.case.submitted` | portal-service | portal→CRM timeline sink |
| `portal.deal.registered` | portal-service | portal→CRM lead/timeline sink |
| `portal.engagement` | portal-service | portal→CRM timeline sink |
| `quote.approval.advanced` | finance-service | CPQ approval lifecycle — no consumer today |
| `quote.approved` | finance-service | CPQ approval lifecycle — no consumer today |
| `quote.created_from_rfq` | finance-service | CPQ lifecycle — no consumer today |
| `quote.expired` | finance-service, quotes-service | CPQ lifecycle — no consumer today |
| `quote.restored` | finance-service | CPQ lifecycle — no consumer today |
| `quote.revised_from_drq` | finance-service | CPQ discount-revision lifecycle — no consumer today |
| `quote.revision_created` | finance-service | CPQ versioning lifecycle — no consumer today |
| `quote.signature_requested` | finance-service | CPQ e-sign lifecycle — no consumer today |
| `quote.signed` | finance-service | CPQ e-sign lifecycle — no consumer today |
| `quote.submitted_for_approval` | finance-service | CPQ approval lifecycle — no consumer today |
| `quote.superseded` | finance-service | CPQ versioning lifecycle — no consumer today |
| `quote.version.snapshotted` | finance-service | CPQ versioning lifecycle — no consumer today |
| `quote.viewed` | finance-service | CPQ lifecycle — no consumer today |
| `record.reassigned` | crm-service | ownership-transfer telemetry |
| `records.bulk.reassigned` | crm-service | ownership-transfer telemetry |
| `rfq.deleted` | finance-service | CPQ RFQ lifecycle — no consumer today |
| `rfq.updated` | finance-service | CPQ RFQ lifecycle — no consumer today |
| `subscription.activated` | billing-service | billing lifecycle — no consumer today |
| `subscription.creation_failed` | finance-service | billing failure signal — no consumer today |
| `subscription.dunning` | billing-service | billing dunning signal — external/no consumer today |
| `subscription.past_due` | billing-service | billing dunning signal — external/no consumer today |
| `subscription.payment_retry` | billing-service | billing dunning signal — external/no consumer today |
| `subscription.renewed` | billing-service | billing lifecycle — no consumer today |
| `ticket.comment_added` | ticket-service | ticket lifecycle variant — no consumer today |
| `ticket.sla.breached` | ticket-service | ticket SLA telemetry — no consumer today |
| `whatsapp.received` | notification-service | inbound comms — handled by comm-service worker |
| `whatsapp.sent` | comm-service | outbound comms — external channel |
| `workflow.completed` | workflow-service | workflow lifecycle telemetry |

## ORPHAN subscriptions (subscribed, no in-repo publisher)

| Event type | Consumer(s) | Why allow-listed |
| --- | --- | --- |
| `activity.updated` | integration-service | published by activities CRUD mirror / crm outbox (L1) |
| `commission.paid` | analytics-service | BUG: analytics subscribes `commission.paid` but incentive emits only calculated/approved/clawback — missing publisher |
| `contact.deleted` | analytics-service | published by crm outbox CRUD mirror `${model}.deleted` (L1) |
| `content.downloaded` | crm-service | external web-tracking (outside scan) |
| `email.opened` | crm-service | external email-tracking pixel / comm-service (outside scan) |
| `email.received` | cadence-service | published by email-sync-service via `const type = inbound?…` shorthand (L2) |
| `lead.deleted` | realtime-service | published by leads outbox CRUD mirror `${model}.deleted` (L1) |
| `lead.status_changed` | analytics-service | BUG: analytics subscribes `lead.status_changed` but crm emits lead.qualified/unqualified/updated — missing publisher |
| `order.created_from_quote` | analytics-service | BUG: analytics subscribes `order.created_from_quote` but finance emits `order.created` — name mismatch |
| `order.status_changed` | analytics-service | BUG: analytics subscribes `order.status_changed` but finance emits order.created/updated/cancelled — missing publisher |
| `page.viewed` | crm-service | external web-tracking (outside scan) |
| `quote.esign.sent` | realtime-service | published by comm-service e-sign worker (outside scan) |
| `rfq.converted` | realtime-service | BUG: realtime subscribes `rfq.converted` but finance emits `rfq.converted_to_quote` — name mismatch |
| `subscription.canceled` | analytics-service | BUG: analytics subscribes `subscription.canceled` (one L) but billing emits `subscription.cancelled` (two L) — spelling mismatch |
| `subscription.updated` | analytics-service | BUG: analytics subscribes `subscription.updated` but billing emits only created/cancelled/activated/renewed/etc — no generic update publisher |

### Flagged bugs (subset of ORPHAN)

Real wiring gaps / name mismatches parked in the allow-list so CI is green today; fix and remove:

- `commission.paid` — analytics subscribes `commission.paid` but incentive emits only calculated/approved/clawback — missing publisher
- `lead.status_changed` — analytics subscribes `lead.status_changed` but crm emits lead.qualified/unqualified/updated — missing publisher
- `order.created_from_quote` — analytics subscribes `order.created_from_quote` but finance emits `order.created` — name mismatch
- `order.status_changed` — analytics subscribes `order.status_changed` but finance emits order.created/updated/cancelled — missing publisher
- `rfq.converted` — realtime subscribes `rfq.converted` but finance emits `rfq.converted_to_quote` — name mismatch
- `subscription.canceled` — analytics subscribes `subscription.canceled` (one L) but billing emits `subscription.cancelled` (two L) — spelling mismatch
- `subscription.updated` — analytics subscribes `subscription.updated` but billing emits only created/cancelled/activated/renewed/etc — no generic update publisher
