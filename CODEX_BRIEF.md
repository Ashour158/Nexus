# Codex Brief — NEXUS CRM Remaining Items

**Repo:** `C:\Users\Ahmed Ashour\Nexus`
**Stack:** Next.js 14 App Router + Fastify 4 + Node.js 20 + TypeScript ESM

Do NOT modify `services/ai-service/`. Do NOT add aiScore/aiWinProbability/aiInsights. Do NOT commit.

---

## Task 1 — F4: email.node.ts startup warning

**File:** `services/workflow-service/src/engine/nodes/email.node.ts`

Current line 13:
```ts
const base = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3003/api/v1';
```

After this line, add:
```ts
if (!process.env.NOTIFICATION_SERVICE_URL) {
  console.warn('[email.node] NOTIFICATION_SERVICE_URL is not set — falling back to localhost:3003');
}
```

That's the entire change for this file.

---

## Task 2 — P1-12: Kafka topic bootstrap script

**Create file:** `scripts/bootstrap-kafka-topics.ts`

```typescript
#!/usr/bin/env tsx
/**
 * Bootstrap Kafka topics with proper partition count and replication factor.
 * Run once on cluster setup: pnpm tsx scripts/bootstrap-kafka-topics.ts
 */
import { Kafka } from 'kafkajs';

const BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const REPLICATION_FACTOR = Number(process.env.KAFKA_REPLICATION_FACTOR ?? '1');
const DEFAULT_PARTITIONS = 6;

const TOPICS = [
  { topic: 'nexus.crm.leads',              numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.crm.contacts',           numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.crm.accounts',           numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.crm.deals',              numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.crm.activities',         numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.finance.quotes',         numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.finance.invoices',       numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.finance.payments',       numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.finance.contracts',      numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.finance.commissions',    numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.automation.workflows',   numPartitions: 3 },
  { topic: 'nexus.integration.events',     numPartitions: 3 },
  { topic: 'nexus.blueprint.events',       numPartitions: 3 },
  { topic: 'nexus.platform.notifications', numPartitions: 3 },
  { topic: 'nexus.comms.emails',           numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.comms.calls',            numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.analytics.events',       numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.compliance.audit',       numPartitions: 3 },
];

async function main() {
  const kafka = new Kafka({ clientId: 'topic-bootstrap', brokers: BROKERS });
  const admin = kafka.admin();

  await admin.connect();
  console.log('Connected to Kafka at:', BROKERS.join(', '));

  const existing = new Set(await admin.listTopics());
  const toCreate = TOPICS.filter(t => !existing.has(t.topic)).map(t => ({
    ...t,
    replicationFactor: REPLICATION_FACTOR,
  }));

  if (toCreate.length === 0) {
    console.log('All topics already exist — nothing to do.');
    await admin.disconnect();
    return;
  }

  console.log(`Creating ${toCreate.length} topics:`, toCreate.map(t => t.topic).join(', '));
  await admin.createTopics({ topics: toCreate, waitForLeaders: true });
  console.log('Topics created successfully.');

  await admin.disconnect();
}

main().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
```

Also add to `Makefile` (append after the last target):
```makefile
kafka-topics: ## Bootstrap Kafka topics with correct partition/RF config
	pnpm tsx scripts/bootstrap-kafka-topics.ts
```

---

## Task 3 — i18n: Expand en.json to full coverage

**File:** `apps/web/messages/en.json`

Replace the entire file with this expanded version covering all 32 modules the UI uses:

```json
{
  "nav": {
    "dashboard": "Dashboard",
    "contacts": "Contacts",
    "leads": "Leads",
    "deals": "Deals",
    "accounts": "Accounts",
    "activities": "Activities",
    "reports": "Reports",
    "analytics": "Analytics",
    "calendar": "Calendar",
    "invoices": "Invoices",
    "quotes": "Quotes",
    "contracts": "Contracts",
    "products": "Products",
    "workflows": "Workflows",
    "cadences": "Cadences",
    "territories": "Territories",
    "planning": "Planning",
    "approvals": "Approvals",
    "knowledge": "Knowledge Base",
    "incentives": "Incentives",
    "portal": "Portal",
    "chatbot": "Assistant",
    "integrations": "Integrations",
    "settings": "Settings",
    "documents": "Documents",
    "billing": "Billing"
  },
  "common": {
    "save": "Save Changes",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "search": "Search...",
    "loading": "Loading...",
    "noResults": "No results found.",
    "actions": "Actions",
    "status": "Status",
    "date": "Date",
    "name": "Name",
    "email": "Email",
    "phone": "Phone",
    "company": "Company",
    "amount": "Amount",
    "currency": "Currency",
    "description": "Description",
    "notes": "Notes",
    "tags": "Tags",
    "owner": "Owner",
    "createdAt": "Created",
    "updatedAt": "Updated",
    "yes": "Yes",
    "no": "No",
    "confirm": "Confirm",
    "close": "Close",
    "submit": "Submit",
    "back": "Back",
    "next": "Next",
    "previous": "Previous",
    "view": "View",
    "download": "Download",
    "upload": "Upload",
    "copy": "Copy",
    "copied": "Copied!",
    "export": "Export",
    "import": "Import",
    "filter": "Filter",
    "sort": "Sort",
    "refresh": "Refresh",
    "select": "Select",
    "selectAll": "Select All",
    "clear": "Clear",
    "apply": "Apply",
    "reset": "Reset",
    "total": "Total",
    "page": "Page",
    "of": "of",
    "rows": "rows",
    "rowsPerPage": "Rows per page",
    "required": "Required",
    "optional": "Optional",
    "active": "Active",
    "inactive": "Inactive",
    "enabled": "Enabled",
    "disabled": "Disabled",
    "success": "Success",
    "error": "Error",
    "warning": "Warning",
    "info": "Info"
  },
  "dashboard": {
    "title": "Dashboard",
    "welcome": "Welcome back, {name}",
    "totalRevenue": "Total Revenue",
    "openDeals": "Open Deals",
    "newLeads": "New Leads",
    "activitiesThisWeek": "Activities This Week",
    "pipelineValue": "Pipeline Value",
    "winRate": "Win Rate",
    "avgDealSize": "Avg Deal Size",
    "quotaAttainment": "Quota Attainment",
    "recentActivity": "Recent Activity",
    "upcomingTasks": "Upcoming Tasks",
    "topDeals": "Top Deals",
    "noActivity": "No recent activity"
  },
  "deals": {
    "title": "Deals",
    "newDeal": "New Deal",
    "pipeline": "Pipeline",
    "value": "Deal Value",
    "stage": "Stage",
    "closeDate": "Close Date",
    "probability": "Probability",
    "owner": "Owner",
    "account": "Account",
    "contact": "Contact",
    "source": "Lead Source",
    "type": "Deal Type",
    "priority": "Priority",
    "wonAt": "Won At",
    "lostAt": "Lost At",
    "lostReason": "Lost Reason",
    "kanban": "Kanban",
    "list": "List",
    "moveTo": "Move to",
    "markWon": "Mark as Won",
    "markLost": "Mark as Lost",
    "addProduct": "Add Product",
    "noDeals": "No deals found.",
    "forecast": "Forecast",
    "rotting": "Rotting",
    "rottingDays": "{days} days without activity"
  },
  "contacts": {
    "title": "Contacts",
    "newContact": "New Contact",
    "firstName": "First Name",
    "lastName": "Last Name",
    "jobTitle": "Job Title",
    "lastActivity": "Last Activity",
    "lifecycle": "Lifecycle Stage",
    "source": "Source",
    "linkedIn": "LinkedIn",
    "twitter": "Twitter",
    "website": "Website",
    "address": "Address",
    "noContacts": "No contacts found.",
    "merge": "Merge Contacts",
    "import": "Import Contacts",
    "export": "Export Contacts"
  },
  "leads": {
    "title": "Leads",
    "newLead": "New Lead",
    "score": "Lead Score",
    "status": "Status",
    "source": "Source",
    "assignedTo": "Assigned To",
    "convertedAt": "Converted At",
    "qualify": "Qualify",
    "disqualify": "Disqualify",
    "convert": "Convert to Deal",
    "noLeads": "No leads found.",
    "hot": "Hot",
    "warm": "Warm",
    "cold": "Cold",
    "new": "New",
    "contacted": "Contacted",
    "qualified": "Qualified",
    "disqualified": "Disqualified",
    "converted": "Converted"
  },
  "accounts": {
    "title": "Accounts",
    "newAccount": "New Account",
    "industry": "Industry",
    "size": "Company Size",
    "revenue": "Annual Revenue",
    "type": "Account Type",
    "website": "Website",
    "billingAddress": "Billing Address",
    "shippingAddress": "Shipping Address",
    "healthScore": "Health Score",
    "noAccounts": "No accounts found.",
    "customer": "Customer",
    "prospect": "Prospect",
    "partner": "Partner",
    "competitor": "Competitor"
  },
  "activities": {
    "title": "Activities",
    "newActivity": "Log Activity",
    "type": "Type",
    "subject": "Subject",
    "duration": "Duration",
    "outcome": "Outcome",
    "scheduledAt": "Scheduled At",
    "completedAt": "Completed At",
    "call": "Call",
    "email": "Email",
    "meeting": "Meeting",
    "task": "Task",
    "note": "Note",
    "demo": "Demo",
    "other": "Other",
    "noActivities": "No activities yet.",
    "logCall": "Log Call",
    "scheduleTask": "Schedule Task"
  },
  "quotes": {
    "title": "Quotes",
    "newQuote": "New Quote",
    "number": "Quote Number",
    "validUntil": "Valid Until",
    "discount": "Discount",
    "tax": "Tax",
    "subtotal": "Subtotal",
    "total": "Total",
    "lineItems": "Line Items",
    "addItem": "Add Item",
    "product": "Product",
    "quantity": "Quantity",
    "unitPrice": "Unit Price",
    "draft": "Draft",
    "sent": "Sent",
    "accepted": "Accepted",
    "declined": "Declined",
    "expired": "Expired",
    "send": "Send Quote",
    "accept": "Accept",
    "decline": "Decline",
    "noQuotes": "No quotes found."
  },
  "invoices": {
    "title": "Invoices",
    "newInvoice": "New Invoice",
    "number": "Invoice Number",
    "dueDate": "Due Date",
    "paidAt": "Paid At",
    "subtotal": "Subtotal",
    "tax": "Tax",
    "total": "Total",
    "draft": "Draft",
    "open": "Open",
    "paid": "Paid",
    "overdue": "Overdue",
    "voided": "Voided",
    "send": "Send Invoice",
    "recordPayment": "Record Payment",
    "noInvoices": "No invoices found."
  },
  "contracts": {
    "title": "Contracts",
    "newContract": "New Contract",
    "number": "Contract Number",
    "startDate": "Start Date",
    "endDate": "End Date",
    "autoRenew": "Auto-Renew",
    "renewalTermDays": "Renewal Term (Days)",
    "totalValue": "Total Value",
    "terms": "Terms",
    "draft": "Draft",
    "active": "Active",
    "expired": "Expired",
    "terminated": "Terminated",
    "sign": "Sign Contract",
    "terminate": "Terminate",
    "noContracts": "No contracts found."
  },
  "products": {
    "title": "Products",
    "newProduct": "New Product",
    "sku": "SKU",
    "price": "Price",
    "category": "Category",
    "taxable": "Taxable",
    "active": "Active",
    "noProducts": "No products found.",
    "pricebook": "Price Book",
    "kits": "Product Kits",
    "vendor": "Vendor"
  },
  "workflows": {
    "title": "Workflows",
    "newWorkflow": "New Workflow",
    "trigger": "Trigger",
    "actions": "Actions",
    "conditions": "Conditions",
    "active": "Active",
    "inactive": "Inactive",
    "draft": "Draft",
    "lastRun": "Last Run",
    "runCount": "Run Count",
    "noWorkflows": "No workflows found.",
    "enable": "Enable",
    "disable": "Disable",
    "runNow": "Run Now",
    "history": "Run History"
  },
  "cadences": {
    "title": "Cadences",
    "newCadence": "New Cadence",
    "steps": "Steps",
    "enrolled": "Enrolled",
    "completed": "Completed",
    "enroll": "Enroll Contacts",
    "pause": "Pause",
    "resume": "Resume",
    "noCadences": "No cadences found.",
    "step": "Step {n}",
    "delay": "Wait {days} days"
  },
  "approvals": {
    "title": "Approvals",
    "pending": "Pending",
    "approved": "Approved",
    "rejected": "Rejected",
    "requestedBy": "Requested By",
    "requestedAt": "Requested At",
    "reviewedAt": "Reviewed At",
    "reviewedBy": "Reviewed By",
    "reason": "Reason",
    "approve": "Approve",
    "reject": "Reject",
    "noApprovals": "No pending approvals."
  },
  "documents": {
    "title": "Documents",
    "upload": "Upload Document",
    "name": "File Name",
    "size": "Size",
    "type": "Type",
    "uploadedBy": "Uploaded By",
    "uploadedAt": "Uploaded At",
    "download": "Download",
    "delete": "Delete",
    "noDocuments": "No documents yet.",
    "dragDrop": "Drag and drop files here, or click to browse",
    "maxSize": "Max file size: {size}MB"
  },
  "reports": {
    "title": "Reports",
    "performance": "Sales Performance",
    "pipeline": "Pipeline Report",
    "activities": "Activity Report",
    "revenue": "Revenue Report",
    "forecast": "Forecast",
    "period": "Period",
    "thisMonth": "This Month",
    "lastMonth": "Last Month",
    "thisQuarter": "This Quarter",
    "lastQuarter": "Last Quarter",
    "thisYear": "This Year",
    "custom": "Custom Range",
    "noData": "No data available for this period.",
    "exportCsv": "Export CSV"
  },
  "analytics": {
    "title": "Analytics",
    "overview": "Overview",
    "trends": "Trends",
    "leaderboard": "Leaderboard",
    "winLoss": "Win/Loss Analysis",
    "conversionRate": "Conversion Rate",
    "avgCycleLength": "Avg Sales Cycle",
    "topPerformers": "Top Performers",
    "noData": "No analytics data available."
  },
  "calendar": {
    "title": "Calendar",
    "today": "Today",
    "week": "Week",
    "month": "Month",
    "day": "Day",
    "newEvent": "New Event",
    "noEvents": "No events today.",
    "allDay": "All Day"
  },
  "territories": {
    "title": "Territories",
    "newTerritory": "New Territory",
    "region": "Region",
    "assignedTo": "Assigned To",
    "noTerritories": "No territories defined."
  },
  "planning": {
    "title": "Sales Planning",
    "quota": "Quota",
    "target": "Target",
    "attainment": "Attainment",
    "period": "Period",
    "noPlans": "No plans found."
  },
  "incentives": {
    "title": "Incentives",
    "commissions": "Commissions",
    "bonuses": "Bonuses",
    "earned": "Earned",
    "pending": "Pending",
    "paid": "Paid",
    "noIncentives": "No incentive records found."
  },
  "knowledge": {
    "title": "Knowledge Base",
    "search": "Search articles...",
    "newArticle": "New Article",
    "category": "Category",
    "noArticles": "No articles found."
  },
  "portal": {
    "title": "Customer Portal",
    "inviteCustomer": "Invite Customer",
    "portalUrl": "Portal URL",
    "noPortalAccess": "No portal access configured."
  },
  "integrations": {
    "title": "Integrations",
    "connected": "Connected",
    "notConnected": "Not Connected",
    "connect": "Connect",
    "disconnect": "Disconnect",
    "configure": "Configure",
    "noIntegrations": "No integrations available."
  },
  "settings": {
    "title": "Settings",
    "profile": "Profile",
    "team": "Team",
    "billing": "Billing",
    "integrations": "Integrations",
    "language": "Language",
    "currency": "Default Currency",
    "timezone": "Timezone",
    "security": "Security",
    "notifications": "Notifications",
    "apiKeys": "API Keys",
    "localization": "Localization",
    "mfa": "Two-Factor Authentication",
    "mfaEnabled": "MFA Enabled",
    "mfaDisabled": "MFA Disabled",
    "enableMfa": "Enable MFA",
    "disableMfa": "Disable MFA",
    "inviteMember": "Invite Member",
    "removeMember": "Remove Member",
    "role": "Role",
    "generateKey": "Generate Key",
    "revokeKey": "Revoke Key",
    "keyName": "Key Name"
  },
  "billing": {
    "title": "Billing",
    "plan": "Current Plan",
    "upgrade": "Upgrade",
    "downgrade": "Downgrade",
    "nextBilling": "Next Billing Date",
    "paymentMethod": "Payment Method",
    "invoices": "Billing Invoices",
    "cancelPlan": "Cancel Plan",
    "noBilling": "No billing information."
  },
  "feedback": {
    "title": "Send Feedback",
    "placeholder": "Tell us what you think or report a bug...",
    "submit": "Submit",
    "thankYou": "Thank you for your feedback!",
    "type": "Type",
    "bug": "Bug Report",
    "feature": "Feature Request",
    "general": "General"
  },
  "errors": {
    "notFound": "Page not found",
    "unauthorized": "You don't have permission to view this",
    "serverError": "Something went wrong. Please try again.",
    "networkError": "Network error. Check your connection.",
    "sessionExpired": "Your session has expired. Please log in again.",
    "validationError": "Please check your inputs and try again."
  },
  "auth": {
    "signIn": "Sign In",
    "signOut": "Sign Out",
    "email": "Email address",
    "password": "Password",
    "forgotPassword": "Forgot password?",
    "resetPassword": "Reset Password",
    "newPassword": "New Password",
    "confirmPassword": "Confirm Password"
  }
}
```

