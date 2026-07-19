#!/usr/bin/env node
// @ts-check
import { pathToFileURL } from 'node:url';
/**
 * seed-demo-live.mjs — populate a RUNNING Nexus instance with realistic demo
 * data by calling the live HTTP APIs with an admin token.
 *
 * Because it authenticates as the admin and hits the real services, everything
 * lands in the admin's tenant and exercises the actual create logic (validation,
 * events/outbox, scoring, audit) — not a DB-level shortcut.
 *
 * Node built-ins only (global fetch, no deps). ESM.
 *
 * ── Run (on the server, defaults target localhost) ─────────────────────────────
 *   node scripts/seed-demo-live.mjs
 *
 * ── Env overrides (all optional) ───────────────────────────────────────────────
 *   AUTH      (default http://localhost:3000)   auth-service
 *   CRM       (default http://localhost:3001)   crm-service
 *   FINANCE   (default http://localhost:3002)   finance-service
 *   METADATA  (default http://localhost:3004)   metadata-service
 *   WORKFLOW  (default http://localhost:3007)   workflow-service
 *   EMAIL     (default admin@demo.com)
 *   PASSWORD  (required; no default)
 *
 * Every service call is `${BASE}/api/v1/<path>`. All responses are the standard
 * `{ success, data }` envelope.
 *
 * Idempotent-ish: 409/duplicate is tolerated; ANY create failure is logged
 * (status + short body snippet) and the seed continues — it never aborts.
 */

// ─── Config ────────────────────────────────────────────────────────────────────
const CFG = {
  AUTH: process.env.AUTH || 'http://localhost:3000',
  CRM: process.env.CRM || 'http://localhost:3001',
  FINANCE: process.env.FINANCE || 'http://localhost:3002',
  METADATA: process.env.METADATA || 'http://localhost:3004',
  WORKFLOW: process.env.WORKFLOW || 'http://localhost:3007',
  EMAIL: process.env.EMAIL || 'admin@demo.com',
  PASSWORD: process.env.PASSWORD,
};

let TOKEN = '';
let OWNER_ID = '';

const summary = {
  pipelines: 0,
  stages: 0,
  accounts: 0,
  contacts: 0,
  leads: 0,
  deals: 0,
  activities: 0,
  users: 0,
  quotes: 0,
  failures: 0,
};

// ─── Tiny helpers ──────────────────────────────────────────────────────────────
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
/** ISO datetime `daysFromNow` days away (negative = past). */
function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
const SENSITIVE_KEYS = /^(password|token|accessToken|refreshToken|authorization|cookie|secret)$/i;

export function redactSensitive(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redactSensitive(item, seen),
  ]));
}

export function snippet(s, n = 300) {
  let value = s;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { /* retain useful non-JSON context */ }
  }
  const redacted = redactSensitive(value);
  const str = typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
  return str && str.length > n ? `${str.slice(0, n)}…` : str;
}

function requirePassword() {
  if (typeof CFG.PASSWORD !== 'string' || CFG.PASSWORD.length === 0) {
    throw new Error('PASSWORD is required. Set the PASSWORD environment variable and run the seed again.');
  }
}

/**
 * Core request helper. Returns { ok, status, body }.
 * `base` is one of CFG's service URLs; `path` is appended after `/api/v1`.
 */
