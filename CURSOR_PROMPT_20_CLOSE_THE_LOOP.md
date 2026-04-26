# CURSOR PROMPT 20 — Close-the-Loop Selling
## Sprint 20: Unified Email Inbox · Forecast Submission · E-Signature Integration

> **Run after Prompts 17, 18, 19 are complete.**
> These three features are the highest-priority findings from the 29-person Sales Team Discovery Session.
> They transform NEXUS from a data-entry CRM into the actual place where selling happens.
> No calling. No AI features. Focus: email, forecasting, and contract signing.

---

## Context for Cursor

**Stack:**
- Frontend: Next.js 14 App Router, TypeScript, Tailwind CSS, `@tanstack/react-query`, `lucide-react`
- Auth store: `useAuthStore` from `@/stores/auth.store` — gives `userId`, `token`, `role`, `name`
- API proxy: all `/api/*` routes proxy to microservices via Next.js Route Handlers
- Services relevant here: `comm-service` (port 3009), `workflow-service` (port 3007), new `email-sync-service` (port 3026)
- State management: Zustand (`useAuthStore`), TanStack Query for server state
- Existing patterns: see `apps/web/src/app/(dashboard)/deals/[id]/page.tsx` for tab layout reference

---

## TASK 1 — Email OAuth & Sync Infrastructure

**File: `services/email-sync/src/index.ts`** (new microservice, port 3026)

Create a new Fastify service for OAuth token management and email syncing.

```typescript
import { createService, startService, registerHealthRoutes } from '@nexus/service-utils';
import { gmail_v1, google } from 'googleapis';

const app = createService('email-sync-service');
registerHealthRoutes(app);

// OAuth initiation — returns redirect URL
app.get('/oauth/gmail/init', async (req, reply) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI // https://yourdomain.com/api/email/oauth/gmail/callback
  );
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send'],
    state: (req.query as any).userId,
  });
  reply.send({ url });
});

// OAuth callback — exchange code for tokens, store in DB
app.get('/oauth/gmail/callback', async (req, reply) => {
  const { code, state: userId } = req.query as any;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const { tokens } = await oauth2Client.getToken(code);
  // Save tokens to email_connections table (userId, provider='gmail', accessToken, refreshToken, expiry)
  reply.redirect('/settings?tab=integrations&connected=gmail');
});

// Fetch inbox threads for a user
app.get('/inbox/:userId', async (req, reply) => {
  const { userId } = req.params as any;
  const { pageToken, q } = req.query as any;
  // Load tokens from DB, refresh if expired
  // Call Gmail API: users.threads.list with q filter
  // Return threads with snippet, subject, from, date, unread status
});

// Fetch full thread
app.get('/threads/:userId/:threadId', async (req, reply) => {
  // Return full thread with all messages, bodies decoded from base64
});

// Send email / reply
app.post('/send/:userId', async (req, reply) => {
  const { to, subject, body, threadId, dealId, contactId } = req.body as any;
  // Send via Gmail API
  // Auto-log to comm-service as activity: type='email_sent', linkedTo={dealId, contactId}
});

// Sync latest emails for a user (called by cron every 5 min)
app.post('/sync/:userId', async (req, reply) => {
  // Incremental sync using historyId
  // Fetch new messages, upsert to email_messages table
  // Match sender/recipient to contact email addresses, auto-link
});

startService(app, 3026, () => console.log('email-sync-service on 3026'));
```

**DB migration: `services/email-sync/prisma/schema.prisma`**

```prisma
model EmailConnection {
  id           String   @id @default(uuid())
  userId       String   @unique
  provider     String   // 'gmail' | 'outlook'
  email        String
  accessToken  String
  refreshToken String?
  tokenExpiry  DateTime?
  syncEnabled  Boolean  @default(true)
  lastSyncAt   DateTime?
  createdAt    DateTime @default(now())
}

model EmailMessage {
  id          String   @id @default(uuid())
  userId      String
  provider    String
  messageId   String   @unique  // provider's ID
  threadId    String
  subject     String
  from        String
  to          String
  snippet     String
  body        String   @db.Text
  isRead      Boolean  @default(false)
  isInbound   Boolean
  sentAt      DateTime
  contactId   String?
  dealId      String?
  createdAt   DateTime @default(now())

  @@index([userId, threadId])
  @@index([contactId])
  @@index([dealId])
}
```