---

## Task 4 — E5: Replace window.prompt / window.alert in settings page

**File:** `apps/web/src/app/(dashboard)/settings/page.tsx`

### 4a. Replace MFA window.prompt with Dialog

Find the `SecurityTab` function. It currently has:
```tsx
const code = window.prompt(`Scan the QR code at ${setup.qrCodeUrl} then enter the 6-digit code:`);
```
and:
```tsx
const code = window.prompt('Enter your current 6-digit MFA code to disable:');
```

**Add these state variables at the top of SecurityTab:**
```tsx
const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
const [mfaDisableDialogOpen, setMfaDisableDialogOpen] = useState(false);
const [mfaQrUrl, setMfaQrUrl] = useState('');
const [mfaCode, setMfaCode] = useState('');
```

**Rewrite handleEnable:**
```tsx
const handleEnable = async () => {
  try {
    const setup = await setupMfa.mutateAsync();
    setMfaQrUrl(setup.qrCodeUrl);
    setMfaCode('');
    setMfaDialogOpen(true);
  } catch {
    // errors already toasted
  }
};
```

**Add a confirmEnable function:**
```tsx
const confirmEnable = async () => {
  if (!mfaCode) return;
  try {
    await enableMfa.mutateAsync({ code: mfaCode });
    setMfaDialogOpen(false);
    setMfaCode('');
  } catch {
    // errors already toasted
  }
};
```

