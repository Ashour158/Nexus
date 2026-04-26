# NEXUS CRM — Phase 14 + Phase 15 Cursor Prompt
## AI Enhancement + Production Hardening

**Estimated LOC:** ~28,500  
**Phase 14:** AI enhancements to existing services (~3,500 LOC)  
**Phase 15:** Full test suite + observability + k8s + security + seed data (~25,000 LOC)

---

## RULES — READ FIRST

- Never truncate. Every test file must have real assertions, not empty stubs.
- Tests use vitest + mocked Prisma + mocked Kafka (no real DB connections in unit tests).
- All monetary values: `decimal.js`.
- Run `pnpm tsc --noEmit` after Phase 14, then again after Phase 15.
- Seed data creates a complete realistic dataset — do not use placeholder values.

---

## SECTION 1 — Phase 14: AI Enhancement

### 1A: Enhance `services/ai-service/main.py`

Add the following new endpoints to the existing FastAPI app:

#### 1A-1: Churn Risk Predictor
```python
from sklearn.ensemble import RandomForestClassifier
import numpy as np
import pickle
import os

@app.post("/api/v1/ai/predict/churn-risk")
async def predict_churn_risk(request: Request):
    """
    Predict churn risk for a list of accounts.
    Input: { accounts: [{ id, daysSinceLastActivity, openDealsCount, npsScore, healthScore, 
                          annualRevenue, monthsSinceLastWon, supportTicketsOpen }] }
    Output: { predictions: [{ id, riskScore, riskLevel, riskFactors }] }
    """
    body = await request.json()
    accounts = body.get("accounts", [])
    results = []
    
    for account in accounts:
        features = [
            min(account.get("daysSinceLastActivity", 90), 365),
            account.get("openDealsCount", 0),
            account.get("npsScore", 50) if account.get("npsScore") is not None else 50,
            account.get("healthScore", 50) if account.get("healthScore") is not None else 50,
            min(float(account.get("annualRevenue", 0)) / 1_000_000, 100),
            min(account.get("monthsSinceLastWon", 12), 24),
            account.get("supportTicketsOpen", 0),
        ]
        
        # Rule-based scoring (Random Forest would be trained on historical data)
        score = 0.0
        risk_factors = []
        
        days_inactive = features[0]
        if days_inactive > 180:
            score += 0.35
            risk_factors.append(f"No activity in {int(days_inactive)} days")
        elif days_inactive > 90:
            score += 0.15
            risk_factors.append(f"Low activity (last {int(days_inactive)} days)")
        
        nps = features[2]
        if nps < 20:
            score += 0.30
            risk_factors.append(f"Very low NPS score ({int(nps)})")
        elif nps < 50:
            score += 0.15
            risk_factors.append(f"Below average NPS ({int(nps)})")
        
        health = features[3]
        if health < 30:
            score += 0.20
            risk_factors.append("Low health score")
        
        open_deals = features[1]
        if open_deals == 0:
            score += 0.10
            risk_factors.append("No open opportunities")
        
        tickets = features[6]
        if tickets > 3:
            score += 0.15
            risk_factors.append(f"{tickets} unresolved support tickets")
        
        months_since_won = features[5]
        if months_since_won > 18:
            score += 0.10
            risk_factors.append(f"No deal won in {int(months_since_won)} months")
        
        score = min(score, 1.0)
        risk_level = "HIGH" if score > 0.6 else "MEDIUM" if score > 0.3 else "LOW"
        
        results.append({
            "id": account.get("id"),
            "riskScore": round(score, 3),
            "riskLevel": risk_level,
            "riskFactors": risk_factors[:3],  # top 3 factors
        })
    
    return {"predictions": results}
```