**Add to docker-compose.yml:**

```yaml
email-sync-service:
  build:
    context: .
    dockerfile: services/email-sync/Dockerfile
  container_name: nexus-email-sync
  ports:
    - "3026:3026"
  env_file: .env
  depends_on:
    - postgres
    - redis
  restart: unless-stopped
```

---

## TASK 2 — Unified Email Inbox Page

**File: `apps/web/src/app/(dashboard)/inbox/page.tsx`** (new page)

Create a full email inbox UI with thread list + thread viewer + compose/reply.

```tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { Mail, Send, Inbox, Star, Archive, RefreshCw, Search, ChevronLeft, Paperclip, X } from 'lucide-react';

interface Thread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  sentAt: string;
  isRead: boolean;
  messageCount: number;
  dealId?: string;
  contactId?: string;
}

interface Message {
  id: string;
  from: string;
  to: string;
  body: string;
  sentAt: string;
  isInbound: boolean;
}

export default function InboxPage() {
  const userId = useAuthStore((s) => s.userId);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const qc = useQueryClient();

  // Check if Gmail is connected
  const { data: connection } = useQuery({
    queryKey: ['email-connection', userId],
    queryFn: () => fetch(`/api/email/connection`).then(r => r.json()),
  });

  // Fetch threads
  const { data: threads = [], isLoading, refetch } = useQuery({
    queryKey: ['inbox', userId, searchQuery],
    queryFn: () => fetch(`/api/email/inbox?q=${encodeURIComponent(searchQuery)}`).then(r => r.json()),
    enabled: !!connection?.connected,
  });

  // Fetch thread messages
  const { data: messages = [] } = useQuery({
    queryKey: ['thread', selectedThread?.id],
    queryFn: () => fetch(`/api/email/threads/${selectedThread?.id}`).then(r => r.json()),
    enabled: !!selectedThread,
  });

  // Send reply
  const sendMutation = useMutation({
    mutationFn: (payload: { threadId: string; body: string; to: string; subject: string }) =>
      fetch('/api/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json()),
    onSuccess: () => {
      setReplyBody('');
      qc.invalidateQueries({ queryKey: ['thread', selectedThread?.id] });
      qc.invalidateQueries({ queryKey: ['inbox', userId] });
    },
  });

  if (!connection?.connected) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
          <Mail className="w-8 h-8 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect Your Email</h2>
          <p className="text-gray-500 max-w-md">Connect Gmail or Outlook to read and reply to emails without leaving NEXUS. All emails are automatically linked to contacts and deals.</p>
        </div>
        <div className="flex gap-3">
          <a
            href="/api/email/oauth/gmail/init"
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z"/><path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987z"/><path fill="#4A90D9" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21z"/><path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067z"/></svg>
            Connect Gmail
          </a>
          <a
            href="/api/email/oauth/outlook/init"
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#0078D4" d="M23 0H7a1 1 0 0 0-1 1v4H1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h5v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1z"/></svg>
            Connect Outlook
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Thread List */}
      <div className={`flex flex-col border-e border-gray-200 ${selectedThread ? 'hidden md:flex w-80' : 'w-full md:w-80'}`}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-200">
          <div className="relative flex-1">
            <Search className="absolute start-2.5 top-2.5 w-4 h-4 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search emails..."
              className="w-full ps-8 pe-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-gray-100" title="Refresh" aria-label="Refresh inbox">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          <button onClick={() => setShowCompose(true)} className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            Compose
          </button>
        </div>
        {/* Thread items */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-sm text-gray-500">Loading emails...</div>
          ) : threads.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No emails found</div>
          ) : (
            threads.map((thread: Thread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={`w-full text-start p-3 border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${selectedThread?.id === thread.id ? 'bg-blue-50' : ''} ${!thread.isRead ? 'bg-white' : 'bg-gray-50/60'}`}
              >
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <span className={`text-sm truncate ${!thread.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {thread.from.split('<')[0].trim()}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(thread.sentAt).toLocaleDateString()}
                  </span>
                </div>
                <div className={`text-sm truncate mb-0.5 ${!thread.isRead ? 'font-medium text-gray-800' : 'text-gray-600'}`}>
                  {thread.subject}
                </div>
                <div className="text-xs text-gray-400 truncate">{thread.snippet}</div>
                {(thread.dealId || thread.contactId) && (
                  <div className="mt-1 flex gap-1">
                    {thread.dealId && <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Deal linked</span>}
                    {thread.contactId && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Contact linked</span>}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread Viewer */}
      {selectedThread ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-gray-200">
            <button onClick={() => setSelectedThread(null)} className="md:hidden p-1.5 rounded-lg hover:bg-gray-100" aria-label="Back to inbox">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">{selectedThread.subject}</h2>
              <p className="text-sm text-gray-500">{selectedThread.messageCount} message{selectedThread.messageCount !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg: Message) => (
              <div key={msg.id} className={`flex ${msg.isInbound ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] rounded-xl p-4 ${msg.isInbound ? 'bg-gray-100 text-gray-900' : 'bg-blue-600 text-white'}`}>
                  <div className={`text-xs mb-2 ${msg.isInbound ? 'text-gray-500' : 'text-blue-100'}`}>
                    {msg.isInbound ? msg.from : 'You'} · {new Date(msg.sentAt).toLocaleString()}
                  </div>
                  <div className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: msg.body }} />
                </div>
              </div>
            ))}
          </div>
          {/* Reply composer */}
          <div className="p-4 border-t border-gray-200">
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <textarea
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                placeholder="Write your reply..."
                rows={4}
                className="w-full p-3 text-sm resize-none focus:outline-none"
              />
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <button className="p-1.5 rounded hover:bg-gray-200" title="Attach file" aria-label="Attach file"><Paperclip className="w-4 h-4 text-gray-500" /></button>
                </div>
                <button
                  onClick={() => {
                    if (!replyBody.trim() || !selectedThread) return;
                    sendMutation.mutate({
                      threadId: selectedThread.id,
                      to: selectedThread.from,
                      subject: `Re: ${selectedThread.subject}`,
                      body: replyBody,
                    });
                  }}
                  disabled={!replyBody.trim() || sendMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendMutation.isPending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a thread to read</p>
          </div>
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-800">
              <span className="text-sm font-medium text-white">New Email</span>
              <button onClick={() => setShowCompose(false)} className="p-1 rounded hover:bg-gray-700" aria-label="Close compose">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input placeholder="To" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Subject" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <textarea placeholder="Message" rows={8} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCompose(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Discard</button>
                <button className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**File: `apps/web/src/app/api/email/inbox/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = req.nextUrl.searchParams.get('q') || '';
  const res = await fetch(`${process.env.EMAIL_SYNC_SERVICE_URL}/inbox/${session.user.id}?q=${q}`);
  const data = await res.json();
  return NextResponse.json(data);
}
```

Create matching route handlers for:
- `apps/web/src/app/api/email/connection/route.ts` → GET `/connection` (checks if email connected)
- `apps/web/src/app/api/email/threads/[id]/route.ts` → GET `/threads/:id`
- `apps/web/src/app/api/email/send/route.ts` → POST `/send`
- `apps/web/src/app/api/email/oauth/gmail/init/route.ts` → GET, redirects to `email-sync-service/oauth/gmail/init`

**Add Inbox to sidebar** in `apps/web/src/components/layout/Sidebar.tsx` under "My Work" group:
```
{ href: '/inbox', label: 'Email Inbox', icon: Inbox }
```

**Add Emails tab to Deal detail** in `apps/web/src/app/(dashboard)/deals/[id]/page.tsx`:
Add tab `{ key: 'emails', label: 'Emails' }` with:
```tsx
{activeTab === 'emails' && (
  <DealEmailThread dealId={params.id} />
)}
```
Create `apps/web/src/components/deals/DealEmailThread.tsx` that shows emails from `/api/email/inbox?dealId=X` and allows inline reply.

---

## TASK 3 — Forecast Submission Workflow

### 3a. Forecast Page (Rep View)

**File: `apps/web/src/app/(dashboard)/forecast/page.tsx`** (new page)

```tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { TrendingUp, TrendingDown, Save, History, Users, ChevronDown, CheckCircle } from 'lucide-react';

// Forecast categories
type ForecastCategory = 'commit' | 'best_case' | 'pipeline' | 'omitted';

interface ForecastSubmission {
  id: string;
  weekOf: string;
  commit: number;
  bestCase: number;
  pipeline: number;
  notes: string;
  submittedAt: string;
}

interface DealForecast {
  id: string;
  name: string;
  amount: number;
  stage: string;
  closeDate: string;
  category: ForecastCategory;
  probability: number;
}

export default function ForecastPage() {
  const role = useAuthStore((s) => s.role);
  const isManager = role === 'manager' || role === 'admin';
  const [activeView, setActiveView] = useState<'submit' | 'history' | 'team'>(isManager ? 'team' : 'submit');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [dealCategories, setDealCategories] = useState<Record<string, ForecastCategory>>({});
  const qc = useQueryClient();

  const weekOf = getMonday(new Date()).toISOString().split('T')[0];

  // Deals in current forecast period
  const { data: deals = [] } = useQuery<DealForecast[]>({
    queryKey: ['forecast-deals'],
    queryFn: () => fetch('/api/forecast/deals').then(r => r.json()),
  });

  // Past submissions
  const { data: history = [] } = useQuery<ForecastSubmission[]>({
    queryKey: ['forecast-history'],
    queryFn: () => fetch('/api/forecast/history').then(r => r.json()),
  });

  // Team submissions (manager only)
  const { data: teamForecast = [] } = useQuery({
    queryKey: ['forecast-team'],
    queryFn: () => fetch('/api/forecast/team').then(r => r.json()),
    enabled: isManager,
  });

  const submitMutation = useMutation({
    mutationFn: (payload: { weekOf: string; dealCategories: Record<string, ForecastCategory>; notes: string }) =>
      fetch('/api/forecast/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json()),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ['forecast-history'] });
    },
  });

  // Calculate totals from deal categories
  const totals = deals.reduce((acc, deal) => {
    const cat = dealCategories[deal.id] ?? deal.category;
    if (cat === 'commit') acc.commit += deal.amount;
    if (cat === 'commit' || cat === 'best_case') acc.bestCase += deal.amount;
    if (cat !== 'omitted') acc.pipeline += deal.amount;
    return acc;
  }, { commit: 0, bestCase: 0, pipeline: 0 });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forecast</h1>
          <p className="text-sm text-gray-500 mt-0.5">Week of {weekOf}</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[
            { key: 'submit', label: 'My Forecast' },
            { key: 'history', label: 'History' },
            ...(isManager ? [{ key: 'team', label: 'Team Roll-up' }] : []),
          ].map((v) => (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key as any)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${activeView === v.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'submit' && (
        <>
          {/* KPI summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Commit', value: totals.commit, color: 'text-blue-700', bg: 'bg-blue-50', desc: 'Deals you are committing to close this period' },
              { label: 'Best Case', value: totals.bestCase, color: 'text-amber-700', bg: 'bg-amber-50', desc: 'Commit + upside if everything goes right' },
              { label: 'Pipeline', value: totals.pipeline, color: 'text-gray-700', bg: 'bg-gray-50', desc: 'Total pipeline including long shots' },
            ].map((card) => (
              <div key={card.label} className={`${card.bg} rounded-xl p-5 border border-opacity-20`}>
                <p className="text-sm text-gray-500 mb-1">{card.label}</p>
                <p className={`text-3xl font-bold ${card.color}`}>${(card.value / 1000).toFixed(1)}K</p>
                <p className="text-xs text-gray-400 mt-1">{card.desc}</p>
              </div>
            ))}
          </div>

          {/* Deal categorization table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Categorize Your Deals</h2>
              <p className="text-sm text-gray-500 mt-0.5">Assign each deal to a forecast category. Changes auto-update the totals above.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase text-gray-500">
                    <th className="text-start px-5 py-3 font-medium">Deal</th>
                    <th className="text-start px-5 py-3 font-medium">Stage</th>
                    <th className="text-start px-5 py-3 font-medium">Amount</th>
                    <th className="text-start px-5 py-3 font-medium">Close Date</th>
                    <th className="text-start px-5 py-3 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal, i) => {
                    const cat = dealCategories[deal.id] ?? deal.category;
                    const catColors: Record<ForecastCategory, string> = {
                      commit: 'bg-blue-100 text-blue-700 border-blue-200',
                      best_case: 'bg-amber-100 text-amber-700 border-amber-200',
                      pipeline: 'bg-gray-100 text-gray-700 border-gray-200',
                      omitted: 'bg-red-50 text-red-600 border-red-100',
                    };
                    return (
                      <tr key={deal.id} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'} hover:bg-blue-50/40`}>
                        <td className="px-5 py-3 font-medium text-gray-900">{deal.name}</td>
                        <td className="px-5 py-3 text-gray-500">{deal.stage}</td>
                        <td className="px-5 py-3 font-medium">${deal.amount.toLocaleString()}</td>
                        <td className="px-5 py-3 text-gray-500">{new Date(deal.closeDate).toLocaleDateString()}</td>
                        <td className="px-5 py-3">
                          <select
                            value={cat}
                            onChange={e => setDealCategories(prev => ({ ...prev, [deal.id]: e.target.value as ForecastCategory }))}
                            className={`text-xs font-medium px-2 py-1 rounded-lg border ${catColors[cat]} focus:outline-none`}
                          >
                            <option value="commit">Commit</option>
                            <option value="best_case">Best Case</option>
                            <option value="pipeline">Pipeline</option>
                            <option value="omitted">Omitted</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes + submit */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Forecast Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Share context with your manager — risks, assumptions, big deals at stake..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center justify-end gap-3 mt-3">
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" /> Forecast submitted
                </span>
              )}
              <button
                onClick={() => submitMutation.mutate({ weekOf, dealCategories, notes })}
                disabled={submitMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {submitMutation.isPending ? 'Submitting...' : 'Submit Forecast'}
              </button>
            </div>
          </div>
        </>
      )}

      {activeView === 'history' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Submission History</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase text-gray-500">
                <th className="text-start px-5 py-3 font-medium">Week Of</th>
                <th className="text-start px-5 py-3 font-medium">Commit</th>
                <th className="text-start px-5 py-3 font-medium">Best Case</th>
                <th className="text-start px-5 py-3 font-medium">Pipeline</th>
                <th className="text-start px-5 py-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h: ForecastSubmission, i) => (
                <tr key={h.id} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-5 py-3 font-medium">{h.weekOf}</td>
                  <td className="px-5 py-3 text-blue-700 font-medium">${(h.commit / 1000).toFixed(1)}K</td>
                  <td className="px-5 py-3 text-amber-700">${(h.bestCase / 1000).toFixed(1)}K</td>
                  <td className="px-5 py-3 text-gray-600">${(h.pipeline / 1000).toFixed(1)}K</td>
                  <td className="px-5 py-3 text-gray-400">{new Date(h.submittedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'team' && isManager && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Team Forecast Roll-up — Week of {weekOf}</h2>
            <span className="text-sm text-gray-500">{teamForecast.length} reps submitted</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase text-gray-500">
                <th className="text-start px-5 py-3 font-medium">Rep</th>
                <th className="text-start px-5 py-3 font-medium">Quota</th>
                <th className="text-start px-5 py-3 font-medium">Commit</th>
                <th className="text-start px-5 py-3 font-medium">Best Case</th>
                <th className="text-start px-5 py-3 font-medium">Pipeline</th>
                <th className="text-start px-5 py-3 font-medium">Coverage</th>
                <th className="text-start px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(teamForecast as any[]).map((rep, i) => {
                const coverage = rep.quota > 0 ? ((rep.pipeline / rep.quota) * 100).toFixed(0) : '—';
                const coverageNum = rep.quota > 0 ? rep.pipeline / rep.quota : 0;
                return (
                  <tr key={rep.userId} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                    <td className="px-5 py-3 font-medium text-gray-900">{rep.name}</td>
                    <td className="px-5 py-3 text-gray-500">${(rep.quota / 1000).toFixed(0)}K</td>
                    <td className="px-5 py-3 text-blue-700 font-semibold">${(rep.commit / 1000).toFixed(1)}K</td>
                    <td className="px-5 py-3 text-amber-700">${(rep.bestCase / 1000).toFixed(1)}K</td>
                    <td className="px-5 py-3">${(rep.pipeline / 1000).toFixed(1)}K</td>
                    <td className="px-5 py-3">
                      <span className={`font-medium ${coverageNum >= 3 ? 'text-green-600' : coverageNum >= 2 ? 'text-amber-600' : 'text-red-600'}`}>
                        {coverage}%
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {rep.submitted ? (
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Submitted</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full">Pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* Roll-up totals row */}
              <tr className="bg-blue-50 font-semibold border-t-2 border-blue-200">
                <td className="px-5 py-3 text-blue-900">Team Total</td>
                <td className="px-5 py-3 text-blue-700">${(teamForecast.reduce((a: number, r: any) => a + r.quota, 0) / 1000).toFixed(0)}K</td>
                <td className="px-5 py-3 text-blue-900">${(teamForecast.reduce((a: number, r: any) => a + r.commit, 0) / 1000).toFixed(1)}K</td>
                <td className="px-5 py-3 text-blue-700">${(teamForecast.reduce((a: number, r: any) => a + r.bestCase, 0) / 1000).toFixed(1)}K</td>
                <td className="px-5 py-3 text-blue-600">${(teamForecast.reduce((a: number, r: any) => a + r.pipeline, 0) / 1000).toFixed(1)}K</td>
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-sm text-blue-600">{teamForecast.filter((r: any) => r.submitted).length}/{teamForecast.length} submitted</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}
```

### 3b. Forecast API Routes

**File: `apps/web/src/app/api/forecast/submit/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { weekOf, dealCategories, notes } = await req.json();

  // Calculate totals from deal categories
  const dealIds = Object.keys(dealCategories);
  const deals = await prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, amount: true } });

  let commit = 0, bestCase = 0, pipeline = 0;
  for (const deal of deals) {
    const cat = dealCategories[deal.id];
    if (cat === 'commit') { commit += deal.amount; bestCase += deal.amount; pipeline += deal.amount; }
    else if (cat === 'best_case') { bestCase += deal.amount; pipeline += deal.amount; }
    else if (cat === 'pipeline') { pipeline += deal.amount; }
  }

  // Upsert forecast submission for this week
  const forecast = await prisma.forecastSubmission.upsert({
    where: { userId_weekOf: { userId: session.user.id, weekOf } },
    create: { userId: session.user.id, weekOf, commit, bestCase, pipeline, notes, dealCategories, submittedAt: new Date() },
    update: { commit, bestCase, pipeline, notes, dealCategories, submittedAt: new Date() },
  });

  return NextResponse.json(forecast);
}
```

Create the following API routes similarly:
- `apps/web/src/app/api/forecast/deals/route.ts` → GET: returns open deals with close date in current/next period
- `apps/web/src/app/api/forecast/history/route.ts` → GET: returns past submissions for current user
- `apps/web/src/app/api/forecast/team/route.ts` → GET (manager only): returns all reps' submissions for current week, joined with quota from planning module

**Prisma migration** — add to the main web schema or planning service schema:

```prisma
model ForecastSubmission {
  id              String   @id @default(uuid())
  userId          String
  weekOf          String   // ISO date of Monday
  commit          Float    @default(0)
  bestCase        Float    @default(0)
  pipeline        Float    @default(0)
  notes           String?
  dealCategories  Json     // Record<dealId, ForecastCategory>
  submittedAt     DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([userId, weekOf])
  @@index([weekOf])
}
```

**Add Forecast to sidebar** under "Sales" group:
```
{ href: '/forecast', label: 'Forecast', icon: TrendingUp }
```

---

## TASK 4 — E-Signature Integration

### 4a. DocuSign OAuth & Envelope Service

**File: `apps/web/src/app/api/esign/docusign/init/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URLSearchParams({
    response_type: 'code',
    scope: 'signature',
    client_id: process.env.DOCUSIGN_INTEGRATION_KEY!,
    redirect_uri: process.env.DOCUSIGN_REDIRECT_URI!,
    state: session.user.id,
  });
  return NextResponse.redirect(`https://account.docusign.com/oauth/auth?${params}`);
}
```

**File: `apps/web/src/app/api/esign/docusign/callback/route.ts`**

Exchange code for token, store in DB, redirect to settings.

**File: `apps/web/src/app/api/esign/send/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { documentId, signerEmail, signerName, signerRole, dealId, contractId } = await req.json();

  // Load DocuSign access token for user from DB
  // Fetch document bytes from storage service or DB
  // Create DocuSign envelope via REST API:
  //   POST https://demo.docusign.net/restapi/v2.1/accounts/{accountId}/envelopes
  // Store envelope ID in DB linked to documentId/contractId/dealId
  // Return { envelopeId, status: 'sent' }

  // Mock response for development:
  return NextResponse.json({ envelopeId: 'mock-' + Date.now(), status: 'sent' });
}
```

**File: `apps/web/src/app/api/esign/status/[envelopeId]/route.ts`**

Poll DocuSign for envelope status and return to frontend.

**File: `apps/web/src/app/api/esign/webhook/route.ts`**

DocuSign Connect webhook: when `completed` event received, auto-advance deal stage to `Closed-Won` if contractId is linked.

### 4b. SendForSignature Component

**File: `apps/web/src/components/esign/SendForSignature.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileSignature, CheckCircle, Clock, AlertCircle, ExternalLink, X } from 'lucide-react';