**Rewrite handleDisable:**
```tsx
const handleDisable = async () => {
  setMfaCode('');
  setMfaDisableDialogOpen(true);
};
```

**Add a confirmDisable function:**
```tsx
const confirmDisable = async () => {
  if (!mfaCode) return;
  try {
    await disableMfa.mutateAsync({ code: mfaCode });
    setMfaDisableDialogOpen(false);
    setMfaCode('');
  } catch {
    // errors already toasted
  }
};
```

**Add two Dialog components at the end of the SecurityTab JSX return, before the closing `</div>`:**

```tsx
{/* MFA Enable Dialog */}
<Dialog open={mfaDialogOpen} onOpenChange={setMfaDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Set up two-factor authentication</DialogTitle>
      <DialogDescription>
        Scan the QR code with Google Authenticator or Authy, then enter the 6-digit code.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-2">
      {mfaQrUrl && (
        <div className="flex justify-center">
          <img src={mfaQrUrl} alt="MFA QR Code" className="w-40 h-40 rounded-lg border" />
        </div>
      )}
      <Input
        placeholder="Enter 6-digit code"
        value={mfaCode}
        onChange={e => setMfaCode(e.target.value)}
        maxLength={6}
        className="text-center text-lg tracking-widest font-mono"
        onKeyDown={e => { if (e.key === 'Enter') void confirmEnable(); }}
      />
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setMfaDialogOpen(false)}>Cancel</Button>
      <Button onClick={() => void confirmEnable()} disabled={mfaCode.length < 6}>Verify & Enable</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

{/* MFA Disable Dialog */}
<Dialog open={mfaDisableDialogOpen} onOpenChange={setMfaDisableDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Disable two-factor authentication</DialogTitle>
      <DialogDescription>
        Enter your current 6-digit MFA code to confirm.
      </DialogDescription>
    </DialogHeader>
    <div className="py-2">
      <Input
        placeholder="Enter 6-digit code"
        value={mfaCode}
        onChange={e => setMfaCode(e.target.value)}
        maxLength={6}
        className="text-center text-lg tracking-widest font-mono"
        onKeyDown={e => { if (e.key === 'Enter') void confirmDisable(); }}
      />
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setMfaDisableDialogOpen(false)}>Cancel</Button>
      <Button variant="destructive" onClick={() => void confirmDisable()} disabled={mfaCode.length < 6}>Disable MFA</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Make sure these shadcn/ui imports are at the top of the file (add if not already there):**
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
```

