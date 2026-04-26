# Prompt 12 — Complete 10 Truncated Service Entry Points (Surgical Appends)

## Context

NEXUS CRM — `services/` directory, Fastify 4, `startService` from `@nexus/service-utils`.
**Do NOT rewrite these files.** Each service has real route registrations that must be
preserved. The only problem is that each file is truncated — it ends before the closing
`startService(...)` call. This prompt **appends the missing lines** to the end of each file.

For each service below:
1. Open the file
2. **Read the current last line** — use it to confirm you are editing the right file
3. **Append exactly the text shown** to the end of the file (do NOT replace anything)

All services use `startService` from `@nexus/service-utils`. If it is not already in the
import statement, add it: change `import { globalErrorHandler } from '@nexus/service-utils'`
to `import { globalErrorHandler, startService } from '@nexus/service-utils'`.

---

## SERVICE 1 — `services/cadence-service/src/index.ts`

Current last line (56): `await consumer.start().catch(`

**Step 1** — Fix the import (add `startService`):
```
import { globalErrorHandler } from '@nexus/service-utils';
→
import { globalErrorHandler, startService } from '@nexus/service-utils';
```

**Step 2** — Append to end of file:
```typescript
() => undefined);

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
  try { await consumer.stop(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3018', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});
```

---

## SERVICE 2 — `services/territory-service/src/index.ts`

Current last line (49): `      body: JSON.stringify({ ownerId: assigned.assignedOwnerId`

**Step 1** — Fix the import (add `startService`).

**Step 2** — Append to end of file:
```typescript
        }),
      },
    });
  }
});

await consumer.start().catch(() => undefined);

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
  try { await consumer.stop(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3019', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});
```

---

## SERVICE 3 — `services/planning-service/src/index.ts`

Current last line (39): `await regi`

**Step 1** — Fix the import (add `startService`).

**Step 2** — Append to end of file:
```typescript
sterQuotasRoutes(app, createQuotasService(prisma, producer));
await registerForecastsRoutes(app, createForecastsService(prisma, producer));

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3020', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});
```

---

## SERVICE 4 — `services/knowledge-service/src/index.ts`

Current last line (25): `    await r`

**Step 1** — Fix the import (add `startService`).

**Step 2** — Append to end of file:
```typescript
equest.jwtVerify();
  } catch {
    return reply.code(401).send({ success: false, error: 'Unauthorized' });
  }
});

const knowledgeSvc = createKnowledgeService(prisma);
await registerKnowledgeRoutes(app, knowledgeSvc);

const port = parseInt(process.env.PORT ?? '3023', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});
```

---

## SERVICE 5 — `services/incentive-service/src/index.ts`

Current last line (50): `    'DEAL`

**Step 1** — Fix the import (add `startService`).

**Step 2** — Append to end of file:
```typescript
_VALUE', Number(payload.amount ?? 0));
});

await consumer.start().catch(() => undefined);

app.addHook('onClose', async () => {
  try { await consumer.stop(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3024', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});
```

---

## SERVICE 6 — `services/portal-service/src/index.ts`

Current last line (20): `    error: 'RATE_LIMIT_EXCEEDED',`

**Step 1** — Fix the import (add `startService`).

**Step 2** — Append to end of file:
```typescript
    message: `Too many requests. Retry after ${context.after}.`,
  }),
});
app.setErrorHandler(globalErrorHandler);

app.addHook('onRequest', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ success: false, error: 'Unauthorized' });
  }
});

const portalSvc = createPortalService(prisma);
await registerPortalRoutes(app, portalSvc);

const port = parseInt(process.env.PORT ?? '3022', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});
```

---

## SERVICE 7 — `services/document-service/src/index.ts`

Current last line (18): `app.setErrorHandler(globalE`

**Step 1** — Fix the import (add `startService`).

**Step 2** — Append to end of file:
```typescript
rrorHandler);

app.addHook('onRequest', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ success: false, error: 'Unauthorized' });
  }
});

await registerDocumentsRoutes(app);

const port = parseInt(process.env.PORT ?? '3016', 10);
await startService(app, port, async () => { /* no prisma here */ });
```

---

## SERVICE 8 — `services/chatbot-service/src/index.ts`

Current last line (16): `   `  (indented space — mid-rateLimit block)

**Step 1** — Fix the import (add `startService`).

**Step 2** — Append to end of file:
```typescript
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests. Retry after ${context.after}.`,
  }),
});
app.setErrorHandler(globalErrorHandler);

await registerWhatsAppRoutes(app, prisma);
await registerTelegramRoutes(app, prisma);

const port = parseInt(process.env.PORT ?? '3017', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});
```

---

## SERVICE 9 — `services/approval-service/src/index.ts`

Current last line (29): `    await request.jwtVerify();`  (mid-hook try block, no closing `}`)

**Step 1** — Fix the import (add `startService`).

**Step 2** — Append to end of file:
```typescript
  } catch {
    return reply.code(401).send({ success: false, error: 'Unauthorized' });
  }
});

await registerPoliciesRoutes(app, prisma, producer);
await registerRequestsRoutes(app, prisma, producer);

await producer.connect().catch(() => undefined);
app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3014', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});
```

---

## SERVICE 10 — `services/data-service/src/index.ts`

Current last line (37): `await registerImport`

**Step 1** — Fix the import (add `startService`).

**Step 2** — Append to end of file:
```typescript
Routes(app, prisma, producer);
await registerExportRoutes(app, prisma);
await registerRecycleRoutes(app, prisma);
await registerAuditRoutes(app, prisma);
await registerViewsRoutes(app, prisma);

await producer.connect().catch(() => undefined);
app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
});

const port = parseInt(process.env.PORT ?? '3015', 10);
await startService(app, port, async () => {
  await prisma.$disconnect();
});
```

---

## Verification

After completing all 10 appends, run:

```bash
echo "=== Listen / startService check ==="
for svc in cadence territory planning knowledge incentive portal document chatbot approval data; do
  tail -6 services/${svc}-service/src/index.ts | grep -q "startService\|app.listen" \
    && echo "✅ ${svc}" || echo "❌ ${svc} — STILL MISSING"
done

echo ""
echo "=== Line counts (sanity check — all should be > original) ==="
for svc in cadence territory planning knowledge incentive portal document chatbot approval data; do
  wc -l services/${svc}-service/src/index.ts | awk "{print \"  ${svc}: \" \$1 \" lines\"}"
done

echo ""
echo "=== TypeScript check ==="
pnpm --filter @nexus/cadence-service typecheck 2>&1 | tail -5
pnpm --filter @nexus/data-service typecheck 2>&1 | tail -5
```

### Expected Results

| Service | startService ✅ | Min Lines |
|---|---|---|
| cadence-service | ✅ | > 56 |
| territory-service | ✅ | > 49 |
| planning-service | ✅ | > 39 |
| knowledge-service | ✅ | > 25 |
| incentive-service | ✅ | > 50 |
| portal-service | ✅ | > 20 |
| document-service | ✅ | > 18 |
| chatbot-service | ✅ | > 16 |
| approval-service | ✅ | > 29 |
| data-service | ✅ | > 37 |

---

## Important Notes for Cursor

- **Append only** — do not delete or rearrange any existing lines
- **Match continuation carefully** — each append block is designed to continue exactly
  where the truncation cut off (the first token of each append matches the last partial
  token at end of the truncated file)
- **If a route function signature doesn't match** (e.g. `registerPoliciesRoutes` takes
  different args than shown), use whatever args the existing service layer already uses —
  the exact args are less important than getting the `startService` call at the end
- **Do not create new route files** — only complete the `index.ts` entry points
