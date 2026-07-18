```markdown
# Nexus Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches the core development patterns, coding conventions, and workflows used in the Nexus TypeScript monorepo. The repository is organized into backend microservices and a frontend app, with a focus on maintainability, security, and testability. You will learn how to add or modify database schemas, API endpoints, infrastructure, permissions, health checks, UI patterns, and test coverage, following the established conventions and using suggested CLI commands for common tasks.

---

## Coding Conventions

**File Naming**
- Use `camelCase` for file names.
  - Example: `userService.ts`, `healthCheck.ts`

**Import Style**
- Use import aliases for clarity.
  - Example:
    ```typescript
    import db from '@/prisma'
    import { getUser } from '@/services/userService'
    ```

**Export Style**
- Use `default` exports for modules.
  - Example:
    ```typescript
    export default function getUser(id: string) { ... }
    ```

**Commit Messages**
- Follow [Conventional Commits](https://www.conventionalcommits.org/) with prefixes like `fix` and `feat`.
  - Example: `feat: add soft-delete to user model`

---

## Workflows

### Add or Modify Database Table or Schema
**Trigger:** When adding or changing a database table/model, enforcing multi-tenancy, adding constraints, or supporting soft-delete.  
**Command:** `/new-table`

1. Edit the relevant Prisma schema file (e.g., add model, field, or constraint).
   - Example:
     ```prisma
     model User {
       id        String   @id @default(uuid())
       email     String   @unique
       deletedAt DateTime?
     }
     ```
2. If implementing soft-delete, add a `deletedAt` column.
3. Update or create a migration SQL file if needed.
4. Update service code to use new/changed fields (e.g., filter by `deletedAt`, enforce `tenantId`).
5. Update or create service logic to handle new constraints or fields.
6. Update `.env.example` if new environment variables are needed (e.g., for encryption).
7. Test new/changed model logic.

**Files Involved:**
- `services/*/prisma/schema.prisma`
- `services/*/prisma/migrations/*/migration.sql`
- `services/*/src/services/*.ts`
- `services/*/src/prisma.ts`
- `services/*/.env.example`

---

### Add or Update API Endpoint
**Trigger:** When exposing new functionality or data via an HTTP API.  
**Command:** `/new-endpoint`

1. Create or modify the route handler file for the endpoint.
   - Example:
     ```typescript
     // services/user/src/routes/getUser.ts
     export default async function getUserHandler(req, res) { ... }
     ```
2. Register the new route in the service's router/index or API directory.
3. If permissions are needed, add `requirePermission` or guards.
4. If rate limiting is needed, add `@fastify/rate-limit`.
5. If new business logic is required, update or create service logic.
6. For frontend, create or update the corresponding API route file.
7. Add or update tests for the endpoint.

**Files Involved:**
- `services/*/src/routes/*.ts`
- `services/*/src/index.ts`
- `apps/web/src/app/api/**/*.ts`
- `services/*/src/services/*.ts`
- `services/*/src/tests/*.test.ts`

---

### Add Service to Docker Compose and Infrastructure
**Trigger:** When making a new service available in local/dev/prod environments.  
**Command:** `/add-service`

1. Add a service entry to `docker-compose.yml` with ports, dependencies, env vars, and health checks.
   - Example:
     ```yaml
     user-service:
       build: ./services/user
       ports:
         - "4001:4000"
       environment:
         - DATABASE_URL=...
       healthcheck:
         test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
         interval: 30s
         timeout: 10s
         retries: 3
     ```
2. Add a route to Kong gateway config if the service is HTTP accessible.
3. Add or update the `Dockerfile` for the service if missing.
4. Update `.env.example` with required environment variables.
5. Test service boot and health endpoint.

**Files Involved:**
- `docker-compose.yml`
- `infrastructure/kong/kong.yml`
- `services/*/Dockerfile`
- `services/*/.env.example`

---

### Enforce Permissions and Security Guards
**Trigger:** When enforcing RBAC, restricting access, or closing audit/security gaps.  
**Command:** `/add-permission-guard`

1. Add `requirePermission` or equivalent guard to route handlers.
   - Example:
     ```typescript
     import requirePermission from '@/middleware/requirePermission'
     router.get('/admin', requirePermission('admin'), handler)
     ```
2. Update or add middleware for IP restriction or rate limiting.
3. Document or update related environment variables.
4. Test access control for affected endpoints.

**Files Involved:**
- `services/*/src/routes/*.ts`
- `services/*/src/index.ts`
- `apps/web/src/app/api/**/*.ts`
- `services/*/.env.example`

---

### Add or Expand Health Checks and Monitoring
**Trigger:** When ensuring all services expose `/health` and are monitored.  
**Command:** `/add-health-check`

1. Add or fix `/health` route registration in service code.
   - Example:
     ```typescript
     router.get('/health', (req, res) => res.send({ ok: true }))
     ```
2. Add health check config to `docker-compose.yml` for the service.
3. Update monitoring config files (e.g., `alertmanager.yml`) as needed.
4. Test health endpoint and monitoring integration.

**Files Involved:**
- `services/*/src/index.ts`
- `docker-compose.yml`
- `infrastructure/prometheus/alertmanager.yml`

---

### Replace or Standardize Frontend UI Patterns
**Trigger:** When improving UX consistency or accessibility in the frontend.  
**Command:** `/replace-dialogs`

1. Create or update custom React dialog hooks/components.
   - Example:
     ```tsx
     // apps/web/src/hooks/use-confirm.tsx
     export default function useConfirm(message: string) { ... }
     ```
2. Replace all `window.alert`, `window.confirm`, and `window.prompt` calls in pages/components with new dialog usage.
3. Test all affected flows for correct dialog behavior.

**Files Involved:**
- `apps/web/src/hooks/use-confirm.tsx`
- `apps/web/src/app/**/*.tsx`
- `apps/web/src/components/**/*.tsx`

---

### Add or Expand Test Coverage for Services
**Trigger:** When increasing test coverage or adding health-check tests.  
**Command:** `/add-tests`

1. Create new test files in the service's `tests` directory.
   - Example: `services/user/src/tests/user.test.ts`
2. Write tests for health, endpoints, or business logic.
3. Register test files in workspace config if needed (e.g., `vitest.workspace.ts`).
4. Run tests and ensure they pass.

**Files Involved:**
- `services/*/src/tests/*.test.ts`
- `vitest.workspace.ts`

---

## Testing Patterns

- Use [Playwright](https://playwright.dev/) for end-to-end and integration tests.
- Test files follow the pattern: `*.test.ts`
- Place test files in `services/*/src/tests/`
- Example test file:
  ```typescript
  // services/user/src/tests/user.test.ts
  import { test, expect } from '@playwright/test'

  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get('/health')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
  ```

---

## Commands

| Command              | Purpose                                                      |
|----------------------|--------------------------------------------------------------|
| /new-table           | Add or modify a database table/model/schema                  |
| /new-endpoint        | Add or update an API endpoint                                |
| /add-service         | Register a new microservice in docker-compose/infrastructure |
| /add-permission-guard| Enforce permissions and security guards                      |
| /add-health-check    | Add or expand health checks and monitoring                   |
| /replace-dialogs     | Replace browser dialogs with custom React dialogs            |
| /add-tests           | Add or expand test coverage for services                     |
```