#### 1A-2: Next Best Action Recommender
```python
@app.post("/api/v1/ai/recommend/next-action")
async def recommend_next_action(request: Request):
    """
    Recommend the next best action for a deal.
    Input: { deal: { id, amount, stage, probability, daysSinceLastActivity, 
                     daysSinceCreated, hasQuote, hasProposal, openActivitiesCount } }
    Output: { recommendations: [{ action, reason, priority, urgency }] }
    """
    body = await request.json()
    deal = body.get("deal", {})
    
    recommendations = []
    days_inactive = deal.get("daysSinceLastActivity", 0)
    stage = deal.get("stage", "").upper()
    prob = deal.get("probability", 0)
    amount = float(deal.get("amount", 0))
    has_quote = deal.get("hasQuote", False)
    days_created = deal.get("daysSinceCreated", 0)
    
    # Rule-based recommendations
    if days_inactive > 14:
        recommendations.append({
            "action": "SCHEDULE_FOLLOW_UP_CALL",
            "reason": f"No activity in {days_inactive} days — deal may go cold",
            "priority": "HIGH" if days_inactive > 30 else "MEDIUM",
            "urgency": "TODAY" if days_inactive > 30 else "THIS_WEEK",
        })
    
    if not has_quote and stage in ("PROPOSAL", "NEGOTIATION", "PRESENTATION"):
        recommendations.append({
            "action": "CREATE_QUOTE",
            "reason": "Deal is in proposal stage but has no quote attached",
            "priority": "HIGH",
            "urgency": "TODAY",
        })
    
    if prob < 30 and days_created > 60:
        recommendations.append({
            "action": "REVIEW_OR_CLOSE_DEAL",
            "reason": f"Low probability ({prob}%) deal open for {days_created} days — consider closing or rejuvenating",
            "priority": "MEDIUM",
            "urgency": "THIS_WEEK",
        })
    
    if amount > 50_000 and not deal.get("hasExecutiveSponsor", False):
        recommendations.append({
            "action": "IDENTIFY_EXECUTIVE_SPONSOR",
            "reason": "High-value deal ($50k+) without executive sponsor identified",
            "priority": "HIGH",
            "urgency": "THIS_WEEK",
        })
    
    if deal.get("openActivitiesCount", 0) == 0:
        recommendations.append({
            "action": "LOG_ACTIVITY",
            "reason": "No open activities on this deal",
            "priority": "MEDIUM",
            "urgency": "TODAY",
        })
    
    # Sort by priority
    priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    recommendations.sort(key=lambda x: priority_order.get(x["priority"], 2))
    
    return {"recommendations": recommendations[:5]}
```

#### 1A-3: Email Reply Assistant
```python
@app.post("/api/v1/ai/assist/email-reply")
async def suggest_email_replies(request: Request):
    """
    Suggest 3 email reply options for a given email thread.
    Input: { thread: [{ from, subject, body, sentAt }], tone: 'formal'|'friendly'|'brief' }
    Output: { suggestions: [{ tone, subject, body }] }
    """
    body = await request.json()
    thread = body.get("thread", [])
    tone = body.get("tone", "professional")
    
    if not thread:
        return {"suggestions": []}
    
    last_email = thread[-1]
    thread_summary = "\n---\n".join([
        f"From: {m.get('from')}\nSubject: {m.get('subject')}\n{m.get('body', '')[:500]}"
        for m in thread[-3:]  # last 3 messages for context
    ])
    
    prompt = f"""You are a professional sales assistant. Based on this email thread, suggest 3 different reply options.

EMAIL THREAD:
{thread_summary}

Generate exactly 3 replies in this JSON format:
[
  {{"tone": "formal", "subject": "Re: ...", "body": "..."}},
  {{"tone": "friendly", "subject": "Re: ...", "body": "..."}},
  {{"tone": "brief", "subject": "Re: ...", "body": "..."}}
]

Keep replies concise and action-oriented. Return ONLY the JSON array."""

    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=30,
        )
        text = response.json().get("response", "[]")
        import re, json
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            suggestions = json.loads(match.group())
            return {"suggestions": suggestions[:3]}
    except Exception:
        pass
    
    # Fallback
    return {"suggestions": [
        {"tone": "formal", "subject": f"Re: {last_email.get('subject', '')}", 
         "body": "Thank you for your email. I'll review this and get back to you shortly."},
        {"tone": "friendly", "subject": f"Re: {last_email.get('subject', '')}", 
         "body": "Thanks for reaching out! Let me look into this for you."},
        {"tone": "brief", "subject": f"Re: {last_email.get('subject', '')}", 
         "body": "Got it. Will follow up soon."},
    ]}
```