async function api(method, base, path, body, headers = {}) {
  const url = `${base}/api/v1${path}`;
  const opts = {
    method,
    headers: {
      'content-type': 'application/json',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      ...headers,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    return { ok: false, status: 0, body: { networkError: String(err) } };
  }
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

/** Extract an id from the various envelope shapes create endpoints return. */
function pickId(resBody) {
  const d = resBody?.data ?? resBody;
  return d?.id ?? d?.data?.id ?? undefined;
}

/**
 * Create-or-tolerate wrapper. Logs one line per record. On non-2xx it records a
 * failure (unless it's a tolerable 409/dup) and returns null so the caller
 * keeps going.
 * @returns the created id, or null on failure.
 */
async function create(label, base, path, payload) {
  const res = await api('POST', base, path, payload);
  if (res.ok) {
    const id = pickId(res.body);
    log(`  ✓ ${label} -> ${id ?? '(no id)'}`);
    return id ?? null;
  }
  const dup =
    res.status === 409 ||
    /exist|duplicate|conflict/i.test(JSON.stringify(res.body?.error ?? res.body ?? ''));
  if (dup) {
    warn(`  ~ ${label} skipped (${res.status} duplicate/conflict)`);
    return null;
  }
  summary.failures += 1;
  warn(`  ✗ ${label} FAILED [${res.status}] ${snippet(res.body?.error ?? res.body)}`);
  return null;
}

// ─── Demo data pools ─────────────────────────────────────────────────────────
const COMPANIES = [
  { name: 'Acme Robotics', industry: 'Manufacturing', domain: 'acmerobotics.com', city: 'Detroit', country: 'USA' },
  { name: 'Nimbus Cloud Systems', industry: 'Technology', domain: 'nimbuscloud.io', city: 'San Francisco', country: 'USA' },
  { name: 'Meridian Health Group', industry: 'Healthcare', domain: 'meridianhealth.com', city: 'Boston', country: 'USA' },
  { name: 'Larkspur Financial', industry: 'Financial Services', domain: 'larkspurfin.com', city: 'New York', country: 'USA' },
  { name: 'Vantage Logistics', industry: 'Transportation', domain: 'vantagelogistics.com', city: 'Chicago', country: 'USA' },
  { name: 'Orchid Retail Group', industry: 'Retail', domain: 'orchidretail.com', city: 'Austin', country: 'USA' },
  { name: 'Brightwave Energy', industry: 'Energy', domain: 'brightwave-energy.com', city: 'Houston', country: 'USA' },
  { name: 'Sterling Education', industry: 'Education', domain: 'sterlingedu.org', city: 'Seattle', country: 'USA' },
  { name: 'Cobalt Media Networks', industry: 'Media', domain: 'cobaltmedia.tv', city: 'Los Angeles', country: 'USA' },
  { name: 'Pinnacle Construction', industry: 'Construction', domain: 'pinnaclebuild.com', city: 'Denver', country: 'USA' },
];

const ACCOUNT_TYPES = ['PROSPECT', 'CUSTOMER', 'PARTNER'];
const ACCOUNT_TIERS = ['SMB', 'MID_MARKET', 'ENTERPRISE', 'STRATEGIC'];

const FIRST_NAMES = ['James', 'Maria', 'David', 'Sarah', 'Michael', 'Aisha', 'Robert', 'Elena', 'Daniel', 'Priya', 'Thomas', 'Grace', 'Omar', 'Nina', 'Carlos', 'Yuki'];
const LAST_NAMES = ['Anderson', 'Nguyen', 'Patel', 'Johnson', 'Garcia', 'Khan', 'Williams', 'Rossi', 'Kim', 'Okafor', 'Muller', 'Silva', 'Cohen', 'Tanaka', 'Brown', 'Lopez'];
const JOB_TITLES = ['CEO', 'CFO', 'VP Sales', 'Head of Procurement', 'IT Director', 'Operations Manager', 'Product Lead', 'Chief Marketing Officer', 'Finance Manager', 'Solutions Architect'];
const DEPARTMENTS = ['Executive', 'Finance', 'Sales', 'Procurement', 'IT', 'Operations', 'Product', 'Marketing'];

const LEAD_SOURCES = ['WEB_FORM', 'EMAIL_CAMPAIGN', 'SOCIAL_MEDIA', 'PAID_ADS', 'REFERRAL', 'PARTNER', 'EVENT'];
const LEAD_RATINGS = ['HOT', 'WARM', 'COLD'];

const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'NOTE'];

const DESIRED_STAGES = [
  { name: 'Prospecting', probability: 10, isWon: false, isLost: false },
  { name: 'Qualification', probability: 25, isWon: false, isLost: false },
  { name: 'Proposal', probability: 50, isWon: false, isLost: false },
  { name: 'Negotiation', probability: 75, isWon: false, isLost: false },
  { name: 'Closed Won', probability: 100, isWon: true, isLost: false },
  { name: 'Closed Lost', probability: 0, isWon: false, isLost: true },
];

// ─── Step 1 — Login ─────────────────────────────────────────────────────────
async function login() {
  log('\n[1] Login');
  const res = await api('POST', CFG.AUTH, '/auth/login', {
    email: CFG.EMAIL,
    password: CFG.PASSWORD,
  });
  if (!res.ok) {
    throw new Error(`Login failed [${res.status}]: authentication was rejected.`);
  }
  const data = res.body?.data ?? {};
  if (data.mfaRequired) {
    throw new Error('Login returned mfaRequired — cannot seed non-interactively.');
  }
  TOKEN = data.accessToken;
  if (!TOKEN) throw new Error('Login succeeded but no access token was returned.');
  // Decode the JWT payload for the owner reference required by seeded records.
  const [, payloadB64] = TOKEN.split('.');
  const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  OWNER_ID = claims.sub;
  log('  ✓ authenticated');
  if (data.mustChangePassword) {
    warn('  ! account is flagged mustChangePassword — token still works for seeding.');
  }
}

// ─── Step 2 — Pipeline + stages ───────────────────────────────────────────────
/**
 * Discover an existing pipeline (reuse it + its stages) or create the standard
 * "Sales Pipeline". Returns { pipelineId, stages: [{id,name,isWon,isLost,probability}] }.
 */
async function ensurePipeline() {
  log('\n[2] Pipeline + stages');
  const list = await api('GET', CFG.CRM, '/pipelines');
  if (list.ok && Array.isArray(list.body?.data) && list.body.data.length > 0) {
    // Prefer the default pipeline; list is already ordered isDefault desc.
    const p = list.body.data.find((x) => x.isDefault) ?? list.body.data[0];
    const stages = (p.stages ?? []).map((s) => ({
      id: s.id, name: s.name, isWon: s.isWon, isLost: s.isLost, probability: s.probability,
    }));
    log(`  ✓ reusing existing pipeline "${p.name}" (${p.id}) with ${stages.length} stage(s)`);
    summary.pipelines = list.body.data.length;
    summary.stages = stages.length;
    return { pipelineId: p.id, stages };
  }

  log('  no pipeline found — creating "Sales Pipeline" with 6 stages');
  const payload = {
    name: 'Sales Pipeline',
    type: 'sales',
    currency: 'USD',
    isDefault: true,
    isActive: true,
    description: 'Standard B2B sales pipeline (demo seed)',
    stages: DESIRED_STAGES.map((s, idx) => ({
      name: s.name,
      order: idx,
      position: idx,
      probability: s.probability,
      isWon: s.isWon,
      isLost: s.isLost,
    })),
  };
  const res = await api('POST', CFG.CRM, '/pipelines', payload);
  if (!res.ok) {
    // Possibly created by an earlier run (409). Re-GET and reuse.
    warn(`  ✗ create pipeline [${res.status}] ${snippet(res.body?.error ?? res.body)} — re-fetching`);
    const again = await api('GET', CFG.CRM, '/pipelines');
    const p = again.body?.data?.[0];
    if (!p) {
      summary.failures += 1;
      throw new Error('No pipeline available and creation failed — cannot seed deals.');
    }
    const stages = (p.stages ?? []).map((s) => ({
      id: s.id, name: s.name, isWon: s.isWon, isLost: s.isLost, probability: s.probability,
    }));
    summary.pipelines = again.body.data.length;
    summary.stages = stages.length;
    return { pipelineId: p.id, stages };
  }
  const p = res.body.data;
  const stages = (p.stages ?? []).map((s) => ({
    id: s.id, name: s.name, isWon: s.isWon, isLost: s.isLost, probability: s.probability,
  }));
  log(`  ✓ created pipeline ${p.id} with ${stages.length} stages`);
  summary.pipelines = 1;
  summary.stages = stages.length;
  return { pipelineId: p.id, stages };
}

// ─── Step 3 — Accounts ────────────────────────────────────────────────────────
async function seedAccounts() {
  log('\n[3] Accounts');
  const ids = [];
  for (const c of COMPANIES) {
    const payload = {
      name: c.name,
      ownerId: OWNER_ID,
      industry: c.industry,
      type: pick(ACCOUNT_TYPES),
      tier: pick(ACCOUNT_TIERS),
      website: `https://www.${c.domain}`,
      phone: `+1-${randInt(200, 989)}-${randInt(200, 989)}-${randInt(1000, 9999)}`,
      email: `info@${c.domain}`,
      city: c.city,
      country: c.country,
      annualRevenue: randInt(2, 900) * 1_000_000,
      employeeCount: randInt(15, 12000),
      currency: 'USD',
      description: `${c.name} — ${c.industry} account (demo seed).`,
    };
    const id = await create(`account ${c.name}`, CFG.CRM, '/accounts', payload);
    if (id) {
      ids.push({ id, domain: c.domain, name: c.name });
      summary.accounts += 1;
    }
  }
  return ids;
}

// ─── Step 4 — Contacts (2–3 per account) ──────────────────────────────────────
async function seedContacts(accounts) {
  log('\n[4] Contacts');
  const byAccount = new Map(); // accountId -> [contactId]
  for (const acct of accounts) {
    const n = randInt(2, 3);
    const list = [];
    for (let i = 0; i < n; i += 1) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const payload = {
        firstName: first,
        lastName: last,
        ownerId: OWNER_ID,
        accountId: acct.id,
        email: `${first}.${last}${randInt(1, 99)}@${acct.domain}`.toLowerCase(),
        phone: `+1-${randInt(200, 989)}-${randInt(200, 989)}-${randInt(1000, 9999)}`,
        jobTitle: pick(JOB_TITLES),
        department: pick(DEPARTMENTS),
      };
      const id = await create(`contact ${first} ${last} @ ${acct.name}`, CFG.CRM, '/contacts', payload);
      if (id) {
        list.push(id);
        summary.contacts += 1;
      }
    }
    byAccount.set(acct.id, list);
  }
  return byAccount;
}

