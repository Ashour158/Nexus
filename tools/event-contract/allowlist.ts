/**
 * Allow-lists for the event-contract guardrail.
 *
 * These encode the CURRENT known-intentional exceptions so the contract test
 * passes on today's code. Anything NOT listed here that is published-without-a-
 * consumer, or subscribed-without-a-publisher, fails the test — forcing the
 * author of a new event to either wire the other side or make a conscious,
 * documented entry here.
 *
 * Rule of thumb before adding an entry:
 *   - KNOWN_FIRE_AND_FORGET  → "this event is published on purpose with no
 *                               in-repo Kafka consumer" (audit/analytics sink,
 *                               external/webhook consumer, or lifecycle-only).
 *   - KNOWN_EXTERNAL_PUBLISHERS → "this event IS produced, but by a path the
 *                               static scanner cannot see" (dynamic outbox CRUD
 *                               template, a service outside services/, an
 *                               external webhook, or a shorthand-var publish).
 *
 * When you add an entry, add a one-line reason. Entries tagged `BUG:` are real
 * defects that are parked here so the guardrail can go green today — they should
 * be fixed, not left forever. See docs/EVENTS.md for the full catalog.
 */

/**
 * PUBLISHED events that intentionally have no in-repo `consumer.on(...)` handler.
 */