#### 1A-4: Meeting Summariser
```python
@app.post("/api/v1/ai/transcribe")
async def transcribe_audio(request: Request):
    """
    Transcribe an audio file and return text.
    Input: multipart form with 'audio' file field
    Output: { transcript: string }
    """
    form = await request.form()
    audio_file = form.get("audio")
    if not audio_file:
        raise HTTPException(status_code=400, detail="No audio file provided")
    
    # Save to temp file
    import tempfile, subprocess
    audio_bytes = await audio_file.read()
    with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as f:
        f.write(audio_bytes)
        temp_path = f.name
    
    # Use whisper.cpp or Ollama whisper if available
    try:
        # Try Ollama transcription if available
        with open(temp_path, "rb") as f:
            import base64
            audio_b64 = base64.b64encode(f.read()).decode()
        
        # Fallback: return placeholder if no whisper model available
        transcript = f"[Audio transcription - {len(audio_bytes)} bytes received. Configure Whisper model for real transcription.]"
        return {"transcript": transcript}
    finally:
        os.unlink(temp_path)

@app.post("/api/v1/ai/summarise-meeting")
async def summarise_meeting(request: Request):
    """
    Summarise a meeting transcript into structured notes.
    Input: { transcript: string, attendees?: string[], context?: string }
    Output: { summary: string, actionItems: string[], keyPoints: string[], nextSteps: string[] }
    """
    body = await request.json()
    transcript = body.get("transcript", "")
    attendees = body.get("attendees", [])
    
    if len(transcript) < 50:
        return {"summary": transcript, "actionItems": [], "keyPoints": [], "nextSteps": []}
    
    prompt = f"""Summarise this meeting transcript into structured notes.

Attendees: {', '.join(attendees) if attendees else 'Unknown'}

TRANSCRIPT:
{transcript[:3000]}

Return ONLY a JSON object:
{{
  "summary": "2-3 sentence meeting summary",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "actionItems": ["action 1 (owner)", "action 2 (owner)"],
  "nextSteps": ["next step 1", "next step 2"]
}}"""
    
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=30,
        )
        text = response.json().get("response", "{}")
        import re, json
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass
    
    return {
        "summary": transcript[:200] + "...",
        "keyPoints": [],
        "actionItems": [],
        "nextSteps": [],
    }
```

### 1B: CRM-service — Churn risk background refresh

