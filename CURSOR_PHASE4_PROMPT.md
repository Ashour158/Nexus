# NEXUS CRM — Phase 4 Build Prompt
## Paste this entire file as your first Cursor message

---

## AUDIT FINDINGS — READ THIS FIRST

Phase 3 delivered: **~29,700 LOC**, 8 services, 60 frontend files, 5 test suites, zero stubs.

**One critical gap slipped through:** The `/deals/[id]/` directory was created but `page.tsx` is completely empty. This is the most important page in the entire frontend — users can see the pipeline board but cannot click into any deal. **This is File 1 and must be done before anything else.**

**Everything else confirmed:**
- `apps/web/src/lib/socket.ts` ✅ (singleton Socket.io client exists)
- `use-realtime.ts` ✅, `use-notes.ts` ✅, `use-quotes.ts` ✅, `use-analytics.ts` ✅
- All 4 Phase 3 services are zero-stub ✅
- 5 Vitest test suites passing ✅
- 6 services not yet started: ai-service, comm-service, storage-service, billing-service, integration-service, blueprint-service

---

## DO NOT REWRITE (complete, confirmed)

```
All packages (shared-types, validation, kafka, service-utils)
services/auth-service/         — complete
services/crm-service/          — complete (deals, accounts, contacts, leads, pipelines, activities, notes)
services/finance-service/      — complete (products, invoices, contracts, quotes, commission, cpq)
services/notification-service/ — complete
services/realtime-service/     — complete
services/search-service/       — complete
services/workflow-service/     — complete
services/analytics-service/    — complete
apps/web/src/ (all pages except deals/[id]/page.tsx)
docker-compose.yml + Dockerfiles + init.sql
```

---

## CODE PATTERNS (unchanged)

- Services: `createXxxService(prisma, producer)` factory
- Routes: `registerXxxRoutes(app, prisma, producer)` under `/api/v1`
- `tenantId` in EVERY DB where clause
- `version: { increment: 1 }` on every mutation of versioned models
- `Zod.safeParse` on every request body/query
- `const jwt = request.user as JwtPayload`
- Money: `decimal.js` only
- Zero stubs, zero TODOs, zero `any`

---

## FILE ORDER (top to bottom, no skipping)

---

### FILE 1 — `apps/web/src/app/(dashboard)/deals/[id]/page.tsx` ⚠️ CRITICAL

This is the deal detail view. The directory exists but the file is empty. Write the complete implementation.

**Layout**: Two-column grid on desktop (`lg:grid lg:grid-cols-3 gap-6`). Left = tabs (2/3). Right = sticky metadata sidebar (1/3).

**Data loading**:
```typescript
const { id } = use(params); // Next.js 14 async params
// Primary query:
const { data: deal, isLoading } = useDeal(id);
// Secondary (loaded in parallel, not blocking render):
const timeline = useDealTimeline(id, { page: 1, limit: 20 });
const activities = useDealActivities(id, { page: 1, limit: 20 });
const notes = useDealNotes(id, { page: 1, limit: 20 });
const quotes = useDealQuotes(id, { page: 1, limit: 10 });
```

**LEFT COLUMN — 5 tabs** (use `useState` for active tab, not URL state):

**Tab 1 — Overview**:
- Deal name as `<h1>`, amount formatted with currency (large, `text-3xl font-bold`), status badge (green=WON, red=LOST, blue=OPEN), pipeline → stage breadcrumb with `›` separator
- Account card: name (clickable → `/accounts`), website as external link icon, industry chip, ARR formatted, tier badge (STRATEGIC/ENTERPRISE/MID_MARKET/SMB color-coded)
- MEDDIC section: circular progress ring showing `deal.meddicicScore` out of 100 (SVG — draw a circle with stroke-dasharray/stroke-dashoffset), ring color: <40 red, 40-70 amber, >70 green. Below: `<DealMeddicicForm dealId={id} initialData={deal.meddicicData} />` (already exists at `@/components/deals/deal-meddic-form`)
- Contacts section: list of linked contacts (from `deal.contacts`), each showing avatar initials, name, role badge, email. "+ Add Contact" button → popover with contact combobox + role input + isPrimary toggle + Save
- Custom fields section: collapsible, renders `deal.customFields` as key-value table
- Tags: `deal.tags` as grey pill chips

**Tab 2 — Timeline**:
- Unified feed from `useDealTimeline(id)` 
- Each event: left icon (activity type icon from `@/components/ui/icons`, or sticky-note icon for notes), right side: bold title, muted description, relative timestamp ("3 hours ago" using `formatDistanceToNow` from `date-fns`)
- Activity events: show status badge, if OPEN show "Complete" button → outcome input inline
- Note events: show pinned indicator if `metadata.isPinned`, show content truncated to 3 lines with "Read more" expand
- Load more button if `timeline.data.meta.hasNextPage`