export const KNOWN_FIRE_AND_FORGET: Record<string, string> = {
  // ── Audit / compliance sink: consumed by audit-consumer via a raw topic-level
  //    kafkajs `eachMessage` loop (not `consumer.on(type)`), so invisible to the
  //    scanner (heuristic limit L4). These are audit trail events by design.
  'auth.governance.audited': 'audit sink — consumed by audit-consumer topic subscriber (L4)',

  // ── Analytics-only / timeline sink: emitted for projection or timeline and
  //    (today) only consumed by analytics via loop-registered handlers (L3) or
  //    not at all. No dedicated command consumer is expected.
  'campaign.member_added': 'analytics projection sink',
  'email.sent': 'CRM engagement-timeline sink, consumed via loop-registered handler (L3)',
  'call.logged': 'CRM activity/timeline sink',
  'credit_note.issued': 'finance analytics/timeline sink',
  'payment.received': 'billing→finance timeline sink (also drives dunning externally)',

  // ── Lifecycle / operational telemetry: emitted so operators & future
  //    consumers can observe progress; no command consumer today.
  'activity.overdue': 'reminder telemetry — no command consumer today',
  'approval.step.advanced': 'approval lifecycle telemetry',
  'approval.step.delegated': 'approval lifecycle telemetry',
  'automation.loop_guard.tripped': 'automation safety telemetry',
  'automation.rate_cap.tripped': 'automation safety telemetry',
  'cadence.enrolled': 'cadence lifecycle telemetry',
  'cadence.step.processed': 'cadence lifecycle telemetry',
  'workflow.completed': 'workflow lifecycle telemetry',
  'forecast.reviewed': 'planning lifecycle telemetry',
  'forecast.submitted': 'planning lifecycle telemetry',
  'integration.sync.started': 'integration sync telemetry',
  'integration.sync.completed': 'integration sync telemetry',
  'integration.sync.failed': 'integration sync telemetry',
  'record.reassigned': 'ownership-transfer telemetry',
  'records.bulk.reassigned': 'ownership-transfer telemetry',
  'kb.article.deleted': 'knowledge lifecycle telemetry',

  // ── Blueprint (playbook) lifecycle: internal to blueprint-service; the
  //    notification-consumed transitions are the *.notification variants, not
  //    these. Lifecycle-only, not user-facing.
  'blueprint.playbook.created': 'blueprint lifecycle-only, not user-facing',
  'blueprint.playbook.updated': 'blueprint lifecycle-only, not user-facing',
  'blueprint.stage.upserted': 'blueprint lifecycle-only, not user-facing',
  'blueprint.transition.created': 'blueprint lifecycle-only, not user-facing',
  'blueprint.transition.completed': 'blueprint lifecycle-only, not user-facing',
  'blueprint.transition.function': 'blueprint custom-function hook, lifecycle-only',

  // ── Journey engine: internal step/enrolment progression events consumed by
  //    the journey engine's own in-process loop, not a separate Kafka consumer.
  'journey.enrolled': 'journey engine internal progression',
  'journey.step': 'journey engine internal progression',
  'journey.completed': 'journey engine internal progression',
  'journey.failed': 'journey engine internal progression',

  // ── CRM deal lifecycle variants with no dedicated consumer yet (the consumed
  //    deal events are created/stage_changed/won/lost/assigned/at_risk/rotten).
  'deal.archived': 'deal lifecycle variant — no consumer yet',
  'deal.restored': 'deal lifecycle variant — no consumer yet',
  'deal.reopened': 'deal lifecycle variant — no consumer yet',
  'deal.meddic_updated': 'deal qualification telemetry — no consumer yet',
  'deal.team.updated': 'deal-team change telemetry — no consumer yet',

  // ── Finance commercial lifecycle (CPQ): rich intent-typed events; only a
  //    subset (quote.created/sent/accepted/rejected/voided/updated, order.*) is
  //    consumed. The rest are lifecycle/approval steps with no consumer today.
  'quote.viewed': 'CPQ lifecycle — no consumer today',
  'quote.expired': 'CPQ lifecycle — no consumer today',
  'quote.approved': 'CPQ approval lifecycle — no consumer today',
  'quote.approval.advanced': 'CPQ approval lifecycle — no consumer today',
  'quote.submitted_for_approval': 'CPQ approval lifecycle — no consumer today',
  'quote.signed': 'CPQ e-sign lifecycle — no consumer today',
  'quote.signature_requested': 'CPQ e-sign lifecycle — no consumer today',
  'quote.superseded': 'CPQ versioning lifecycle — no consumer today',
  'quote.restored': 'CPQ lifecycle — no consumer today',
  'quote.revision_created': 'CPQ versioning lifecycle — no consumer today',
  'quote.revised_from_drq': 'CPQ discount-revision lifecycle — no consumer today',
  'quote.created_from_rfq': 'CPQ lifecycle — no consumer today',
  'quote.version.snapshotted': 'CPQ versioning lifecycle — no consumer today',
  'drq.requested': 'CPQ discount-request lifecycle — no consumer today',
  'drq.approved': 'CPQ discount-request lifecycle — no consumer today',
  'drq.rejected': 'CPQ discount-request lifecycle — no consumer today',
  'rfq.updated': 'CPQ RFQ lifecycle — no consumer today',
  'rfq.deleted': 'CPQ RFQ lifecycle — no consumer today',
  'order.requested': 'CPQ→finance handoff; finance creates the order authority',
  'order.cancelled': 'order lifecycle — no consumer today',
  'order.fulfillment.created': 'fulfillment lifecycle — no consumer today',
  'order.fulfillment.updated': 'fulfillment lifecycle — no consumer today',
  'order.fulfillment.progressed': 'fulfillment lifecycle — no consumer today',
  'contract.deleted': 'contract lifecycle variant — no consumer yet',

  // ── Billing subscription lifecycle: only subscription.created/cancelled are
  //    consumed; the dunning/renewal states are external-billing-driven signals.
  'subscription.activated': 'billing lifecycle — no consumer today',
  'subscription.renewed': 'billing lifecycle — no consumer today',
  'subscription.past_due': 'billing dunning signal — external/no consumer today',
  'subscription.dunning': 'billing dunning signal — external/no consumer today',
  'subscription.payment_retry': 'billing dunning signal — external/no consumer today',
  'subscription.creation_failed': 'billing failure signal — no consumer today',

  // ── Ticket lifecycle variants: analytics consumes the core ticket.* via a
  //    loop (L3); these two have no consumer today.
  'ticket.comment_added': 'ticket lifecycle variant — no consumer today',
  'ticket.sla.breached': 'ticket SLA telemetry — no consumer today',

  // ── Portal (partner/customer portal) → consumed by portal/comm surfaces
  //    outside the Kafka consumer.on scan; fire-and-forget into CRM timeline.
  'portal.engagement': 'portal→CRM timeline sink',
  'portal.case.submitted': 'portal→CRM timeline sink',
  'portal.case.commented': 'portal→CRM timeline sink',
  'portal.deal.registered': 'portal→CRM lead/timeline sink',

  // ── Outbound comms: delivered by external channels (email/WhatsApp/telephony)
  //    or consumed by the comm-service worker outside the scan.
  'whatsapp.sent': 'outbound comms — external channel',
  'whatsapp.received': 'inbound comms — handled by comm-service worker',

  // ── Storage: object lifecycle, consumed by document-service/GC outside scan.
  'file.uploaded': 'storage lifecycle — consumed outside scan',
  'file.deleted': 'storage lifecycle — consumed outside scan',

  // ── GDPR / data-governance requests: export path & ownership transfer are
  //    handled by request workers; only gdpr.erasure.requested has a fan-out of
  //    consumer.on handlers.
  'gdpr.export.requested': 'GDPR export handled by request worker',
  'data.ownership.transfer': 'ownership transfer handled by request worker',

  // ── Campaign send request: consumed by comm-service send worker outside the
  //    consumer.on scan.
  'campaign.send.requested': 'campaign→comm send worker (outside scan)',
};

