# accounts-service — DECOMMISSIONED

Orphaned duplicate of **crm-service**, which is the wired authority for accounts
(web BFF → `CRM_SERVICE_URL`). Ran a split-brain outbox/consumer that duplicated
crm-service. Removed 2026-07-07 to end the split-brain. Its docker-compose block
and source were deleted; the `nexus_accounts` database is left empty and unused.

All accounts logic lives in `services/crm-service`.