### 4b. Replace window.alert for API key with Dialog

Find `ApiKeysTab`. It currently has:
```tsx
window.alert(`Your new API key:\n\n${created.key}\n\nCopy it now — it won't be shown again.`);
```

**Add to ApiKeysTab's state:**
```tsx
const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
const [createdKey, setCreatedKey] = useState('');
```

**Replace the window.alert line with:**
```tsx
setCreatedKey(created.key);
setNewKeyDialogOpen(true);
```

**Add Dialog at end of ApiKeysTab JSX (before closing tag):**
```tsx
<Dialog open={newKeyDialogOpen} onOpenChange={setNewKeyDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>API key created</DialogTitle>
      <DialogDescription>
        Copy this key now — it won't be shown again.
      </DialogDescription>
    </DialogHeader>
    <div className="py-2">
      <div className="flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-2">
        <code className="flex-1 font-mono text-sm break-all text-gray-800">{createdKey}</code>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { void navigator.clipboard.writeText(createdKey); }}
        >
          Copy
        </Button>
      </div>
    </div>
    <DialogFooter>
      <Button onClick={() => { setNewKeyDialogOpen(false); setCreatedKey(''); }}>Done</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Task 5 — E6: Fetch real integration connection state

**File:** `apps/web/src/app/(dashboard)/settings/page.tsx`

