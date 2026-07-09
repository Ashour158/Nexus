# CRM Platform Foundations — Implementation Plan

## Current State Summary

- **metadata-service**: Has CustomField, Tag, ValidationRule, DuplicateGroup models. No coding engine. Outbox table exists but events are not emitted.
- **accounts-service**: Account model has basic fields (`name`, `type`, `tier`, `status`, `country`, `city`, `address`, `zipCode`). No `code`, no separate billing/shipping addresses, no deep commercial fields.
- **contacts-service**: Contact `accountId` is optional (`String?`). Has its own duplicate Account model. No lead conversion logic.
- **quotes-service**: `quoteNumber` hardcoded as `Q-${Date.now()}` with no collision handling.
- **document-service**: Has Puppeteer PDF rendering and HTML templates, but no DOCX generation, no template storage/CRUD, no merge-field engine.
- **data-service**: CSV import/export exists but posts rows directly to CRM service with no module registry, field mapping backend, or validation preview.
- **shared-types / validation**: Central type/schema packages. Address fields are duplicated inline across entities; no reusable Address schema.

## Phase Breakdown

### Phase 1 — Shared Foundation (types, validation, preview data)
**Goal**: Establish contracts before touching services.

1. **Add reusable address schemas to `@nexus/validation`**
   - `AddressSchema` (line1, line2, city, state, postalCode, country, lat, lng)
   - `BillingAddressSchema`, `ShippingAddressSchema` (extends AddressSchema + `sameAsBilling`)
   - Export inferred types.

2. **Expand `@nexus/shared-types` Account type**
   - Add `code`, `legalName`, `tradeName`, `billingAddress`, `shippingAddress`, `taxId`, `vatNumber`, `commercialRegistrationNumber`, `paymentTerms`, `creditLimit`, `currency`, `priceBookId`, `lifecycleStage`, `subIndustry`, `sicCode`, `naicsCode`, `employeeCount`, `foundedYear`, `healthScore`, `npsScore`, `riskLevel`, `lastActivityAt`, `parentAccountId`, `territoryId`, `website`, `fax`, `linkedinUrl`.
   - Keep backward-compatible: existing fields stay.

3. **Add coding system types to `@nexus/shared-types`**
   - `CodingRule`, `CodingRuleVersion`, `CodingSequence`, `CodingAllocationLog` wire types.
   - `CodeTokenType` union for pattern tokens.

4. **Add document template types to `@nexus/shared-types`**
   - `DocumentTemplate`, `DocumentTemplateVersion`, `RenderedDocument` wire types.

5. **Add import/export registry types to `@nexus/shared-types`**
   - `ImportJob`, `ExportJob`, `ModuleRegistryEntry`, `FieldMapping`.

6. **Add validation schemas to `@nexus/validation`**
   - `CreateCodingRuleSchema`, `UpdateCodingRuleSchema`, `PreviewCodingRuleSchema`
   - `CreateDocumentTemplateSchema`, `UpdateDocumentTemplateSchema`, `RenderTemplateSchema`
   - `ImportPreviewSchema`, `ImportRunSchema`, `ExportRequestSchema`
   - Make `CreateContactSchema.accountId` required.
   - Expand `CreateAccountSchema` / `UpdateAccountSchema` with deep fields.

7. **Update local preview data (`apps/web/src/lib/server/dev-preview-data.ts`)**
   - Add `code` to all preview entities.
   - Ensure contacts have `accountId`.
   - Add deep account fields to preview accounts.

### Phase 2 — Coding Engine (metadata-service)
**Goal**: Tenant-scoped configurable record coding with atomic allocation.

1. **Prisma migration** (`metadata-service`)
   - Add `CodingRule`, `CodingRuleVersion`, `CodingSequence`, `CodingAllocationLog` models.

2. **Coding service** (`src/services/coding.service.ts`)
   - Pattern parser: tokenize `{PREFIX}`, `{YYYY}`, `{YY}`, `{MM}`, `{DD}`, `{Q}`, `{TERRITORY}`, `{BRANCH}`, `{DEPT}`, `{OWNER_INITIALS}`, `{SEQ:N}`, `{CATEGORY}`, static text.
   - Sequence allocator: atomic increment with Prisma `$transaction` + `UPDATE ... SET nextValue = nextValue + 1`.
   - Scope resolver: tenant, module, year, month, territory, branch, team, category.
   - Reset policy: never, yearly, monthly, daily.
   - Fallback strategy for missing context.
   - Preview generator for admin UI.

3. **REST routes** (`src/routes/coding.routes.ts`)
   - `GET /api/v1/coding-rules?entityType=` — list
   - `POST /api/v1/coding-rules` — create
   - `GET /api/v1/coding-rules/:id` — get
   - `PATCH /api/v1/coding-rules/:id` — update
   - `POST /api/v1/coding-rules/:id/preview` — preview with sample inputs
   - `POST /api/v1/coding-rules/:id/activate` — set effective version
   - `POST /internal/codes/:entityType/allocate` — internal allocation (no auth, service token)

