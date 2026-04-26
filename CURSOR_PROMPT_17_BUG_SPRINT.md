# CURSOR PROMPT 17 — Bug Sprint (All P0 Crashes from Three-Team Evaluation)

## Context
NEXUS CRM — pnpm monorepo. Frontend: `apps/web` (Next.js 14 App Router).
Backend services in `services/`. This prompt fixes 14 P0 blockers identified by the sales team and design team.
Write every file COMPLETELY — no truncation, no ellipsis, no "// rest of code here".

---

## TASK 1 — Fix Cadence Email Step Editor (react-quill crash)

### Install dependency
```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder --filter web
```

### File: `apps/web/src/components/cadences/EmailStepEditor.tsx`
Full rich-text email editor using Tiptap (not react-quill — it has SSR issues):

```tsx
'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const TOKENS = ['{{first_name}}', '{{last_name}}', '{{company}}', '{{rep_name}}', '{{deal_value}}'];

export function EmailStepEditor({ value, onChange, placeholder = 'Write your email...' }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const insertToken = (token: string) => {
    editor?.chain().focus().insertContent(token).run();
  };

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 border-b border-gray-200 flex-wrap">
        <button onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`px-2 py-1 rounded text-sm font-bold ${editor?.isActive('bold') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-200'}`}>B</button>
        <button onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`px-2 py-1 rounded text-sm italic ${editor?.isActive('italic') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-200'}`}>I</button>
        <button onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={`px-2 py-1 rounded text-sm ${editor?.isActive('bulletList') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-200'}`}>• List</button>
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <span className="text-xs text-gray-500 mr-1">Insert:</span>
        {TOKENS.map(t => (
          <button key={t} onClick={() => insertToken(t)}
            className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs border border-blue-200 hover:bg-blue-100">
            {t}
          </button>
        ))}
      </div>
      {/* Editor area */}
      <div className="min-h-[200px] p-4 prose prose-sm max-w-none">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
```

### Update: `apps/web/src/app/(dashboard)/cadences/[id]/page.tsx`
Replace any `import ReactQuill from 'react-quill'` with:
```tsx
import { EmailStepEditor } from '@/components/cadences/EmailStepEditor';
```
Replace any `<ReactQuill ... />` with:
```tsx
<EmailStepEditor value={step.body ?? ''} onChange={(html) => updateStep(step.id, { body: html })} />
```

---

## TASK 2 — Fix Cadence Enroll Flow

### File: `apps/web/src/app/(dashboard)/cadences/[id]/enroll/page.tsx`
Complete the enroll page with a working mutation:

```tsx
'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';

