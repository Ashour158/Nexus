# DEPRECATED: deals-service

This standalone service is an **orphaned duplicate** of the deal functionality in
`crm-service`, which is the authoritative, frontend-wired backend for deals.

## Why it was decommissioned

- **Deal CRUD not on any request path.** The web BFF (`apps/web/src/app/api/deals/[[...path]]/route.ts`)
  and `apps/web/src/lib/api-client.ts` proxy deals to `crm-service:3001`. This service's
  deal CRUD, forecast, and stage-gating were dead code.
- **Redundant producer.** Its `deal.rotten` poller duplicated crm-service's own
  (`crm-service/src/lib/rotten-deals.poller.ts`).
- **Its one live feature was migrated out.** It uniquely owned the `TOPICS.QUOTES`
  quote-projection read-model (consumer group `deals-service.quote-projections`) that
  backed the deal-detail **Quotes tab**. That was moved into crm-service:
  - `QuoteProjection` / `QuoteProjectionEvent` models
  - consumer group `crm-service.quote-projections`
  - `GET /api/v1/deals/:id/quotes` (served from the local read-model)
  and both the crm route and the web BFF were repointed to crm-service.

It has been removed from `docker-compose.yml` and the Kong routes. The source is
retained for reference only — do **not** re-add it to the compose stack.

## Backfill note

The new `crm-service.quote-projections` consumer group starts empty and rebuilds the
read-model as new `TOPICS.QUOTES` events arrive. Historical projection rows that lived
in the deals-service database were **not** copied. If a production deployment has
existing quotes that will emit no further lifecycle events, run a one-time backfill
(replay `TOPICS.QUOTES` into the new group, or copy `QuoteProjection` rows across)
before relying on the crm-service projection for historical data.