Add to `services/crm-service/src/services/accounts.service.ts` a new method `refreshChurnScores(tenantId)`:
```typescript
async refreshChurnScores(tenantId: string): Promise<void> {
  const accounts = await prisma.account.findMany({
    where: { tenantId },
    select: { id: true, npsScore: true, healthScore: true, annualRevenue: true },
  });

  // Batch by 50
  for (let i = 0; i < accounts.length; i += 50) {
    const batch = accounts.slice(i, i + 50);
    // Build features for each account (fetch last activity dates from DB)
    const features = await Promise.all(batch.map(async (acc) => {
      const lastActivity = await prisma.activity.findFirst({
        where: { accountId: acc.id, tenantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const daysSince = lastActivity
        ? Math.floor((Date.now() - lastActivity.createdAt.getTime()) / 86_400_000)
        : 365;
      const openDeals = await prisma.deal.count({ where: { accountId: acc.id, status: 'OPEN' } });
      return {
        id: acc.id,
        daysSinceLastActivity: daysSince,
        openDealsCount: openDeals,
        npsScore: acc.npsScore ?? 50,
        healthScore: acc.healthScore ?? 50,
        annualRevenue: acc.annualRevenue ? Number(acc.annualRevenue) : 0,
        monthsSinceLastWon: 12,
        supportTicketsOpen: 0,
      };
    }));

    const res = await fetch(`${process.env.AI_SERVICE_URL}/api/v1/ai/predict/churn-risk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accounts: features }),
    });
    const { predictions } = await res.json() as { predictions: Array<{ id: string; riskScore: number }> };

    for (const p of predictions) {
      await prisma.account.update({
        where: { id: p.id },
        data: {
          customFields: { churnRiskScore: p.riskScore } as never,
        },
      });
    }
  }
}
```

Add to the crm-service `index.ts`: run `refreshChurnScores` every 6 hours via `setInterval`.

### 1C: Frontend — AI Insights

In `apps/web/src/app/(dashboard)/deals/[id]/page.tsx`:
- Add an "AI Insights" card below the main deal info
- Fetches `POST /api/v1/ai/recommend/next-action` with the deal's data
- Shows top 3 recommended actions with priority badges (🔴 High / 🟡 Medium / 🟢 Low)
- Each action is a clickable card that, when clicked, triggers the relevant flow (opens activity modal, opens quote builder, etc.)

In `apps/web/src/app/(dashboard)/accounts/[id]/page.tsx`:
- Shows a "Churn Risk" bar in the header next to Health Score:
  - Pulls `account.customFields.churnRiskScore`
  - Renders a coloured progress bar: green < 0.3, amber 0.3–0.6, red > 0.6
  - Shows risk level label and top risk factors

In `apps/web/src/app/(dashboard)/accounts/page.tsx`:
- Add a "Risk" column to the accounts table with a coloured risk badge per account

---

## SECTION 2 — Phase 15: Production Hardening

### 2A: Unit Test Suite

Write unit tests for every service. Each test file follows this pattern:
- Mock Prisma using `vi.fn()` — do NOT import real Prisma client
- Mock Kafka producer using `vi.fn()`
- Test every exported function
- Test happy path + at least 2 error cases per function

#### Required test files (write ALL of them, no stubs):

**`services/crm-service/src/__tests__/contacts.service.test.ts`**
Tests for: `listContacts`, `getContactById`, `createContact`, `updateContact`, `deleteContact`, `convertLead`.
Each function: success case, not-found error, tenant isolation (verify tenantId is always passed to Prisma).

**`services/crm-service/src/__tests__/deals.service.test.ts`**
Tests for: `listDeals`, `getDealById`, `createDeal`, `updateDeal`, `moveDealToStage`, `deleteDeal`.
Key assertions: `moveDealToStage` publishes a Kafka event; `createDeal` correctly sets `probability` from stage.

**`services/crm-service/src/__tests__/leads.service.test.ts`**
Tests for: `listLeads`, `createLead`, `updateLead`, `convertLead`.
Key assertions: `convertLead` runs in a transaction; throws if lead already CONVERTED; creates Account + Contact + optional Deal; publishes `lead.converted` event.

**`services/crm-service/src/__tests__/activities.service.test.ts`**
Tests for: `listActivities`, `createActivity`, `completeActivity`, `getOverdueActivities`.
Key assertion: `completeActivity` sets status=COMPLETED and publishes `activity.completed`.

**`services/finance-service/src/__tests__/quotes.service.test.ts`**
Tests for: `createQuote`, `calculateQuoteTotals`, `sendQuote`, `acceptQuote`, `rejectQuote`.
Key assertion: `calculateQuoteTotals` uses Decimal arithmetic — no floating point errors (test: 1.1 + 2.2 = 3.3 exactly).

**`services/finance-service/src/__tests__/cpq.service.test.ts`**
Tests for the 10-rule pricing waterfall:
- Test each rule in isolation
- Test that floor price is never breached
- Test BOGO discount applies correctly
- Test volume tier discount applies at right thresholds
- Test that all 10 rules are applied in correct order

**`services/workflow-service/src/__tests__/executor.test.ts`** (extend existing)
Tests for: `run()` method with each node type; `resume()` only runs if status=PAUSED and resumeAt passed; child completion nudges parent.

**`services/workflow-service/src/__tests__/nodes.test.ts`** (extend existing)
Tests for: all 14 node handlers; condition node all 7 operators; wait node correct pause duration; webhook node timeout handling; assign node field updates.

**`services/approval-service/src/__tests__/requests.service.test.ts`**
Tests for: `createRequest`, `approve` (advances step), `approve` (all steps done = APPROVED), `reject`, `cancel`.

**`services/data-service/src/__tests__/recycle.service.test.ts`**
Tests for: `softDelete`, `listBin`, `restore`, `purge`, `purgeExpired`.
Key assertion: `softDelete` sets `expiresAt` to 30 days from now; `purgeExpired` only deletes items where `expiresAt < now()`.

**`services/cadence-service/src/__tests__/enrollments.service.test.ts`**
Tests for: `enroll`, `pauseEnrollment`, `resumeEnrollment`, `exitEnrollment`.
Key assertion: cannot enroll same contact in same cadence twice (throws).

**`services/territory-service/src/__tests__/territories.service.test.ts`**
Tests for: `assignLead` matches correct territory; `testAssignment` (dry-run) doesn't write to DB; round-robin increments index.

#### Test file format:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createXxxService } from '../services/xxx.service.js';

const mockPrisma = {
  xxx: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
};

const mockProducer = { publish: vi.fn().mockResolvedValue(undefined) };

describe('createXxxService', () => {
  let service: ReturnType<typeof createXxxService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createXxxService(mockPrisma as never, mockProducer as never);
  });

  // Tests here...
});
```