// ─── Step 5 — Leads (~12) ─────────────────────────────────────────────────────
async function seedLeads() {
  log('\n[5] Leads');
  const target = 12;
  for (let i = 0; i < target; i += 1) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const company = pick(COMPANIES);
    const payload = {
      firstName: first,
      lastName: last,
      ownerId: OWNER_ID,
      email: `${first}.${last}${randInt(1, 999)}@${company.domain}`.toLowerCase(),
      phone: `+1-${randInt(200, 989)}-${randInt(200, 989)}-${randInt(1000, 9999)}`,
      company: `${company.name} ${pick(['', 'Inc', 'LLC', 'Group'])}`.trim(),
      jobTitle: pick(JOB_TITLES),
      source: pick(LEAD_SOURCES),
      rating: pick(LEAD_RATINGS),
      industry: company.industry,
      city: company.city,
      country: company.country,
    };
    const id = await create(`lead ${first} ${last}`, CFG.CRM, '/leads', payload);
    if (id) summary.leads += 1;
  }
}

// ─── Step 6 — Deals (~15, spread across stages) ──────────────────────────────
async function seedDeals(accounts, contactsByAccount, pipeline) {
  log('\n[6] Deals');
  const target = 15;
  const stages = pipeline.stages;
  if (stages.length === 0) {
    warn('  ! no stages available — skipping deals');
    return;
  }
  const dealNouns = ['Platform Rollout', 'Annual License', 'Expansion', 'Pilot Program', 'Managed Services', 'Migration Project', 'Renewal', 'Add-on Modules', 'Enterprise Agreement', 'Support Contract'];
  for (let i = 0; i < target; i += 1) {
    const acct = pick(accounts);
    // Spread stages round-robin so every stage (incl. Won/Lost) gets deals.
    const stage = stages[i % stages.length];
    const acctContacts = contactsByAccount.get(acct.id) ?? [];
    const contactIds = acctContacts.slice(0, randInt(0, Math.min(2, acctContacts.length)));
    const closedPast = stage.isWon || stage.isLost;
    const payload = {
      name: `${acct.name} — ${pick(dealNouns)}`,
      accountId: acct.id,
      pipelineId: pipeline.pipelineId,
      stageId: stage.id,
      ownerId: OWNER_ID,
      amount: randInt(5, 500) * 1000,
      currency: 'USD',
      probability: typeof stage.probability === 'number' ? stage.probability : randInt(10, 90),
      expectedCloseDate: closedPast ? isoDaysFromNow(-randInt(1, 60)) : isoDaysFromNow(randInt(15, 120)),
      contactIds,
    };
    const id = await create(`deal "${payload.name}" [${stage.name}]`, CFG.CRM, '/deals', payload);
    if (id) summary.deals += 1;
  }
}

