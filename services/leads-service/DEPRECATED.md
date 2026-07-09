# DEPRECATED: leads-service

This standalone service is an **orphaned duplicate** of the lead functionality in
`crm-service`, which is the authoritative, frontend-wired backend for leads.

## Why it was decommissioned

- **Not on any request path.** The web BFF (`apps/web/src/app/api/leads/[[...path]]/route.ts`)
  and `apps/web/src/lib/api-client.ts` proxy leads to `crm-service:3001`, never to
  `leads-service:3030`. Its `/convert` even proxied back to crm-service.
- **No Kafka consumers.** It ran zero `NexusConsumer` subscriptions, so stopping it
  drops no event reactions. `crm-service`'s scoring consumer is the authoritative
  `TOPICS.LEADS` reactor.
- **Redundant producer.** Its `lead.*` outbox duplicated crm-service; because the live
  path never wrote to its database, that outbox never fired in production.

It has been removed from `docker-compose.yml`. The source is retained for reference
only — do **not** re-add it to the compose stack. Its one genuinely-better asset (the
rule-aware `LeadScoringRule` engine in `src/scoring.ts`) should be ported into
crm-service's scoring path if/when the lead-score consistency work is picked up.