### 2B: Integration Test Helpers

Create `packages/test-utils/src/index.ts` — shared test helpers:
```typescript
export function mockPrismaClient(overrides: Record<string, unknown> = {}) {
  const base = {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(base)),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };
  return { ...base, ...overrides };
}

export function createMockProducer() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    publishBatch: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

export function buildMockJwt(overrides: Partial<{ userId: string; tenantId: string; role: string }> = {}) {
  return {
    userId: 'user-test-123',
    tenantId: 'tenant-test-456',
    role: 'SALES_REP',
    ...overrides,
  };
}
```

### 2C: Seed Script

Create `scripts/seed.ts`:

```typescript
import { PrismaClient as CrmClient } from '../node_modules/.prisma/crm-client/index.js';
import { PrismaClient as FinanceClient } from '../node_modules/.prisma/finance-client/index.js';
import { PrismaClient as WorkflowClient } from '../node_modules/.prisma/workflow-client/index.js';
import Decimal from 'decimal.js';

const crm = new CrmClient();
const finance = new FinanceClient();
const workflow = new WorkflowClient();

const TENANT_ID = 'tenant-demo-001';

async function main() {
  console.log('🌱 Seeding NEXUS CRM demo data...');

  // ── Pipelines ─────────────────────────────────────────
  const pipeline = await crm.pipeline.upsert({
    where: { tenantId_name: { tenantId: TENANT_ID, name: 'Main Sales Pipeline' } },
    create: {
      tenantId: TENANT_ID,
      name: 'Main Sales Pipeline',
      currency: 'USD',
      isDefault: true,
      isActive: true,
    },
    update: {},
  });

  const stageNames = [
    { name: 'Lead In', order: 1, probability: 10 },
    { name: 'Qualified', order: 2, probability: 25 },
    { name: 'Proposal', order: 3, probability: 50 },
    { name: 'Negotiation', order: 4, probability: 75 },
    { name: 'Closed Won', order: 5, probability: 100 },
  ];
  const stages: Record<string, string> = {};
  for (const s of stageNames) {
    const stage = await crm.stage.upsert({
      where: { pipelineId_name: { pipelineId: pipeline.id, name: s.name } },
      create: { tenantId: TENANT_ID, pipelineId: pipeline.id, ...s },
      update: {},
    });
    stages[s.name] = stage.id;
  }

  // ── 20 Accounts ───────────────────────────────────────
  const accountNames = [
    'Acme Corp', 'TechNova Solutions', 'Gulf Trading LLC', 'Emirates Digital',
    'Al Farooq Group', 'Sunrise Technologies', 'Desert Logistics', 'Oasis Retail',
    'Peak Performance Ltd', 'Blue Ocean Ventures', 'Horizon Industries',
    'Meridian Consulting', 'Pinnacle Systems', 'Atlas Global', 'Nexus Partners',
    'Prime Capital', 'Sterling Finance', 'Vanguard Group', 'Apex Dynamics', 'Core Solutions',
  ];
  const accountIds: string[] = [];
  for (const name of accountNames) {
    const acc = await crm.account.create({
      data: {
        tenantId: TENANT_ID,
        ownerId: 'user-rep-001',
        name,
        type: 'CUSTOMER',
        status: 'ACTIVE',
        tier: Math.random() > 0.7 ? 'ENTERPRISE' : 'MID_MARKET',
        annualRevenue: new Decimal(Math.floor(Math.random() * 5_000_000) + 100_000),
        employeeCount: Math.floor(Math.random() * 500) + 10,
        country: ['UAE', 'Saudi Arabia', 'Kuwait', 'Bahrain', 'Qatar'][Math.floor(Math.random() * 5)],
        healthScore: Math.floor(Math.random() * 100),
      },
    });
    accountIds.push(acc.id);
  }

  // ── 40 Contacts ───────────────────────────────────────
  const firstNames = ['Ahmed', 'Mohammed', 'Fatima', 'Sara', 'Omar', 'Khalid', 'Aisha', 'Hassan'];
  const lastNames = ['Al-Rashid', 'Abdullah', 'Khalil', 'Mansour', 'Ibrahim', 'Yousef', 'Salem', 'Nasser'];
  const contactIds: string[] = [];
  for (let i = 0; i < 40; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
    const contact = await crm.contact.create({
      data: {
        tenantId: TENANT_ID,
        ownerId: 'user-rep-001',
        accountId: accountIds[Math.floor(Math.random() * accountIds.length)],
        firstName: fn,
        lastName: ln,
        email: `${fn.toLowerCase()}.${ln.toLowerCase().replace('-', '')}${i}@example.com`,
        jobTitle: ['CEO', 'CTO', 'CFO', 'Sales Manager', 'Procurement', 'IT Director'][Math.floor(Math.random() * 6)],
      },
    });
    contactIds.push(contact.id);
  }

  // ── 10 Products ───────────────────────────────────────
  const products = [
    { name: 'NEXUS CRM Enterprise', category: 'Software', listPrice: 4999 },
    { name: 'NEXUS CRM Professional', category: 'Software', listPrice: 1999 },
    { name: 'Implementation Services', category: 'Services', listPrice: 2500 },
    { name: 'Training Package (5 days)', category: 'Services', listPrice: 3500 },
    { name: 'Annual Support Contract', category: 'Support', listPrice: 1200 },
    { name: 'Data Migration', category: 'Services', listPrice: 5000 },
    { name: 'Custom Integration', category: 'Services', listPrice: 7500 },
    { name: 'Mobile App License', category: 'Software', listPrice: 499 },
    { name: 'API Access (unlimited)', category: 'Software', listPrice: 999 },
    { name: 'WhatsApp Bot Module', category: 'Software', listPrice: 1499 },
  ];
  const productIds: string[] = [];
  for (const p of products) {
    const product = await finance.product.create({
      data: {
        tenantId: TENANT_ID,
        name: p.name,
        category: p.category,
        listPrice: new Decimal(p.listPrice),
        currency: 'USD',
        isActive: true,
        unit: 'unit',
      },
    });
    productIds.push(product.id);
  }

  // ── 30 Deals ──────────────────────────────────────────
  const stageList = Object.values(stages);
  const stageKeys = Object.keys(stages);
  for (let i = 0; i < 30; i++) {
    const stageIdx = Math.floor(Math.random() * stageList.length);
    const stageName = stageKeys[stageIdx];
    const isWon = stageName === 'Closed Won';
    await crm.deal.create({
      data: {
        tenantId: TENANT_ID,
        ownerId: 'user-rep-001',
        accountId: accountIds[Math.floor(Math.random() * accountIds.length)],
        pipelineId: pipeline.id,
        stageId: stageList[stageIdx],
        name: `Deal ${i + 1} — ${accountNames[Math.floor(Math.random() * accountNames.length)]}`,
        amount: new Decimal(Math.floor(Math.random() * 50_000) + 5_000),
        currency: 'USD',
        probability: [10, 25, 50, 75, 100][stageIdx],
        status: isWon ? 'WON' : 'OPEN',
        expectedCloseDate: new Date(Date.now() + Math.floor(Math.random() * 90) * 86_400_000),
        forecastCategory: isWon ? 'CLOSED' : 'PIPELINE',
      },
    });
  }

  // ── 50 Activities ─────────────────────────────────────
  const actTypes = ['CALL', 'EMAIL', 'MEETING', 'TASK', 'FOLLOW_UP'] as const;
  for (let i = 0; i < 50; i++) {
    await crm.activity.create({
      data: {
        tenantId: TENANT_ID,
        ownerId: 'user-rep-001',
        type: actTypes[Math.floor(Math.random() * actTypes.length)],
        subject: `Activity ${i + 1}`,
        status: Math.random() > 0.3 ? 'PLANNED' : 'COMPLETED',
        priority: Math.random() > 0.7 ? 'HIGH' : 'NORMAL',
        dueDate: new Date(Date.now() + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 7) * 86_400_000),
        contactId: contactIds[Math.floor(Math.random() * contactIds.length)],
        accountId: accountIds[Math.floor(Math.random() * accountIds.length)],
      },
    });
  }

  // ── 5 Leads ───────────────────────────────────────────
  const leadSources = ['WEB_FORM', 'REFERRAL', 'EMAIL_CAMPAIGN', 'SOCIAL_MEDIA', 'EVENT'] as const;
  for (let i = 0; i < 5; i++) {
    await crm.lead.create({
      data: {
        tenantId: TENANT_ID,
        ownerId: 'user-rep-001',
        firstName: firstNames[i],
        lastName: lastNames[i],
        email: `lead${i}@prospect.com`,
        company: `Prospect Co ${i + 1}`,
        source: leadSources[i],
        rating: 'WARM',
        status: 'NEW',
      },
    });
  }

  // ── 3 Workflow Templates ───────────────────────────────
  await workflow.workflowTemplate.create({
    data: {
      tenantId: TENANT_ID,
      name: 'New Lead Auto-Response',
      trigger: 'lead.created',
      isActive: true,
      nodes: JSON.stringify([
        { id: 'n1', type: 'TRIGGER', config: {} },
        { id: 'n2', type: 'NOTIFY', config: { message: 'New lead: {{lead.firstName}} {{lead.lastName}}', userId: 'user-rep-001' } },
        { id: 'n3', type: 'CREATE_TASK', config: { title: 'Follow up with {{lead.firstName}}', assigneeId: 'user-rep-001' } },
        { id: 'n4', type: 'END', config: {} },
      ]),
      edges: JSON.stringify([
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n4' },
      ]),
    },
  });

  console.log('✅ Seed complete!');
  console.log(`   Tenant: ${TENANT_ID}`);
  console.log(`   Accounts: ${accountIds.length}`);
  console.log(`   Contacts: ${contactIds.length}`);
  console.log(`   Products: ${productIds.length}`);
  console.log(`   Deals: 30`);
  console.log(`   Activities: 50`);
  console.log(`   Leads: 5`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await crm.$disconnect();
    await finance.$disconnect();
    await workflow.$disconnect();
  });
```