// ─── Step 7 — Activities (1–2 on some deals/accounts) ────────────────────────
async function seedActivities(accounts, deals) {
  log('\n[7] Activities');
  // Fetch a handful of deals we can attach to (we only kept counts above, so
  // re-list a page of deals to get real ids to relate activities to).
  const dealList = await api('GET', CFG.CRM, '/deals?limit=20');
  const dealRows = Array.isArray(dealList.body?.data?.data)
    ? dealList.body.data.data
    : Array.isArray(dealList.body?.data)
      ? dealList.body.data
      : [];

  // Activities linked to deals.
  for (const deal of dealRows.slice(0, 10)) {
    const n = randInt(1, 2);
    for (let i = 0; i < n; i += 1) {
      const type = pick(ACTIVITY_TYPES);
      const payload = {
        type,
        subject: `${type === 'NOTE' ? 'Note' : type[0] + type.slice(1).toLowerCase()} — ${deal.name ?? 'deal'}`,
        description: `Auto-seeded ${type.toLowerCase()} activity for demo data.`,
        priority: pick(['LOW', 'NORMAL', 'HIGH']),
        ownerId: OWNER_ID,
        dealId: deal.id,
        ...(type === 'CALL' || type === 'MEETING'
          ? { dueDate: isoDaysFromNow(randInt(1, 30)), duration: randInt(15, 60) }
          : {}),
      };
      const id = await create(`activity ${type} on deal ${deal.id}`, CFG.CRM, '/activities', payload);
      if (id) summary.activities += 1;
    }
  }

  // A few account-level activities.
  for (const acct of accounts.slice(0, 5)) {
    const type = pick(ACTIVITY_TYPES);
    const payload = {
      type,
      subject: `${type[0] + type.slice(1).toLowerCase()} — ${acct.name}`,
      description: `Auto-seeded ${type.toLowerCase()} for account ${acct.name}.`,
      priority: 'NORMAL',
      ownerId: OWNER_ID,
      accountId: acct.id,
      ...(type === 'CALL' || type === 'MEETING' ? { dueDate: isoDaysFromNow(randInt(1, 21)) } : {}),
    };
    const id = await create(`activity ${type} on account ${acct.name}`, CFG.CRM, '/activities', payload);
    if (id) summary.activities += 1;
  }
}

