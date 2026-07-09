# DEPRECATED: quotes-service

This service has been merged into `finance-service` as part of Phase 0 cleanup to eliminate the dual-Quote problem.

## Migration Summary

- **DealRoom**, **MutualActionItem**, and **DealRoomDocument** models moved to `services/finance-service/prisma/schema.prisma`
- **Deal-room REST endpoints** moved to `services/finance-service/src/routes/deal-rooms.routes.ts`
- **quotes-service** removed from `docker-compose.yml`

## Status

- Do NOT deploy this service as a standalone unit.
- This folder is preserved for git history only.
- All new quote/deal-room work should happen in `services/finance-service/`.

## Date of Deprecation

2026-05-17