Add to root `package.json` scripts: `"seed": "tsx scripts/seed.ts"`.

### 2D: Kubernetes Helm Chart

Create `infrastructure/k8s/helm/nexus/` directory structure:

#### `infrastructure/k8s/helm/nexus/Chart.yaml`
```yaml
apiVersion: v2
name: nexus-crm
description: NEXUS CRM — Self-hosted Revenue Operating System
type: application
version: 1.0.0
appVersion: "1.0.0"
```

#### `infrastructure/k8s/helm/nexus/values.yaml`
```yaml
global:
  imageRegistry: ""
  imagePullSecrets: []
  storageClass: "standard"

postgresql:
  enabled: true
  auth:
    postgresPassword: "nexus-pg-password"
    database: "nexus"
  primary:
    persistence:
      size: 20Gi

redis:
  enabled: true
  auth:
    password: "nexus-redis-password"

kafka:
  enabled: true
  listeners:
    client:
      protocol: PLAINTEXT

meilisearch:
  enabled: true
  auth:
    masterKey: "nexus-meili-key"

services:
  authService:
    replicas: 1
    port: 3001
    resources:
      requests: { cpu: "100m", memory: "256Mi" }
      limits: { cpu: "500m", memory: "512Mi" }
  crmService:
    replicas: 2
    port: 3002
    resources:
      requests: { cpu: "200m", memory: "512Mi" }
      limits: { cpu: "1000m", memory: "1Gi" }
  # ... (add all 23 services with their ports and resource specs)

ingress:
  enabled: true
  className: nginx
  host: crm.example.com
  tls:
    enabled: true
    secretName: nexus-tls

env:
  jwtSecret: "CHANGE_ME_IN_PRODUCTION_32_CHARS"
  corsOrigins: "https://crm.example.com"
```