Find `IntegrationsTab`. Currently it uses:
```tsx
const [emailConnected, setEmailConnected] = useState(false);
const [esignConnected, setEsignConnected] = useState(false);
useEffect(() => {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const connected = params.get('connected');
  if (connected === 'gmail') setEmailConnected(true);
  if (connected === 'docusign') setEsignConnected(true);
}, []);
```

**Replace the state + effect with a TanStack Query fetch:**

Add this import at the top of the file (with other hook imports):
```tsx
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
```

**Replace the state block in IntegrationsTab with:**
```tsx
const accessToken = useAuthStore(s => s.accessToken);

const { data: emailConn } = useQuery({
  queryKey: ['email-connection'],
  queryFn: async () => {
    const res = await fetch('/api/email/connection', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { connected: false };
    return res.json() as Promise<{ connected: boolean }>;
  },
  enabled: !!accessToken,
  staleTime: 30_000,
});

const { data: esignConn } = useQuery({
  queryKey: ['esign-connection'],
  queryFn: async () => {
    const res = await fetch('/api/esign/connection', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { connected: false };
    return res.json() as Promise<{ connected: boolean }>;
  },
  enabled: !!accessToken,
  staleTime: 30_000,
});

const emailConnected = emailConn?.connected ?? false;
const esignConnected = esignConn?.connected ?? false;

// Still handle the OAuth callback redirect param
useEffect(() => {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const connected = params.get('connected');
  // The redirect sets the param — the next query refetch will show the real state.
  // Remove the param from the URL to keep it clean.
  if (connected) {
    const url = new URL(window.location.href);
    url.searchParams.delete('connected');
    window.history.replaceState({}, '', url.toString());
  }
}, []);
```

---

## Verification

After all changes, run:
```
cd C:\Users\Ahmed Ashour\Nexus
pnpm tsc --noEmit -p apps/web/tsconfig.json
```

Fix any TypeScript errors. Do NOT commit.