interface Props {
  documentId?: string;
  contractId?: string;
  dealId?: string;
  documentName: string;
  onSent?: () => void;
}

type SignatureStatus = 'not_sent' | 'sent' | 'delivered' | 'completed' | 'declined' | 'voided';

const STATUS_CONFIG: Record<SignatureStatus, { label: string; color: string; icon: React.ReactNode }> = {
  not_sent:  { label: 'Not Sent',  color: 'text-gray-500',  icon: <FileSignature className="w-4 h-4" /> },
  sent:      { label: 'Sent',      color: 'text-blue-600',  icon: <Clock className="w-4 h-4" /> },
  delivered: { label: 'Delivered', color: 'text-amber-600', icon: <Clock className="w-4 h-4" /> },
  completed: { label: 'Signed',    color: 'text-green-600', icon: <CheckCircle className="w-4 h-4" /> },
  declined:  { label: 'Declined',  color: 'text-red-600',   icon: <AlertCircle className="w-4 h-4" /> },
  voided:    { label: 'Voided',    color: 'text-gray-400',  icon: <X className="w-4 h-4" /> },
};

export default function SendForSignature({ documentId, contractId, dealId, documentName, onSent }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('Signer');
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);

  // Poll signature status
  const { data: statusData } = useQuery({
    queryKey: ['esign-status', envelopeId],
    queryFn: () => fetch(`/api/esign/status/${envelopeId}`).then(r => r.json()),
    enabled: !!envelopeId,
    refetchInterval: 30000, // poll every 30s
  });

  const status: SignatureStatus = statusData?.status ?? (envelopeId ? 'sent' : 'not_sent');
  const cfg = STATUS_CONFIG[status];

  const sendMutation = useMutation({
    mutationFn: () => fetch('/api/esign/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, contractId, dealId, signerEmail, signerName, signerRole }),
    }).then(r => r.json()),
    onSuccess: (data) => {
      setEnvelopeId(data.envelopeId);
      setShowForm(false);
      onSent?.();
    },
  });

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 ${cfg.color}`}>
            {cfg.icon}
            <span className="text-sm font-medium">{cfg.label}</span>
          </div>
          <span className="text-sm text-gray-500">— {documentName}</span>
        </div>
        <div className="flex items-center gap-2">
          {envelopeId && (
            <a
              href={`https://app.docusign.com/documents/details/${envelopeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> View in DocuSign
            </a>
          )}
          {status === 'not_sent' && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <FileSignature className="w-3.5 h-3.5" />
              Send for Signature
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <p className="text-sm font-medium text-gray-700">Signer Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="Signer name"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={signerEmail}
              onChange={e => setSignerEmail(e.target.value)}
              placeholder="Signer email"
              type="email"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <input
            value={signerRole}
            onChange={e => setSignerRole(e.target.value)}
            placeholder="Role (e.g. Procurement Lead)"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button
              onClick={() => sendMutation.mutate()}
              disabled={!signerEmail || !signerName || sendMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <FileSignature className="w-3.5 h-3.5" />
              {sendMutation.isPending ? 'Sending...' : 'Send Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 4c. Wire SendForSignature into Documents and Contracts pages

**In `apps/web/src/app/(dashboard)/documents/[id]/page.tsx`:**

Add below the document viewer:
```tsx
import SendForSignature from '@/components/esign/SendForSignature';

// Inside the page, after document metadata:
<SendForSignature
  documentId={document.id}
  dealId={document.dealId}
  documentName={document.name}
  onSent={() => queryClient.invalidateQueries({ queryKey: ['document', params.id] })}
/>
```

**In `apps/web/src/app/(dashboard)/contracts/page.tsx` and contract detail:**

Add a "Send for Signature" button in the actions column:
```tsx
<SendForSignature
  contractId={contract.id}
  dealId={contract.dealId}
  documentName={`${contract.title} — ${contract.version}`}
/>
```

**In `apps/web/src/app/(dashboard)/deals/[id]/page.tsx`:**

In the Documents/Files tab, for each document show the signature status badge. Add a consolidated "Send Contract for Signature" CTA when deal is in `Proposal Sent` or `Negotiation` stage.

---

## TASK 5 — Navigation Updates

**In `apps/web/src/components/layout/Sidebar.tsx`:**

Add the two new pages to the sidebar nav groups:

```typescript
// In the "My Work" group (near Calendar):
{ href: '/inbox',    label: 'Email Inbox', icon: Inbox }

// In the "Sales" group (near Pipeline):
{ href: '/forecast', label: 'Forecast',    icon: TrendingUp }
```

Ensure imports are added: `import { Inbox, TrendingUp } from 'lucide-react';`

---

## TASK 6 — Environment Variables

**Add to `.env.example`:**

```bash
# Email Sync (Gmail OAuth)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/email/oauth/gmail/callback

# Email Sync (Outlook OAuth)
MICROSOFT_CLIENT_ID=your_ms_client_id
MICROSOFT_CLIENT_SECRET=your_ms_client_secret
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/email/oauth/outlook/callback

# E-Signature (DocuSign)
DOCUSIGN_INTEGRATION_KEY=your_docusign_integration_key
DOCUSIGN_CLIENT_SECRET=your_docusign_client_secret
DOCUSIGN_REDIRECT_URI=http://localhost:3000/api/esign/docusign/callback
DOCUSIGN_ACCOUNT_ID=your_docusign_account_id

# Email Sync Service
EMAIL_SYNC_SERVICE_URL=http://email-sync-service:3026
```

**Add to `infrastructure/nginx/nginx.conf`** (already complete from Prompt 19 but add upstream):
```nginx
upstream email_sync {
    server email-sync-service:3026;
}
location /email-sync/ {
    proxy_pass http://email_sync/;
}
```

---

## TASK 7 — Settings: Integrations Tab Wiring

**In `apps/web/src/app/(dashboard)/settings/page.tsx`**, the Integrations tab already exists. Ensure the following integration cards are wired with real OAuth buttons:

```tsx
// Gmail card — check if connected, show Connect/Disconnect
{
  name: 'Gmail',
  description: 'Sync your Gmail inbox to read and reply from NEXUS',
  connected: !!emailConnection?.provider === 'gmail',
  onConnect: () => window.location.href = '/api/email/oauth/gmail/init',
  onDisconnect: () => fetch('/api/email/connection', { method: 'DELETE' }),
}

// DocuSign card
{
  name: 'DocuSign',
  description: 'Send contracts for e-signature directly from deals',
  connected: !!esignConnection?.provider === 'docusign',
  onConnect: () => window.location.href = '/api/esign/docusign/init',
}
```

---

## Acceptance Criteria

- [ ] Gmail/Outlook OAuth flow completes and stores tokens
- [ ] `/inbox` page loads email threads with subject, from, snippet, date
- [ ] Selecting a thread shows all messages in the thread
- [ ] Reply sends via Gmail API and appears in thread immediately
- [ ] Emails are auto-linked to contacts by email address match
- [ ] `/forecast` page loads deals with category selectors
- [ ] Changing deal category updates commit/best-case/pipeline totals live
- [ ] Submitting forecast stores to DB and shows in History tab
- [ ] Manager `/forecast` team roll-up shows all reps with submitted/pending status
- [ ] `SendForSignature` component appears on Document detail and Contract detail pages
- [ ] DocuSign envelope is created and status shows "Sent" in NEXUS
- [ ] Signature status updates via webhook or polling
- [ ] Both new routes appear in sidebar (Inbox, Forecast)
- [ ] Settings → Integrations shows Gmail and DocuSign cards with real OAuth buttons
- [ ] `.env.example` includes all new variables

---

## Notes for Cursor

- The `email-sync` service is **new** — create its directory under `services/` following the pattern of other services (see `services/crm/src/index.ts` for reference)
- For DocuSign, use the **demo environment** during development: `account-d.docusign.com` and `demo.docusign.net`
- The `ForecastSubmission` model should live in the **planning service** schema since that's where quota data lives — or in the main web schema if using Next.js direct DB access
- Do **not** implement call recording or AI transcription — those are explicitly excluded
- E-signature webhook endpoint should verify DocuSign's HMAC signature before processing