#### `infrastructure/k8s/helm/nexus/templates/` — create these template files:

**`deployment.yaml`** — a Helm range loop over `services` creating a Deployment per service:
```yaml
{{- range $name, $svc := .Values.services }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ $name | kebabcase }}
  labels:
    app: {{ $name | kebabcase }}
    chart: {{ $.Chart.Name }}
spec:
  replicas: {{ $svc.replicas | default 1 }}
  selector:
    matchLabels:
      app: {{ $name | kebabcase }}
  template:
    metadata:
      labels:
        app: {{ $name | kebabcase }}
    spec:
      containers:
      - name: {{ $name | kebabcase }}
        image: "{{ $.Values.global.imageRegistry }}nexus/{{ $name | kebabcase }}:{{ $.Chart.AppVersion }}"
        ports:
        - containerPort: {{ $svc.port }}
        resources:
          {{- toYaml $svc.resources | nindent 10 }}
        envFrom:
        - secretRef:
            name: nexus-secrets
        env:
        - name: PORT
          value: "{{ $svc.port }}"
        livenessProbe:
          httpGet:
            path: /health
            port: {{ $svc.port }}
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: {{ $svc.port }}
          initialDelaySeconds: 5
          periodSeconds: 10
{{- end }}
```

**`service.yaml`** — ClusterIP Service per microservice.  
**`ingress.yaml`** — Kong/nginx ingress routing all `/api/v1` paths to services via path prefix.  
**`secrets.yaml`** — Kubernetes Secret template with base64-encoded env vars.  
**`configmap.yaml`** — ConfigMap for non-secret config (service URLs, etc.).