4. **GraphQL additions**
   - Add CodingRule, CodingRuleVersion, CodingSequence, CodingAllocationLog to schema and resolvers.

5. **Tests**
   - Pattern parser unit tests.
   - Concurrent allocation test (same tenant/entity).
   - Route tests for CRUD + preview + activate.

### Phase 3 — Deep Account Model + Contact Account Requirement
**Goal**: Enrich accounts and make contacts account-dependent.

1. **accounts-service Prisma migration**
   - Add all deep fields: `code`, `legalName`, `tradeName`, `billingAddressLine1/2`, `billingCity`, `billingState`, `billingPostalCode`, `billingCountry`, `billingLat`, `billingLng`, `shippingAddressLine1/2`, `shippingCity`, `shippingState`, `shippingPostalCode`, `shippingCountry`, `shippingLat`, `shippingLng`, `shippingInstructions`, `sameAsBilling`, `taxId`, `vatNumber`, `commercialRegistrationNumber`, `paymentTerms`, `creditLimit`, `currency`, `priceBookId`, `lifecycleStage`, `subIndustry`, `foundedYear`, `riskLevel`, `lastActivityAt`, `website`, `fax`, `linkedinUrl`.
   - Make `code` unique per `tenantId`.

2. **accounts-service routes/service updates**
   - Update create handler to call coding engine (`POST metadata-service /internal/codes/account/allocate`) before persist.
   - Update update handler to allow address fields.
   - Add `GET /accounts/:id/contacts` (or keep in contacts-service — prefer contacts-service as source of truth for contacts).

3. **contacts-service Prisma migration**
   - Make `accountId` non-nullable (`String` instead of `String?`).
   - Add migration note: existing nulls → link to "Unassigned Contacts" holding account.

4. **contacts-service service updates**
   - Reject create if `accountId` missing → `400 CONTACT_ACCOUNT_REQUIRED`.
   - On create, call coding engine for `contact` code.
   - On update, allow moving contact to another account.

5. **contacts-service holding account migration**
   - Add script/endpoint to create per-tenant "Unassigned Contacts" account and link orphan contacts.

6. **Update shared `@nexus/validation` `CreateContactSchema`**
   - `accountId: z.string().cuid()` (required).

7. **Tests**
   - Account schema validation tests.
   - Contact create rejection without account.
   - Contact code allocation on create.

### Phase 4 — Quote + Other Services Integrate Coding Engine
**Goal**: All coded modules get automatic codes on create.

1. **quotes-service**
   - Replace `Q-${Date.now()}` with call to coding engine `POST /internal/codes/quote/allocate`.
   - Add `code` field to Quote Prisma schema (or use existing `quoteNumber` as the code field).

2. **deals-service / crm-service**
   - Call coding engine for `deal` on create.

3. **leads-service**
   - Call coding engine for `lead` on create.

4. **products** (finance-service)
   - Call coding engine for `product` on create.

5. **activities** (activities-service or crm-service)
   - Call coding engine for `activity` on create.

6. **documents** (document-service)
   - Call coding engine for `document` on create.

*Note: For services without a dedicated service (e.g., leads, activities, documents), the coding call can be added via the CRM-service gateway or directly in the respective service if it exists. Given time constraints, we will focus on accounts, contacts, quotes, and deals first, then provide the wiring pattern for others.*

### Phase 5 — Document Template Engine
**Goal**: Store templates, render quotes to DOCX/PDF.

1. **document-service Prisma migration**
   - Add `DocumentTemplate`, `DocumentTemplateVersion`, `RenderedDocument` models.

2. **Add DOCX generation**
   - Install `docx` npm package.
   - Create `src/services/docx.service.ts` to build DOCX from JSON tree.

3. **Template service** (`src/services/template.service.ts`)
   - CRUD for templates.
   - Merge field resolver: map `{{quote.quoteNumber}}`, `{{account.name}}`, etc. to actual data.
   - Line-item block expansion for quote products.

4. **REST routes** (`src/routes/templates.routes.ts`)
   - `GET /api/v1/templates?module=` — list
   - `POST /api/v1/templates` — create
   - `GET /api/v1/templates/:id` — get
   - `PATCH /api/v1/templates/:id` — update
   - `POST /api/v1/templates/:id/render` — render with data payload
   - `POST /api/v1/templates/:id/export/:format` — export `docx` or `pdf`

5. **Quote-specific integration**
   - `POST /api/v1/documents/quotes/:quoteId/render` — fetches quote, merges with selected template, returns preview.
   - `POST /api/v1/documents/quotes/:quoteId/export/:format` — generates file, stores via storage-service, returns download URL.