**Tab 3 — Activities**:
- Full list from `useDealActivities(id)`
- Table: type icon + subject, due date (red if `dueDate < now && status === 'OPEN'`), priority badge, status chip, owner initials
- Row actions: Complete (open activities), Edit (slide-over), Delete (confirm dialog)
- "+ Schedule Activity" button → `<ActivitySlideOver dealId={id} />` (write this component inline in the same file as a local component)
- `ActivitySlideOver` props: `{ dealId: string; open: boolean; onClose: () => void }`, contains a form: type select (CALL/EMAIL/MEETING/TASK/DEMO/FOLLOW_UP), subject input, dueDate datetime-local input, priority select (LOW/MEDIUM/HIGH/URGENT), description textarea, Submit → `useCreateActivity()` mutation

**Tab 4 — Notes**:
- Notes list from `useDealNotes(id)`, pinned first
- Each note card: author initials avatar, content (full, not truncated), relative timestamp, pinned icon if pinned
- Actions on hover: Edit (inline textarea replace), Delete, Pin/Unpin — all author-gated (compare note.authorId to `useAuthStore().user.id`)
- "+ Add Note" area: always-visible textarea at the top, "Save Note" button → `useCreateNote()` mutation

**Tab 5 — Quotes**:
- List from `useDealQuotes(id)`
- Each row: quote number (`Q-${quote.version}-${quote.id.slice(-4)}`), status badge, total formatted, expires date, created date
- Row actions: Send (DRAFT only), Duplicate, Void, Download PDF (disabled button with tooltip "Coming soon")
- "+ New Quote" button → `router.push('/quotes/new?dealId=' + id)`

**RIGHT SIDEBAR** (sticky, `lg:sticky lg:top-6`):

- **Deal info card**:
  - Owner: initials avatar + full name + "Reassign" link (SALES_MANAGER+ only)
  - Close date: formatted date, red if past due and status=OPEN
  - Probability: thin horizontal progress bar (0–100, color: <30 red, 30-60 amber, >60 green)
  - Forecast category: select dropdown inline (PIPELINE/BEST_CASE/COMMIT/CLOSED/OMITTED) → auto-saves on change via `useUpdateDeal()`
  - Created / Updated timestamps