### 2E: Prometheus Metrics

Add to every Fastify service's `index.ts` a metrics endpoint using `@fastify/metrics` or manual counter:

```typescript
// Add to each service's index.ts after app creation:
const requestCounts: Record<string, number> = {};

app.addHook('onResponse', (request, reply, done) => {
  const key = `${request.method}_${reply.statusCode}`;
  requestCounts[key] = (requestCounts[key] ?? 0) + 1;
  done();
});

app.get('/metrics', async () => {
  const lines = [
    '# HELP nexus_http_requests_total Total HTTP requests',
    '# TYPE nexus_http_requests_total counter',
    ...Object.entries(requestCounts).map(
      ([k, v]) => `nexus_http_requests_total{method="${k.split('_')[0]}",status="${k.split('_')[1]}"} ${v}`
    ),
    `# HELP nexus_process_uptime_seconds Process uptime in seconds`,
    `nexus_process_uptime_seconds ${process.uptime()}`,
  ];
  return lines.join('\n');
});
```

### 2F: Docker Compose (complete)

Create `docker-compose.yml` at repo root with all 23 services + infrastructure:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: nexus
      POSTGRES_DB: nexus
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nexus"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --requirepass nexus

  kafka:
    image: confluentinc/cp-kafka:7.7.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qg"
    ports: ["9092:9092"]

  meilisearch:
    image: getmeili/meilisearch:v1.9
    environment:
      MEILI_MASTER_KEY: nexus-meili-key
    ports: ["7700:7700"]
    volumes: [meili_data:/meili_data]

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: nexus
      MINIO_ROOT_PASSWORD: nexus-minio
    ports: ["9000:9000", "9001:9001"]
    volumes: [minio_data:/data]

  # ── Application services ───────────────────────────────
  auth-service:
    build: { context: ., dockerfile: services/auth-service/Dockerfile }
    ports: ["3001:3001"]
    env_file: .env
    environment: { PORT: 3001 }
    depends_on: [postgres, kafka]

  crm-service:
    build: { context: ., dockerfile: services/crm-service/Dockerfile }
    ports: ["3002:3002"]
    env_file: .env
    environment: { PORT: 3002 }
    depends_on: [postgres, kafka]

  # ... (all 23 services following same pattern)

volumes:
  postgres_data:
  meili_data:
  minio_data:
```

Also create a `Dockerfile` in each service directory:

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY services/<SERVICE_NAME>/package.json ./services/<SERVICE_NAME>/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY services/<SERVICE_NAME>/ ./services/<SERVICE_NAME>/
RUN pnpm --filter @nexus/<SERVICE_NAME> build

FROM base AS runtime
COPY --from=build /app/services/<SERVICE_NAME>/dist ./dist
COPY --from=build /app/node_modules/.prisma ./.prisma
CMD ["node", "dist/index.js"]
```

---

## SECTION 3 — Final Verification

```bash
# 1. Full type check
pnpm tsc --noEmit

# 2. Run all tests (must pass — no failing tests allowed)
pnpm test

# 3. Verify seed script compiles
npx tsc scripts/seed.ts --noEmit

# 4. Verify Docker Compose valid
docker-compose config --quiet

# 5. Count test files
find services -name "*.test.ts" | wc -l
# Should be >= 12

# 6. Verify metrics endpoint registered in all services
grep -r '"/metrics"' services/*/src/index.ts | wc -l
# Should be >= 10

# 7. Final LOC count
find services apps/web/src apps/mobile/src packages scripts -name "*.ts" -o -name "*.tsx" -o -name "*.py" | \
  grep -v node_modules | grep -v dist | grep -v ".d.ts" | \
  xargs wc -l | tail -1
```

**Expected final LOC: 100,000+**  
**Services: 23 microservices + mobile app**  
**Test coverage: ~70% on critical paths**