6. **Tests**
   - Template render unit tests.
   - DOCX generation smoke test.

### Phase 6 — Universal Import/Export (data-service)
**Goal**: Module registry, field mapping, validation preview.

1. **Module registry** (`src/services/module-registry.service.ts`)
   - Static registry of supported modules with field definitions (name, type, required, module source URL).
   - Modules: accounts, contacts, leads, deals, products, quotes, activities, documents, notes.

2. **Expand import service**
   - Validation preview endpoint: `POST /api/v1/import/:module/preview` — parse CSV, map fields, validate first N rows, return errors without creating.
   - Enforce account requirement for contacts during validation.
   - Duplicate detection strategy: skip, update, create, merge.
   - Row-level error report.

3. **Expand export service**
   - Support XLSX via `xlsx` package.
   - Export selected rows (by ID list).
   - Export visible columns or all columns.
   - Respect RBAC by calling services with caller's auth token.

4. **REST routes**
   - `POST /api/v1/import/:module/preview` — preview
   - `POST /api/v1/import/:module/validate` — full validation (dry run)
   - Update `POST /api/v1/export/:module` to accept `format` (csv/xlsx), `columns`, `selectedIds`.

5. **Tests**
   - Import preview validation tests.
   - Export filtered view tests.

### Phase 7 — Web UI Updates
**Goal**: Admin settings, account/contact forms, quote export actions.

1. **Settings layout additions**
   - Add `/settings/coding-rules` to settings nav.
   - Add `/settings/document-templates` to settings nav.
   - Add `/settings/import-export` to settings nav.

2. **Coding rules admin page** (`/settings/coding-rules`)
   - List rules per module.
   - Create/edit rule with pattern builder (token buttons).
   - Live preview with sample inputs.
   - Activate/deactivate rules.

3. **Document templates admin page** (`/settings/document-templates`)
   - List templates.
   - Create/edit template with merge field picker.
   - Preview render.

4. **Account UI updates**
   - Account list: show `code` column.
   - Account create/edit form: separate billing/shipping addresses, copy-billing-to-shipping toggle, deep commercial fields.
   - Account detail: sections for Overview, Contacts, Deals, Quotes, Documents, Activities, Addresses, Commercial, Compliance, History.

5. **Contact UI updates**
   - Contact create form: require account selection (dropdown/search).
   - Contact detail: show linked account prominently.

6. **Quote UI updates**
   - Quote detail: add "Export" action with template selector + DOCX/PDF format.
   - Quote list: show `code` / `quoteNumber`.

7. **Import/Export UI**
   - `/import` page: upload CSV/XLSX, field mapping drag-drop, preview first rows, run import.
   - List view export button: export filtered/selected/all, format picker.

### Phase 8 — Local Preview & Smoke Tests
**Goal**: App works on localhost:3000 without all backends running.

1. **Update dev-preview-data.ts**
   - Ensure all coded entities have realistic codes.
   - Ensure all contacts have accountIds.
   - Add deep account data.

2. **Add preview API routes** (Next.js API routes in `apps/web/src/app/api/...`)
   - `POST /api/preview/codes/:entityType/allocate` — returns deterministic preview code.
   - `GET /api/preview/coding-rules` — returns mock rules.
   - `POST /api/preview/templates/:id/render` — returns HTML preview.
   - `POST /api/preview/import/:module/preview` — returns mock validation.

3. **Smoke test**
   - `pnpm typecheck` — all packages.
   - `pnpm lint` — all packages.
   - `pnpm --filter @nexus/web test` — must pass.
   - `pnpm --filter @nexus/metadata-service test` — must pass.
   - `pnpm --filter @nexus/accounts-service test` — must pass.
   - `pnpm --filter @nexus/contacts-service test` — must pass.
   - `pnpm --filter @nexus/document-service test` — must pass.
   - `pnpm --filter @nexus/data-service test` — must pass.
   - Browser: navigate to `http://localhost:3000`, verify dashboard loads, accounts list shows codes, contact create requires account.

## Risk Mitigation

- **Schema migrations**: Add fields as nullable first where possible, then backfill. Use Prisma migrations with `prisma migrate dev`.
- **Concurrent code allocation**: Use Prisma `$transaction` with `isolationLevel: 'Serializable'` or atomic `UPDATE ... SET nextValue = nextValue + 1 WHERE ...`.
- **Contact account requirement breaking change**: Provide a migration endpoint/script to move orphan contacts to "Unassigned Contacts" holding account before deploying the non-nullable constraint.
- **Service dependencies**: Coding engine is a new dependency for many services. If metadata-service is down, services should gracefully fallback to a default code or queue for retry. For Phase 1, we will make the coding call best-effort with a fallback timestamp-based code.
- **Backward compatibility**: Existing `quoteNumber` field kept; new `code` field added alongside it. Admin can configure whether `code` replaces `quoteNumber` in UI.