- **Stage progression bar**:
  - Horizontal list of all stages in the pipeline (load from `usePipelines()` → find the deal's pipeline → its stages)
  - Current stage highlighted (filled circle), past stages greyed, future stages empty circles
  - Click any stage → confirmation popover "Move to [stage name]?" → `useMoveDeal()` mutation on confirm

- **Quick actions**:
  - "Mark Won" button (green, full width) — disabled if already WON/LOST — confirmation modal with confetti effect on confirm (`useMarkDealWon()`)
  - "Mark Lost" button (red outline, full width) — disabled if already WON/LOST — modal requires: lost reason select (PRICE/COMPETITION/NO_BUDGET/NO_DECISION/TIMING/OTHER) + optional detail textarea
  - "Edit Deal" button → navigate to `/deals/${id}/edit`

- **Tags**: display deal.tags as chips, "+ Add" opens inline input

Full loading skeleton for the whole page when `isLoading`. Error boundary with retry button if query fails.

---

### FILE 2 — `services/comm-service/` (full service)

Communication templates and outbound messaging service. Port 3009.

```
services/comm-service/
  src/
    index.ts                         — Fastify bootstrap port 3009
    prisma.ts                        — createCommPrisma()
    fastify.d.ts
    channels/
      smtp.channel.ts                — nodemailer SMTP (same pattern as notification-service)
      sms.channel.ts                 — Twilio SMS (env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)
    services/
      templates.service.ts           — CRUD for EmailTemplate + SmsTemplate
      sequences.service.ts           — create/run email sequences (multi-step drip campaigns)
      outbox.service.ts              — queue and send messages, track open/click via webhook
    consumers/
      trigger.consumer.ts            — Kafka: on quote.sent → send quote email, on deal.won → send win notification
    routes/
      templates.routes.ts            — CRUD /templates (GET, POST, PATCH /:id, DELETE /:id)
      sequences.routes.ts            — /sequences CRUD + POST /:id/enroll (enroll contactId)
      outbox.routes.ts               — GET /outbox (sent messages log), POST /send (ad-hoc send)
      webhook.routes.ts              — POST /webhooks/track (open/click tracking pixel)
    prisma/
      schema.prisma
  package.json
  tsconfig.json
  Dockerfile
```

**`prisma/schema.prisma`**:
```prisma
model EmailTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  subject     String
  htmlBody    String   @db.Text
  textBody    String   @db.Text
  variables   String[] // list of {{variable}} names used in template
  category    String   @default("GENERAL")  // QUOTE, DEAL_WON, SEQUENCE, GENERAL
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([tenantId])
}

model SmsTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  body        String   @db.Text  // max 160 chars for single SMS
  variables   String[]
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([tenantId])
}

model EmailSequence {
  id          String         @id @default(cuid())
  tenantId    String
  name        String
  triggerType String         // MANUAL | LEAD_CREATED | DEAL_WON
  isActive    Boolean        @default(true)
  steps       SequenceStep[]
  enrollments SequenceEnrollment[]
  createdAt   DateTime       @default(now())
  @@index([tenantId])
}

model SequenceStep {
  id          String        @id @default(cuid())
  sequenceId  String
  sequence    EmailSequence @relation(fields: [sequenceId], references: [id], onDelete: Cascade)
  stepNumber  Int
  delayDays   Int           @default(0)
  templateId  String
  @@unique([sequenceId, stepNumber])
}

model SequenceEnrollment {
  id           String        @id @default(cuid())
  tenantId     String
  sequenceId   String
  sequence     EmailSequence @relation(fields: [sequenceId], references: [id])
  contactId    String
  currentStep  Int           @default(0)
  status       String        @default("ACTIVE")  // ACTIVE | COMPLETED | UNSUBSCRIBED
  enrolledAt   DateTime      @default(now())
  nextSendAt   DateTime?
  @@index([tenantId])
  @@index([status, nextSendAt])
}

model OutboxMessage {
  id           String   @id @default(cuid())
  tenantId     String
  channel      String   // EMAIL | SMS
  to           String
  subject      String?
  body         String   @db.Text
  status       String   @default("QUEUED")  // QUEUED | SENT | DELIVERED | FAILED | BOUNCED
  templateId   String?
  entityType   String?  // DEAL | CONTACT | LEAD
  entityId     String?
  sentAt       DateTime?
  openedAt     DateTime?
  clickedAt    DateTime?
  errorMessage String?
  createdAt    DateTime @default(now())
  @@index([tenantId])
  @@index([tenantId, status])
}
```

**`services/templates.service.ts`** — full CRUD:
```typescript
createTemplate(tenantId, data: { name, subject, htmlBody, textBody, category }): Promise<EmailTemplate>
updateTemplate(tenantId, id, data): Promise<EmailTemplate>
deleteTemplate(tenantId, id): Promise<void>
listTemplates(tenantId, filters: { category?, isActive? }): Promise<EmailTemplate[]>
getTemplateById(tenantId, id): Promise<EmailTemplate>
renderTemplate(template: EmailTemplate, variables: Record<string,string>): { subject: string; htmlBody: string; textBody: string }
// renderTemplate: replace {{variableName}} with values, throw if required variable missing
```

**`services/sequences.service.ts`**:
```typescript
createSequence(tenantId, data): Promise<EmailSequence>
enrollContact(tenantId, sequenceId, contactId): Promise<SequenceEnrollment>
// - validates contact exists in tenant
// - sets nextSendAt = now + step[0].delayDays
processSequenceQueue(tenantId): Promise<number>
// - find enrollments where status=ACTIVE and nextSendAt <= now
// - for each: load current step's template, render it, send via smtp.channel
// - increment currentStep, set nextSendAt += next step delayDays
// - if no more steps: status=COMPLETED
// returns count of emails sent
unenroll(tenantId, enrollmentId): Promise<void>
listEnrollments(tenantId, sequenceId): Promise<SequenceEnrollment[]>
```

**`services/outbox.service.ts`**:
```typescript
queueEmail(tenantId, { to, subject, htmlBody, textBody, templateId?, entityType?, entityId? }): Promise<OutboxMessage>
queueSms(tenantId, { to, body, templateId?, entityType?, entityId? }): Promise<OutboxMessage>
processQueue(tenantId): Promise<{ sent: number; failed: number }>
// - find QUEUED messages, attempt send via smtp/sms channel
// - update status to SENT or FAILED
trackOpen(messageId): Promise<void>
trackClick(messageId): Promise<void>
listOutbox(tenantId, filters: { status?, channel?, dateFrom?, dateTo? }, pagination): Promise<PaginatedResult<OutboxMessage>>
```

**`consumers/trigger.consumer.ts`**:
- Subscribe to TOPICS.QUOTES: on `quote.sent` → load quote + account contact → render default "Quote Ready" template → `queueEmail`
- Subscribe to TOPICS.DEALS: on `deal.won` → load deal + primary contact → render "Deal Closed" template → `queueEmail` to deal owner
- Subscribe to TOPICS.ACTIVITIES: on `activity.created` (type=MEETING) → send calendar invite placeholder email

---

### FILE 3 — `services/storage-service/` (full service)

File attachment storage via MinIO. Port 3010.

```
services/storage-service/
  src/
    index.ts                — Fastify bootstrap port 3010, multipart enabled
    minio.ts                — MinIO client factory (MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET)
    services/
      files.service.ts      — upload, download, delete, list files per entity
    routes/
      files.routes.ts       — all file endpoints
    prisma.ts
    fastify.d.ts
  prisma/
    schema.prisma
  package.json
  tsconfig.json
  Dockerfile
```

**`prisma/schema.prisma`**:
```prisma
model FileAttachment {
  id          String   @id @default(cuid())
  tenantId    String
  uploadedBy  String   // userId
  entityType  String   // DEAL | CONTACT | ACCOUNT | LEAD | QUOTE
  entityId    String
  filename    String   // original filename
  storedKey   String   // MinIO object key: {tenantId}/{entityType}/{entityId}/{uuid}-{filename}
  mimeType    String
  sizeBytes   Int
  url         String?  // pre-signed URL (not stored, generated on read)
  createdAt   DateTime @default(now())
  @@index([tenantId, entityType, entityId])
}
```

**`minio.ts`**:
```typescript
import * as Minio from 'minio';

export function createMinioClient(): Minio.Client {
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  });
}

export async function ensureBucket(client: Minio.Client, bucket: string): Promise<void> {
  const exists = await client.bucketExists(bucket);
  if (!exists) await client.makeBucket(bucket, 'us-east-1');
}
```

**`services/files.service.ts`** — complete implementation:
```typescript
uploadFile(tenantId, uploadedBy, entityType, entityId, file: { filename, mimeType, sizeBytes, buffer }): Promise<FileAttachment>
// - validate entityType is one of DEAL/CONTACT/ACCOUNT/LEAD/QUOTE
// - storedKey = `${tenantId}/${entityType}/${entityId}/${randomUUID()}-${filename}`
// - upload buffer to MinIO: client.putObject(bucket, storedKey, buffer, sizeBytes, { 'Content-Type': mimeType })
// - persist FileAttachment record
// - return record

listFiles(tenantId, entityType, entityId): Promise<FileAttachment[]>
// - return all files for entity, ordered by createdAt desc

getDownloadUrl(tenantId, fileId, expirySeconds = 3600): Promise<string>
// - load file record (verify tenantId)
// - generate pre-signed URL: client.presignedGetObject(bucket, storedKey, expirySeconds)

deleteFile(tenantId, fileId, requestingUserId): Promise<void>
// - load file, verify tenantId
// - only uploader OR admin can delete
// - client.removeObject(bucket, storedKey)
// - delete DB record
```

**`routes/files.routes.ts`**:
```
POST   /files/upload               — multipart form: file + entityType + entityId → uploadFile
GET    /files/:entityType/:entityId — listFiles
GET    /files/:id/download-url     — getDownloadUrl (returns { url: string, expiresAt: string })
DELETE /files/:id                  — deleteFile
```

---

### FILE 4 — `services/ai-service/` (Python FastAPI)

ML service for lead scoring and deal win probability. Port 8000. Written in Python.

```
services/ai-service/
  src/
    main.py               — FastAPI app bootstrap
    routers/
      scoring.py          — POST /score/lead, POST /score/deal
      transcription.py    — POST /transcribe (audio file → text via Whisper)
      insights.py         — POST /insights/deal (generate deal insights via Ollama)
    models/
      lead_scorer.py      — XGBoost lead scoring model class
      win_predictor.py    — Random Forest win probability model class
      model_store.py      — load/cache models from disk, retrain endpoint
    schemas/
      requests.py         — Pydantic models for all request bodies
      responses.py        — Pydantic models for all responses
    middleware/
      auth.py             — verify JWT Bearer token (same secret as TS services)
  models/                 — persisted model files (gitignored)
  requirements.txt
  Dockerfile
```

**`main.py`**:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import scoring, transcription, insights
import os

app = FastAPI(title="Nexus AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scoring.router, prefix="/api/v1")
app.include_router(transcription.router, prefix="/api/v1")
app.include_router(insights.router, prefix="/api/v1")

@app.get("/health")
def health(): return {"status": "ok", "service": "ai-service"}
```

**`schemas/requests.py`**:
```python
from pydantic import BaseModel
from typing import Optional

class LeadScoringRequest(BaseModel):
    tenantId: str
    leadId: str
    source: str
    industry: Optional[str] = None
    employeeCount: Optional[int] = None
    annualRevenue: Optional[float] = None
    jobTitle: Optional[str] = None
    utmSource: Optional[str] = None
    utmMedium: Optional[str] = None
    emailOpened: bool = False
    websiteVisits: int = 0

class DealScoringRequest(BaseModel):
    tenantId: str
    dealId: str
    amount: float
    daysInPipeline: int
    stageIndex: int         # 0-based position in pipeline
    totalStages: int
    meddicicScore: int
    activitiesCount: int
    lastActivityDaysAgo: int
    competitorCount: int
    hasChampion: bool
    hasEconomicBuyer: bool

class TranscriptionRequest(BaseModel):
    tenantId: str
    activityId: str
    language: str = "en"

class DealInsightsRequest(BaseModel):
    tenantId: str
    dealId: str
    dealName: str
    amount: float
    meddicicScore: int
    daysInPipeline: int
    activitiesCount: int
    lastActivityDaysAgo: int
    stageHistory: list[dict]
```

**`schemas/responses.py`**:
```python
from pydantic import BaseModel
from typing import Optional

class LeadScoringResponse(BaseModel):
    leadId: str
    score: float              # 0.0 - 100.0
    probability: float        # 0.0 - 1.0
    grade: str                # A, B, C, D
    topFactors: list[str]     # e.g. ["High annual revenue", "INBOUND source"]
    recommendation: str       # CALL_NOW | NURTURE | DISQUALIFY

class DealScoringResponse(BaseModel):
    dealId: str
    winProbability: float     # 0.0 - 1.0
    riskFactors: list[str]
    positiveFactors: list[str]
    suggestedNextAction: str

class TranscriptionResponse(BaseModel):
    activityId: str
    transcript: str
    duration: float
    language: str

class DealInsightsResponse(BaseModel):
    dealId: str
    summary: str
    risks: list[str]
    opportunities: list[str]
    nextBestActions: list[str]
```

**`models/lead_scorer.py`**:
```python
import numpy as np
from typing import Optional
import os, pickle

class LeadScorer:
    """XGBoost-based lead scoring. Falls back to rule-based scoring if model not trained yet."""
    
    MODEL_PATH = "models/lead_scorer.pkl"
    
    def __init__(self):
        self.model = self._load_model()
    
    def _load_model(self):
        if os.path.exists(self.MODEL_PATH):
            with open(self.MODEL_PATH, 'rb') as f:
                return pickle.load(f)
        return None  # will use rule-based fallback
    
    def score(self, req) -> tuple[float, list[str]]:
        """Returns (score 0-100, top_factors list)."""
        if self.model:
            features = self._extract_features(req)
            prob = float(self.model.predict_proba([features])[0][1])
            score = prob * 100
            return score, self._explain(features, prob)
        else:
            return self._rule_based_score(req)
    
    def _rule_based_score(self, req) -> tuple[float, list[str]]:
        score = 50.0
        factors = []
        
        source_scores = {"INBOUND": 20, "REFERRAL": 25, "WEB_FORM": 15, "COLD_OUTBOUND": 5, "IMPORT": 0}
        source_bonus = source_scores.get(req.source, 0)
        score += source_bonus
        if source_bonus > 10: factors.append(f"High-value source: {req.source}")
        
        if req.annualRevenue and req.annualRevenue > 1_000_000:
            score += 15
            factors.append("Annual revenue > $1M")
        
        if req.employeeCount and req.employeeCount > 100:
            score += 10
            factors.append("Company > 100 employees")
        
        if req.emailOpened:
            score += 8
            factors.append("Opened email")
        
        if req.websiteVisits > 3:
            score += 5 * min(req.websiteVisits, 5)
            factors.append(f"{req.websiteVisits} website visits")
        
        senior_titles = ["vp", "director", "chief", "head", "president", "ceo", "cto", "cfo"]
        if req.jobTitle and any(t in req.jobTitle.lower() for t in senior_titles):
            score += 12
            factors.append("Senior decision-maker title")
        
        return min(score, 100.0), factors[:3]
    
    def _extract_features(self, req) -> list:
        return [
            req.annualRevenue or 0,
            req.employeeCount or 0,
            1 if req.emailOpened else 0,
            req.websiteVisits,
            1 if req.jobTitle and any(t in req.jobTitle.lower() for t in ["vp","director","chief","ceo"]) else 0,
        ]
    
    def _explain(self, features, prob) -> list[str]:
        explanations = []
        if features[0] > 1_000_000: explanations.append("High annual revenue")
        if features[2]: explanations.append("Opened email")
        if features[4]: explanations.append("Senior title")
        return explanations or ["Model-based prediction"]
    
    def get_grade(self, score: float) -> str:
        if score >= 75: return "A"
        if score >= 50: return "B"
        if score >= 25: return "C"
        return "D"
    
    def get_recommendation(self, score: float) -> str:
        if score >= 70: return "CALL_NOW"
        if score >= 40: return "NURTURE"
        return "DISQUALIFY"
```

**`models/win_predictor.py`**:
```python
import os, pickle
from typing import Optional

class WinPredictor:
    """Random Forest win probability. Falls back to rules if model not trained."""
    
    MODEL_PATH = "models/win_predictor.pkl"
    
    def __init__(self):
        self.model = self._load_model()
    
    def _load_model(self):
        if os.path.exists(self.MODEL_PATH): 
            with open(self.MODEL_PATH, 'rb') as f: return pickle.load(f)
        return None
    
    def predict(self, req) -> tuple[float, list[str], list[str]]:
        """Returns (win_probability 0-1, risk_factors, positive_factors)."""
        if self.model:
            features = self._extract_features(req)
            prob = float(self.model.predict_proba([features])[0][1])
            return prob, self._risk_factors(req, prob), self._positive_factors(req)
        return self._rule_based_predict(req)
    
    def _rule_based_predict(self, req) -> tuple[float, list[str], list[str]]:
        prob = 0.5
        risks, positives = [], []
        
        stage_progress = req.stageIndex / max(req.totalStages - 1, 1)
        prob += stage_progress * 0.2
        if stage_progress > 0.7: positives.append("Advanced stage")
        
        if req.meddicicScore >= 70:
            prob += 0.15
            positives.append(f"Strong MEDDIC score ({req.meddicicScore})")
        elif req.meddicicScore < 40:
            prob -= 0.1
            risks.append(f"Weak MEDDIC score ({req.meddicicScore})")
        
        if req.lastActivityDaysAgo > 14:
            prob -= 0.15
            risks.append(f"No activity for {req.lastActivityDaysAgo} days")
        elif req.activitiesCount > 5:
            prob += 0.1
            positives.append(f"{req.activitiesCount} activities logged")
        
        if req.hasChampion: 
            prob += 0.1; positives.append("Internal champion identified")
        if req.hasEconomicBuyer: 
            prob += 0.1; positives.append("Economic buyer engaged")
        if req.competitorCount > 2: 
            prob -= 0.1; risks.append(f"Competing against {req.competitorCount} vendors")
        
        return round(max(0.0, min(1.0, prob)), 2), risks[:3], positives[:3]
    
    def _extract_features(self, req) -> list:
        return [req.amount, req.daysInPipeline, req.stageIndex/max(req.totalStages-1,1),
                req.meddicicScore, req.activitiesCount, req.lastActivityDaysAgo,
                req.competitorCount, 1 if req.hasChampion else 0, 1 if req.hasEconomicBuyer else 0]
    
    def _risk_factors(self, req, prob) -> list[str]:
        risks = []
        if req.lastActivityDaysAgo > 14: risks.append(f"Stale — no activity {req.lastActivityDaysAgo} days")
        if req.competitorCount > 2: risks.append("High competitive pressure")
        if req.meddicicScore < 40: risks.append("MEDDIC gaps")
        return risks[:3]
    
    def _positive_factors(self, req) -> list[str]:
        pos = []
        if req.hasChampion: pos.append("Champion identified")
        if req.hasEconomicBuyer: pos.append("Economic buyer engaged")
        if req.meddicicScore >= 70: pos.append("Strong qualification")
        return pos[:3]
```

**`routers/scoring.py`**:
```python
from fastapi import APIRouter, Depends
from ..schemas.requests import LeadScoringRequest, DealScoringRequest
from ..schemas.responses import LeadScoringResponse, DealScoringResponse
from ..models.lead_scorer import LeadScorer
from ..models.win_predictor import WinPredictor
from ..middleware.auth import verify_token

router = APIRouter(tags=["scoring"])
lead_scorer = LeadScorer()
win_predictor = WinPredictor()

@router.post("/score/lead", response_model=LeadScoringResponse)
async def score_lead(req: LeadScoringRequest, _=Depends(verify_token)):
    score, factors = lead_scorer.score(req)
    return LeadScoringResponse(
        leadId=req.leadId,
        score=round(score, 1),
        probability=round(score / 100, 2),
        grade=lead_scorer.get_grade(score),
        topFactors=factors,
        recommendation=lead_scorer.get_recommendation(score),
    )

@router.post("/score/deal", response_model=DealScoringResponse)
async def score_deal(req: DealScoringRequest, _=Depends(verify_token)):
    prob, risks, positives = win_predictor.predict(req)
    action = "Schedule next meeting" if risks else "Push for close"
    if any("stale" in r.lower() for r in risks): action = "Urgently follow up — deal going cold"
    return DealScoringResponse(
        dealId=req.dealId,
        winProbability=prob,
        riskFactors=risks,
        positiveFactors=positives,
        suggestedNextAction=action,
    )
```

**`routers/transcription.py`**:
```python
from fastapi import APIRouter, UploadFile, File, Form, Depends
from ..schemas.responses import TranscriptionResponse
from ..middleware.auth import verify_token
import os, tempfile, time

router = APIRouter(tags=["transcription"])

@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    activityId: str = Form(...),
    language: str = Form(default="en"),
    _=Depends(verify_token)
):
    # Try Whisper if available, else return mock transcript
    try:
        import whisper
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(file.filename or ".mp3")[1], delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name
        model = whisper.load_model("base")
        result = model.transcribe(tmp_path, language=language)
        os.unlink(tmp_path)
        return TranscriptionResponse(
            activityId=activityId,
            transcript=result["text"].strip(),
            duration=result.get("duration", 0.0),
            language=language,
        )
    except ImportError:
        # Whisper not installed — return placeholder for dev environments
        return TranscriptionResponse(
            activityId=activityId,
            transcript="[Whisper not installed — install openai-whisper to enable transcription]",
            duration=0.0,
            language=language,
        )
```

**`routers/insights.py`**:
```python
from fastapi import APIRouter, Depends
from ..schemas.requests import DealInsightsRequest
from ..schemas.responses import DealInsightsResponse
from ..middleware.auth import verify_token
import os

router = APIRouter(tags=["insights"])

@router.post("/insights/deal", response_model=DealInsightsResponse)
async def deal_insights(req: DealInsightsRequest, _=Depends(verify_token)):
    try:
        import ollama
        prompt = f"""Analyze this sales deal and provide actionable insights:
Deal: {req.dealName}
Amount: ${req.amount:,.0f}
MEDDIC Score: {req.meddicicScore}/100
Days in Pipeline: {req.daysInPipeline}
Activities: {req.activitiesCount} (last: {req.lastActivityDaysAgo} days ago)

Respond in JSON: {{"summary": "...", "risks": ["...", "..."], "opportunities": ["..."], "nextBestActions": ["...", "..."]}}"""
        
        response = ollama.chat(model=os.getenv("OLLAMA_MODEL", "llama3"), messages=[{"role": "user", "content": prompt}])
        import json
        data = json.loads(response["message"]["content"])
        return DealInsightsResponse(dealId=req.dealId, **data)
    except Exception:
        # Ollama not available — generate rule-based insights
        risks = []
        if req.lastActivityDaysAgo > 14: risks.append(f"No activity in {req.lastActivityDaysAgo} days — deal may be going cold")
        if req.meddicicScore < 50: risks.append("MEDDIC score below 50 — qualification gaps need addressing")
        
        actions = ["Schedule a discovery call to re-engage"] if req.lastActivityDaysAgo > 7 else ["Send a value-based follow-up email"]
        if req.meddicicScore < 50: actions.append("Complete MEDDIC qualification — identify economic buyer")
        
        return DealInsightsResponse(
            dealId=req.dealId,
            summary=f"${req.amount:,.0f} deal with {req.meddicicScore}/100 MEDDIC score, {req.daysInPipeline} days in pipeline.",
            risks=risks or ["No critical risks identified"],
            opportunities=["Strong deal size indicates enterprise potential"] if req.amount > 50000 else ["Opportunity to upsell to larger package"],
            nextBestActions=actions,
        )
```

**`middleware/auth.py`**:
```python
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt, os

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    try:
        jwt.decode(credentials.credentials, os.getenv("JWT_SECRET", ""), algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    return credentials.credentials
```

**`requirements.txt`**:
```
fastapi==0.111.0
uvicorn[standard]==0.29.0
pydantic==2.7.1
PyJWT==2.8.0
numpy==1.26.4
scikit-learn==1.4.2
xgboost==2.0.3
python-multipart==0.0.9
httpx==0.27.0
```

**`Dockerfile`** (Python):
```dockerfile
FROM python:3.11-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

FROM base AS deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM deps AS runner
COPY src/ ./src/
RUN mkdir -p models
RUN adduser --disabled-password --no-create-home nexus
USER nexus
EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

### FILE 5 — Infrastructure & CI/CD

**`infrastructure/kong/kong.yml`** — Kong declarative config (Section 55 of spec):
```yaml
_format_version: "3.0"

services:
  - name: auth-service
    url: http://auth-service:3000
    routes:
      - name: auth-routes
        paths: ["/api/v1/auth", "/api/v1/users", "/api/v1/tenants", "/api/v1/roles", "/api/v1/api-keys"]
        strip_path: false
    plugins:
      - name: rate-limiting
        config: { minute: 60, policy: local }

  - name: crm-service
    url: http://crm-service:3001
    routes:
      - name: crm-routes
        paths: ["/api/v1/deals", "/api/v1/accounts", "/api/v1/contacts", "/api/v1/leads", "/api/v1/pipelines", "/api/v1/activities", "/api/v1/notes"]
        strip_path: false
    plugins:
      - name: rate-limiting
        config: { minute: 200, policy: local }

  - name: finance-service
    url: http://finance-service:3002
    routes:
      - name: finance-routes
        paths: ["/api/v1/quotes", "/api/v1/invoices", "/api/v1/contracts", "/api/v1/products", "/api/v1/commissions", "/api/v1/cpq"]
        strip_path: false

  - name: notification-service
    url: http://notification-service:3003
    routes:
      - name: notification-routes
        paths: ["/api/v1/notifications"]
        strip_path: false

  - name: analytics-service
    url: http://analytics-service:3008
    routes:
      - name: analytics-routes
        paths: ["/api/v1/analytics"]
        strip_path: false

  - name: search-service
    url: http://search-service:3006
    routes:
      - name: search-routes
        paths: ["/api/v1/search"]
        strip_path: false

  - name: workflow-service
    url: http://workflow-service:3007
    routes:
      - name: workflow-routes
        paths: ["/api/v1/workflows", "/api/v1/executions"]
        strip_path: false

  - name: ai-service
    url: http://ai-service:8000
    routes:
      - name: ai-routes
        paths: ["/api/v1/score", "/api/v1/transcribe", "/api/v1/insights"]
        strip_path: false

  - name: storage-service
    url: http://storage-service:3010
    routes:
      - name: storage-routes
        paths: ["/api/v1/files"]
        strip_path: false

  - name: comm-service
    url: http://comm-service:3009
    routes:
      - name: comm-routes
        paths: ["/api/v1/templates", "/api/v1/sequences", "/api/v1/outbox"]
        strip_path: false
```

**`.github/workflows/ci.yml`** — Full CI/CD pipeline:
```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    name: TypeScript typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck

  test:
    name: Unit tests
    runs-on: ubuntu-latest
    needs: typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r test --reporter=verbose

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r lint

  build:
    name: Build all services
    runs-on: ubuntu-latest
    needs: [typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build

  docker-build:
    name: Docker build check
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    strategy:
      matrix:
        service: [auth-service, crm-service, finance-service, notification-service, realtime-service, search-service, workflow-service, analytics-service]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build ${{ matrix.service }}
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./services/${{ matrix.service }}/Dockerfile
          push: false
          tags: nexus/${{ matrix.service }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

### FILE 6 — Additional tests

**`services/crm-service/src/services/__tests__/notes.service.test.ts`**:
```typescript
describe('createNote', () => {
  it('throws BusinessRuleError when no entity reference provided')
  it('throws NotFoundError when dealId not in tenant')
  it('creates note linked to deal with authorId set')
})
describe('updateNote', () => {
  it('throws BusinessRuleError when requestingUserId !== note.authorId')
  it('allows update when requestingUserId === note.authorId')
})
describe('deleteNote', () => {
  it('hard-deletes the note row')
  it('throws BusinessRuleError when non-author non-admin attempts delete')
})
describe('listNotesForDeal', () => {
  it('returns pinned notes first')
  it('verifies deal belongs to tenant before returning notes')
})
```

**`services/workflow-service/src/engine/__tests__/nodes.test.ts`**:
```typescript
describe('handleConditionNode', () => {
  it('returns trueNodeId when condition evaluates to true')
  it('returns falseNodeId when condition evaluates to false')
  it('supports eq/neq/gt/lt/contains operators')
  it('throws when operator is unknown')
})
describe('handleWaitNode', () => {
  it('returns PAUSED status with resumeAt = now + delayDays')
  it('uses delayHours when provided instead of delayDays')
})
describe('handleActionNode', () => {
  it('makes HTTP POST to configured url with payload')
  it('stores response body in output')
  it('marks node FAILED when HTTP call throws')
})
```

---

### FILE 7 — Update docker-compose.yml

Add the new services to `docker-compose.yml` (append to existing file, do not replace):

```yaml
  comm-service:
    build: ./services/comm-service
    ports:
      - "3009:3009"
    env_file: ./services/comm-service/.env.example
    depends_on: [postgres, kafka]

  storage-service:
    build: ./services/storage-service
    ports:
      - "3010:3010"
    env_file: ./services/storage-service/.env.example
    depends_on: [postgres, minio]

  ai-service:
    build: ./services/ai-service
    ports:
      - "8000:8000"
    env_file: ./services/ai-service/.env.example
    volumes:
      - ai_models:/app/models

  kong:
    image: kong:3.7
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /etc/kong/kong.yml
      KONG_PROXY_ACCESS_LOG: /dev/stdout
      KONG_ADMIN_ACCESS_LOG: /dev/stdout
      KONG_PROXY_ERROR_LOG: /dev/stderr
      KONG_ADMIN_ERROR_LOG: /dev/stderr
      KONG_ADMIN_LISTEN: "0.0.0.0:8001"
    volumes:
      - ./infrastructure/kong/kong.yml:/etc/kong/kong.yml:ro
    ports:
      - "8080:8000"   # proxy
      - "8001:8001"   # admin API
    depends_on: [crm-service, auth-service, finance-service]
```

Add `ai_models` to volumes section.

Also update `infrastructure/postgres/init.sql` to add:
```sql
CREATE DATABASE nexus_comm;
CREATE DATABASE nexus_storage;
GRANT ALL PRIVILEGES ON DATABASE nexus_comm TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_storage TO nexus;
```

---

## ANTI-STUB CHECKLIST

- [ ] Zero `TODO` / `FIXME` in any file
- [ ] Python models have real rule-based fallback logic (not just `pass` or `return {}`)
- [ ] Every service has a `.env.example` file with all required env vars documented
- [ ] Every new service added to `docker-compose.yml`
- [ ] Every new Postgres DB added to `init.sql`
- [ ] The deal detail page handles all 5 tab states fully (not just one tab)
- [ ] `WorkflowExecutor` node dispatch table handles all 14 node types (add any missing)
- [ ] CI workflow has correct pnpm caching

---

## SESSION CONTINUITY

If Cursor cuts off mid-file:
```
Continue from exactly where you left off in [filename]. Write remaining code from the last line written. Do not summarize.
```

---

*Phase 4 target: ~18,000–25,000 new LOC | Running total after Phase 4: ~48,000–55,000 LOC*
*Services after Phase 4: 11 of 15 running (auth, crm, finance, notification, realtime, search, workflow, analytics, comm, storage, ai)*