// ─── Step 8 — Users / teammates (~4) ─────────────────────────────────────────
async function seedUsers() {
  log('\n[8] Users (teammate invites)');
  // Invite requires roleIds (>=1 valid tenant role). Discover roles first.
  const rolesRes = await api('GET', CFG.AUTH, '/roles?limit=100');
  const roleRows = Array.isArray(rolesRes.body?.data?.data)
    ? rolesRes.body.data.data
    : Array.isArray(rolesRes.body?.data)
      ? rolesRes.body.data
      : [];
  if (roleRows.length === 0) {
    warn(`  ! no roles available (GET /roles -> ${rolesRes.status}) — skipping user invites.`);
    return;
  }
  // Prefer a non-admin role if we can identify one, else the first role.
  const nonAdmin = roleRows.find((r) => !/admin|owner/i.test(r.name || ''));
  const defaultRole = (nonAdmin ?? roleRows[0]).id;
  log(`  using roleId=${defaultRole} (${(nonAdmin ?? roleRows[0]).name})`);

  const teammates = [
    { firstName: 'Rachel', lastName: 'Green', email: 'rachel.green@demo.com' },
    { firstName: 'Marcus', lastName: 'Bell', email: 'marcus.bell@demo.com' },
    { firstName: 'Sofia', lastName: 'Reyes', email: 'sofia.reyes@demo.com' },
    { firstName: 'Kevin', lastName: 'Osei', email: 'kevin.osei@demo.com' },
  ];
  for (const t of teammates) {
    const payload = { ...t, roleIds: [defaultRole] };
    const res = await api('POST', CFG.AUTH, '/users/invite', payload);
    if (res.ok) {
      const d = res.body?.data ?? {};
      summary.users += 1;
      log(`  ✓ invited teammate -> ${d.id ?? '(no id)'}`);
    } else if (res.status === 409 || /exist|conflict/i.test(JSON.stringify(res.body))) {
      warn(`  ~ ${t.email} already exists (${res.status})`);
    } else {
      summary.failures += 1;
      warn(`  ✗ invite ${t.email} FAILED [${res.status}] ${snippet(res.body?.error ?? res.body)}`);
    }
  }
}