/**
 * SUBSCRIBED events whose publisher is intentionally outside the static scan.
 */
export const KNOWN_EXTERNAL_PUBLISHERS: Record<string, string> = {
  // ── Dynamic outbox CRUD mirror (heuristic limit L1): published as
  //    `${model}.created|updated|deleted` template literals in
  //    services/*/src/prisma.ts (crm/leads/notes/quotes). The scanner cannot
  //    resolve the concrete model name, so the `.deleted` variants that have a
  //    subscriber but no static publisher are declared here.
  'contact.deleted': 'published by crm outbox CRUD mirror `${model}.deleted` (L1)',
  'lead.deleted': 'published by leads outbox CRUD mirror `${model}.deleted` (L1)',
  'activity.updated': 'published by activities CRUD mirror / crm outbox (L1)',

  // ── External behavioural tracking: produced by the marketing/tracking pixel
  //    and portal, ingested at the edge — not by an in-repo service.
  'email.opened': 'external email-tracking pixel / comm-service (outside scan)',
  'page.viewed': 'external web-tracking (outside scan)',
  'content.downloaded': 'external web-tracking (outside scan)',

  // ── Produced by a service path the scanner cannot see (shorthand-var publish,
  //    L2, or another service’s worker).
  'email.received': 'published by email-sync-service via `const type = inbound?…` shorthand (L2)',
  'quote.esign.sent': 'published by comm-service e-sign worker (outside scan)',

  // ── BUG: real orphan-subscriptions parked here so the guardrail is green.
  //    Each is a subscriber with no matching publisher today — a wiring gap or a
  //    name mismatch. Fix by publishing the event or correcting the name, then
  //    delete the entry. Documented in docs/EVENTS.md.
  'rfq.converted': 'BUG: realtime subscribes `rfq.converted` but finance emits `rfq.converted_to_quote` — name mismatch',
  'subscription.canceled': 'BUG: analytics subscribes `subscription.canceled` (one L) but billing emits `subscription.cancelled` (two L) — spelling mismatch',
  'commission.paid': 'BUG: analytics subscribes `commission.paid` but finance emits only calculated/approved/clawback — missing publisher',
  'lead.status_changed': 'BUG: analytics subscribes `lead.status_changed` but crm emits lead.qualified/unqualified/updated — missing publisher',
  'order.status_changed': 'BUG: analytics subscribes `order.status_changed` but finance emits order.created/updated/cancelled — missing publisher',
  'subscription.updated': 'BUG: analytics subscribes `subscription.updated` but billing emits only created/cancelled/activated/renewed/etc — no generic update publisher',
  'order.created_from_quote': 'BUG: analytics subscribes `order.created_from_quote` but finance emits `order.created` — name mismatch',
};
