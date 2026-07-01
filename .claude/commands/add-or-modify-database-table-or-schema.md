---
name: add-or-modify-database-table-or-schema
description: Workflow command scaffold for add-or-modify-database-table-or-schema in Nexus.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-modify-database-table-or-schema

Use this workflow when working on **add-or-modify-database-table-or-schema** in `Nexus`.

## Goal

Adds a new database table/model or modifies an existing one, including constraints, soft-delete columns, or field encryption.

## Common Files

- `services/*/prisma/schema.prisma`
- `services/*/prisma/migrations/*/migration.sql`
- `services/*/src/services/*.ts`
- `services/*/src/prisma.ts`
- `services/*/.env.example`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit the relevant Prisma schema file (e.g., add model, field, or constraint).
- If soft-delete: add deletedAt column to schema.
- Update or create migration SQL file if needed.
- Update service code to use new/changed fields (e.g., filter deletedAt, enforce tenantId).
- Update or create service logic to handle new constraints or fields.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.