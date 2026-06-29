# Phase 7 - Commercial Event-First Wiring

## Goal

Make the commercial module event-first by recording durable outbox events for every commercial transition that contacts, accounts, deals, realtime projections, analytics, approvals, and audit surfaces need to consume.

## Scope

- [x] Add a commercial event helper that writes `OutboxMessage` before best-effort Kafka publish.
- [x] Add normalized commercial payload refs: quote, RFQ, order, document, signature, account, contact, deal.
- [x] Emit outbox-backed events for quote create/update/send/accept/reject/duplicate/void.
- [x] Emit outbox-backed events for DRQ create.
- [x] Emit outbox-backed events for RFQ create/send/convert.
- [x] Emit outbox-backed events for order create and quote-to-order conversion.
- [x] Emit outbox-backed events for quote document render and e-sign send/update.
- [x] Add tests asserting outbox persistence for commercial transitions.
- [x] Run finance commercial regression tests, typecheck, web typecheck, and diff check.

## Event Contract

All events use topic `nexus.finance.quotes`, include the domain event `type`, `tenantId`, and business payload, and store headers with `eventType`, `source`, `tenantId`, and `aggregateType`.

The payload carries cross-module references so downstream projections can update:

- Contact pages: `contactId`, quote/document/signature/order details.
- Account pages: `accountId`, RFQ/quote/order totals.
- Deal pages: `dealId`, commercial state.
- Realtime feeds: `eventType`, aggregate, and record ids.