export default function EnrollPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');

  const enroll = useMutation({
    mutationFn: async (contactEmails: string[]) => {
      const res = await fetch(`/api/cadences/${id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: contactEmails }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      router.push(`/cadences/${id}?enrolled=${data.count}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const list = emails.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (list.length === 0) { setError('Enter at least one email address'); return; }
    enroll.mutate(list);
  };

  return (
    <div className="max-w-lg mx-auto p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Enroll contacts in cadence</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email addresses (one per line or comma-separated)</label>
          <textarea
            value={emails}
            onChange={e => setEmails(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
            placeholder="john@acme.com&#10;jane@corp.com"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={enroll.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition">
            {enroll.isPending ? 'Enrolling...' : 'Enroll contacts'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
```

### File: `apps/web/src/app/api/cadences/[id]/enroll/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { emails } = await req.json();
  const res = await fetch(`${process.env.CADENCE_SERVICE_URL}/cadences/${params.id}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ emails }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

---

## TASK 3 — Fix Admin Panel Session Bug

### File: `apps/web/src/app/api/admin/users/[id]/route.ts`
The bug: `getServerSession` was called without arguments. Fix:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  // Forward to auth-service
  const res = await fetch(`${process.env.AUTH_SERVICE_URL}/admin/users/${params.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const res = await fetch(`${process.env.AUTH_SERVICE_URL}/admin/users/${params.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  return NextResponse.json({ success: res.ok }, { status: res.status });
}
```

---

## TASK 4 — Fix Feature Flags (404 → working save)

### File: `apps/web/src/app/api/admin/flags/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const FLAGS_FILE = path.join(process.cwd(), 'data', 'feature-flags.json');

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const data = await readFile(FLAGS_FILE, 'utf8');
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ flags: [] });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const { mkdir } = await import('fs/promises');
  await mkdir(path.dirname(FLAGS_FILE), { recursive: true });
  await writeFile(FLAGS_FILE, JSON.stringify(body, null, 2));
  return NextResponse.json({ success: true });
}
```

---

## TASK 5 — Fix Product Create Form

### File: `apps/web/src/app/(dashboard)/products/page.tsx`
Find the "Create product" modal submit button. Add the missing mutation:

```tsx
const createProduct = useMutation({
  mutationFn: async (data: CreateProductInput) => {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create product');
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    setShowCreateModal(false);
    toast.success('Product created');
  },
});

// In the form:
<form onSubmit={(e) => { e.preventDefault(); createProduct.mutate(formData); }}>
```

### File: `apps/web/src/app/api/products/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const res = await fetch(`${process.env.BILLING_SERVICE_URL}/products?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const res = await fetch(`${process.env.BILLING_SERVICE_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

---

## TASK 6 — Fix ProductLineItems Product Search

### File: `apps/web/src/components/deals/ProductLineItems.tsx`
Find the product search dropdown. Wire it to the API:

```tsx
const [productSearch, setProductSearch] = useState('');

const { data: productResults } = useQuery({
  queryKey: ['products', 'search', productSearch],
  queryFn: () => fetch(`/api/products?q=${encodeURIComponent(productSearch)}`).then(r => r.json()),
  enabled: productSearch.length > 0,
});

// In the dropdown input:
<input
  type="text"
  placeholder="Search products..."
  value={productSearch}
  onChange={(e) => setProductSearch(e.target.value)}
  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 outline-none"
/>
{productResults?.products?.map((p: Product) => (
  <button key={p.id} onClick={() => addLineItem(p)} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
    {p.name} — {p.currency} {p.price}
  </button>
))}
```

---

## TASK 7 — Create Portal Pages (both were missing)

### File: `apps/web/src/app/(dashboard)/contacts/[id]/portal/page.tsx`
```tsx
'use client';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link2, Copy, Send, Eye } from 'lucide-react';

export default function ContactPortalPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({
    queryKey: ['contact-portal', id],
    queryFn: () => fetch(`/api/contacts/${id}/portal`).then(r => r.json()),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => fetch(`/api/contacts/${id}/portal`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-portal', id] }),
  });

  const portalUrl = `${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.nexuscrm.io'}/c/${data?.token}`;

  const copy = () => { navigator.clipboard.writeText(portalUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Customer Portal Access</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{data?.enabled ? 'Enabled' : 'Disabled'}</span>
          <button
            onClick={() => toggle.mutate(!data?.enabled)}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${data?.enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${data?.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {data?.enabled && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 text-sm text-gray-600 truncate">{portalUrl}</span>
            <button onClick={copy} className="text-sm text-blue-600 hover:text-blue-700 font-medium shrink-0">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Portal permissions</h3>
            {[
              { key: 'showDeals', label: 'View deals' },
              { key: 'showInvoices', label: 'View invoices' },
              { key: 'showDocuments', label: 'View documents' },
              { key: 'allowUpload', label: 'Upload files' },
              { key: 'allowMessaging', label: 'Message rep' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{label}</span>
                <input type="checkbox" defaultChecked={data?.permissions?.[key]} className="accent-blue-600" />
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <Send className="w-4 h-4" /> Send invite email
            </button>
            <a href={portalUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
              <Eye className="w-4 h-4" /> Preview portal
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
```

### File: `apps/web/src/app/(dashboard)/portal/settings/page.tsx`
```tsx
'use client';
import { useState } from 'react';

export default function PortalSettingsPage() {
  const [primaryColor, setPrimaryColor] = useState('#2563EB');
  const [welcomeMsg, setWelcomeMsg] = useState('Welcome to your customer portal.');
  const [customDomain, setCustomDomain] = useState('');

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portal Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Customize what your customers see in their portal.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Branding</h3>
        <div>
          <label className="text-sm font-medium text-gray-700">Primary color</label>
          <div className="flex items-center gap-3 mt-1">
            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
              className="h-8 w-8 rounded cursor-pointer" />
            <span className="text-sm text-gray-600">{primaryColor}</span>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Welcome message</label>
          <textarea value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value)} rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Custom domain (CNAME)</label>
          <input value={customDomain} onChange={e => setCustomDomain(e.target.value)} placeholder="portal.yourcompany.com"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 outline-none" />
          <p className="text-xs text-gray-400 mt-1">Point a CNAME record to portal.nexuscrm.io</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          Save settings
        </button>
      </div>
    </div>
  );
}
```

---

## TASK 8 — Fix Commission Chart Crash

### File: `apps/web/src/app/(dashboard)/commissions/page.tsx`
Find the what-if recharts `LineChart`. The crash is caused by undefined data. Add guards:

```tsx
// Replace the chart data construction with safe fallback:
const whatIfData = useMemo(() => {
  if (!commissionPlan) return [];
  const base = closedRevenue ?? 0;
  return Array.from({ length: 10 }, (_, i) => {
    const extra = (i + 1) * 5000;
    const total = base + extra;
    const rate = total > (commissionPlan.quota ?? 1)
      ? (commissionPlan.acceleratorRate ?? commissionPlan.baseRate ?? 0.1)
      : (commissionPlan.baseRate ?? 0.1);
    return { extra, payout: Math.round(total * rate) };
  });
}, [commissionPlan, closedRevenue]);

// In JSX, guard before rendering:
{whatIfData.length > 0 && (
  <LineChart data={whatIfData} width={500} height={200}>
    <XAxis dataKey="extra" tickFormatter={(v) => `+$${(v/1000).toFixed(0)}k`} />
    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
    <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, 'Projected payout']} />
    <Line type="monotone" dataKey="payout" stroke="#2563EB" strokeWidth={2} dot={false} />
  </LineChart>
)}
```

---

## TASK 9 — Create Duplicate Scan API Route

### File: `apps/web/src/app/api/contacts/duplicates/scan/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await fetch(`${process.env.CRM_SERVICE_URL}/contacts/duplicates/scan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: session.user.tenantId }),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
```

---

## TASK 10 — Fix CSV Import Silent Failure

### File: `apps/web/src/app/api/contacts/import/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const mapping = formData.get('mapping') as string;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  // Strip BOM if present
  let text = await file.text();
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = text.split('\n').map(r => r.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
  const headers = rows[0];
  const fieldMap = mapping ? JSON.parse(mapping) : {};
  const contacts = rows.slice(1).filter(r => r.length > 1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (fieldMap[h]) obj[fieldMap[h]] = row[i] ?? ''; });
    return obj;
  });

  if (contacts.length === 0) {
    return NextResponse.json({ error: 'No contacts found in CSV', imported: 0 }, { status: 400 });
  }

  const res = await fetch(`${process.env.CRM_SERVICE_URL}/contacts/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ contacts }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `CRM import failed: ${err}`, imported: 0 }, { status: 500 });
  }

  const result = await res.json();
  return NextResponse.json({ imported: result.count ?? contacts.length, errors: result.errors ?? [] });
}
```

### Update: `apps/web/src/components/contacts/CsvImportDialog.tsx`
After the import fetch call, show the result:
```tsx
const result = await res.json();
if (!res.ok) {
  setError(result.error ?? 'Import failed');
  return;
}
setResult({ imported: result.imported, errors: result.errors ?? [] });
// Show success state:
// "Successfully imported 47 contacts. 3 rows had errors."
```

---

## TASK 11 — Fix Knowledge Article Markdown Rendering

### Install dependency
```bash
pnpm add react-markdown remark-gfm --filter web
```

### File: `apps/web/src/app/(dashboard)/knowledge/[id]/page.tsx`
Replace raw `{article.body}` rendering with:

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// In JSX:
<div className="prose prose-gray max-w-none">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {article.body ?? ''}
  </ReactMarkdown>
</div>
```

Also fix the "Use in email" button:
```tsx
<button
  onClick={() => {
    const summary = article.body?.slice(0, 500) ?? '';
    navigator.clipboard.writeText(summary)
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => toast.error('Could not copy'));
  }}
  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
>
  <Copy className="w-4 h-4" /> Use in email
</button>
```

---

## TASK 12 — Fix Kanban RTL Mode

### File: `apps/web/src/app/(dashboard)/deals/page.tsx` (or wherever the Kanban renders)
Find the kanban column layout. Replace directional CSS with logical properties:

```tsx
// OLD (breaks in RTL):
<div className="flex gap-4 overflow-x-auto pl-4">
  {stages.map(stage => (
    <div key={stage.id} className="flex-none w-72 mr-4">

// NEW (works in both LTR and RTL):
<div className="flex gap-4 overflow-x-auto ps-4">
  {stages.map(stage => (
    <div key={stage.id} className="flex-none w-72">
```

Also ensure the kanban card actions use `start`/`end` instead of `left`/`right`:
- Replace `text-left` → `text-start`
- Replace `ml-` → `ms-`, `mr-` → `me-`
- Replace `pl-` → `ps-`, `pr-` → `pe-`
- Replace `border-l-` → `border-s-`, `border-r-` → `border-e-`

---

## TASK 13 — Create Rep Detail Page

### File: `apps/web/src/app/(dashboard)/reports/rep/[id]/page.tsx`
```tsx
import { notFound } from 'next/navigation';

interface RepStats {
  id: string; name: string; email: string; avatar?: string;
  quota: number; revenue: number; deals: number; winRate: number;
  activities: { calls: number; emails: number; meetings: number };
  recentDeals: { id: string; name: string; value: number; stage: string; closedAt?: string }[];
}

export default async function RepDetailPage({ params }: { params: { id: string } }) {
  // In production: fetch from planning-service + crm-service
  // For now: show the structure with loading states
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <a href="/reports/manager" className="text-sm text-blue-600 hover:text-blue-700">← Back to Manager Dashboard</a>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Rep Performance</h1>
        <p className="text-sm text-gray-500">Individual scorecard for rep ID: {params.id}</p>
      </div>
      {/* Quota progress, activity breakdown, deal list — to be wired in Prompt 20 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-gray-500 text-sm">Full rep detail view will be wired in Prompt 20 (Data Wiring sprint).</p>
      </div>
    </div>
  );
}
```

---

## TASK 14 — Create Activities Page

### File: `apps/web/src/app/(dashboard)/activities/page.tsx`
```tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { Phone, Mail, Calendar, FileText, MessageSquare } from 'lucide-react';
import { useState } from 'react';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="w-4 h-4 text-green-600" />,
  email: <Mail className="w-4 h-4 text-blue-600" />,
  meeting: <Calendar className="w-4 h-4 text-purple-600" />,
  note: <FileText className="w-4 h-4 text-gray-600" />,
  task: <MessageSquare className="w-4 h-4 text-orange-600" />,
};

export default function ActivitiesPage() {
  const [filter, setFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['activities', filter],
    queryFn: () => fetch(`/api/activities?type=${filter}`).then(r => r.json()),
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity Feed</h1>
        <div className="flex gap-2">
          {['all', 'call', 'email', 'meeting', 'note', 'task'].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition
                ${filter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {(data?.activities ?? []).map((act: any) => (
            <div key={act.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
              <div className="mt-0.5 p-2 bg-gray-50 rounded-lg">{TYPE_ICONS[act.type] ?? TYPE_ICONS.note}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{act.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{act.contactName ?? 'No contact'} · {act.dealName ? `Deal: ${act.dealName}` : 'No deal'}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{new Date(act.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
          {data?.activities?.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No activities yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### File: `apps/web/src/app/api/activities/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const type = req.nextUrl.searchParams.get('type') ?? 'all';
  const res = await fetch(
    `${process.env.CRM_SERVICE_URL}/activities?type=${type}&userId=${session.user.sub}`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } }
  );
  return NextResponse.json(await res.json(), { status: res.status });
}
```

---

## Verification Checklist
- [ ] `/cadences/[id]` email step editor renders without console errors
- [ ] Tiptap toolbar shows Bold/Italic/List and token insertion buttons
- [ ] `/cadences/[id]/enroll` submits email list and navigates on success
- [ ] `/admin/users` PATCH does not 500 (session bug fixed)
- [ ] `/admin/flags` toggles save without 404
- [ ] `/products` create modal successfully creates a product
- [ ] `/deals/[id]` Products tab shows searchable product dropdown
- [ ] `/contacts/[id]/portal` renders portal management UI
- [ ] `/portal/settings` renders branding settings form
- [ ] `/commissions` what-if chart renders without crashing
- [ ] `POST /api/contacts/duplicates/scan` returns 200 (or 503 if service unavailable)
- [ ] CSV import shows success count or specific error message (no silent failure)
- [ ] Knowledge article renders formatted markdown (bold, lists, headings)
- [ ] Kanban columns render correctly in RTL direction (no collapse)
- [ ] `/reports/rep/[id]` renders without 404
- [ ] `/activities` renders activity feed with type filter