// ─── Step 9 — Quotes / RFQs (best-effort, SKIPPED) ────────────────────────────
async function seedQuotes() {
  log('\n[9] Quotes / RFQs');
  // The CPQ flow requires a quote to originate from an RFQ and walk a multi-step
  // state machine (RFQ create -> send -> review -> respond -> ready -> convert),
  // plus at least one priced product/line-item and an owning deal. That is too
  // involved to seed reliably here, so we intentionally SKIP it. The revenue
  // vertical seeding will handle CPQ depth separately.
  log('  ~ SKIPPED (CPQ requires the full RFQ->quote state machine; out of scope for this seed).');
}

// ─── Orchestrate ──────────────────────────────────────────────────────────────
async function main() {
  requirePassword();
  log('=== Nexus live demo seed ===');
  log(`AUTH=${CFG.AUTH} CRM=${CFG.CRM} FINANCE=${CFG.FINANCE}`);

  await login();
  const pipeline = await ensurePipeline();
  const accounts = await seedAccounts();
  const contactsByAccount = await seedContacts(accounts);
  await seedLeads();
  await seedDeals(accounts, contactsByAccount, pipeline);
  await seedActivities(accounts, summary.deals);
  await seedUsers();
  await seedQuotes();

  log('\n=== Summary ===');
  log(`  pipelines : ${summary.pipelines}`);
  log(`  stages    : ${summary.stages}`);
  log(`  accounts  : ${summary.accounts}`);
  log(`  contacts  : ${summary.contacts}`);
  log(`  leads     : ${summary.leads}`);
  log(`  deals     : ${summary.deals}`);
  log(`  activities: ${summary.activities}`);
  log(`  users     : ${summary.users}`);
  log(`  quotes    : ${summary.quotes} (skipped)`);
  log(`  failures  : ${summary.failures}`);
  log('Done.');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error('\nFATAL:', err?.message ?? String(err));
    process.exitCode = 1;
  });
}
