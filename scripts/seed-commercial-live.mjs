#!/usr/bin/env node
// @ts-check
/**
 * seed-commercial-live.mjs — populate the commercial/CPQ pipeline of a RUNNING
 * Nexus instance (products → price book → RFQ → quote → order → invoice).
 *
 * Companion to seed-demo-live.mjs, which seeds only the CRM side (accounts,
 * contacts, leads, deals, activities) and stops before finance. This script
 * picks up from there and reuses the accounts/deals that script created.
 *
 * It drives the real HTTP lifecycle rather than writing rows, so every CPQ guard
 * runs (RFQ must carry account+deal, quote must be ACCEPTED and hold a current
 * revision before it can convert) and every step emits its genuine event —
 * which is what makes quote/invoice data reach analytics at all.
 *
 * Node built-ins only (global fetch, no deps). ESM.
 *
 * ── Run (on the server, defaults target localhost) ─────────────────────────────
 *   node scripts/seed-commercial-live.mjs
 *
 * ── Env overrides (all optional) ───────────────────────────────────────────────
 *   AUTH      (default http://localhost:3000)   auth-service
 *   CRM       (default http://localhost:3001)   crm-service
 *   FINANCE   (default http://localhost:3002)   finance-service
 *   EMAIL     (default admin@demo.com)
 *   PASSWORD  (default Demo1234!)
 *   RFQ_COUNT (default 10)  how many deals to run through the pipeline
 *
 * Every create failure is logged and the seed continues — it never aborts, so a
 * partial run still leaves usable data.
 */

// ─── Config ────────────────────────────────────────────────────────────────────
const CFG = {
  AUTH: process.env.AUTH || 'http://localhost:3000',
  CRM: process.env.CRM || 'http://localhost:3001',
  FINANCE: process.env.FINANCE || 'http://localhost:3002',
  EMAIL: process.env.EMAIL || 'admin@demo.com',
  PASSWORD: process.env.PASSWORD || 'Demo1234!',
  RFQ_COUNT: Number(process.env.RFQ_COUNT || 10),
};

let TOKEN = '';
let OWNER_ID = '';

const summary = {
  products: 0,
  priceBooks: 0,
  rfqs: 0,
  quotes: 0,
  quotesSent: 0,
  quotesAccepted: 0,
  quotesRejected: 0,
  orders: 0,
  invoices: 0,
  invoicesPaid: 0,
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
function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
function snippet(s, n = 240) {
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  return str && str.length > n ? `${str.slice(0, n)}…` : str;
}

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

function unwrap(resBody) {
  return resBody?.data ?? resBody;
}
function pickId(resBody) {
  const d = unwrap(resBody);
  return d?.id ?? d?.data?.id ?? undefined;
}

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

/**
 * POST a CPQ lifecycle transition. These are guarded by an idempotency ledger
 * that rejects replays of the same key, so each call gets a unique one.
 * @returns the unwrapped response data, or null on failure.
 */
let transitionSeq = 0;
async function transition(label, base, path, payload) {
  transitionSeq += 1;
  const key = `seed-${Date.now()}-${transitionSeq}`;
  const res = await api('POST', base, path, payload, { 'Idempotency-Key': key });
  if (res.ok) {
    log(`  ✓ ${label}`);
    return unwrap(res.body) ?? {};
  }
  summary.failures += 1;
  warn(`  ✗ ${label} FAILED [${res.status}] ${snippet(res.body?.error ?? res.body)}`);
  return null;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────
const CATALOG = [
  { sku: 'NX-PLAT-ENT', name: 'Nexus Platform — Enterprise', type: 'SUBSCRIPTION', listPrice: 48000, cost: 12000, billingType: 'RECURRING' },
  { sku: 'NX-PLAT-PRO', name: 'Nexus Platform — Professional', type: 'SUBSCRIPTION', listPrice: 24000, cost: 6000, billingType: 'RECURRING' },
  { sku: 'NX-PLAT-STD', name: 'Nexus Platform — Standard', type: 'SUBSCRIPTION', listPrice: 12000, cost: 3000, billingType: 'RECURRING' },
  { sku: 'NX-SEAT', name: 'Additional User Seat', type: 'SUBSCRIPTION', listPrice: 480, cost: 90, billingType: 'RECURRING' },
  { sku: 'NX-IMPL-STD', name: 'Implementation — Standard', type: 'SERVICE', listPrice: 15000, cost: 7000, billingType: 'ONE_TIME' },
  { sku: 'NX-IMPL-ENT', name: 'Implementation — Enterprise', type: 'SERVICE', listPrice: 45000, cost: 21000, billingType: 'ONE_TIME' },
  { sku: 'NX-MIGRATE', name: 'Data Migration Package', type: 'SERVICE', listPrice: 9500, cost: 4200, billingType: 'ONE_TIME' },
  { sku: 'NX-TRAIN', name: 'Admin Training (per cohort)', type: 'SERVICE', listPrice: 3500, cost: 1200, billingType: 'ONE_TIME' },
  { sku: 'NX-SUP-PREM', name: 'Premium Support (annual)', type: 'SUBSCRIPTION', listPrice: 18000, cost: 5000, billingType: 'RECURRING' },
  { sku: 'NX-API-TIER2', name: 'API Volume Tier 2', type: 'SUBSCRIPTION', listPrice: 7200, cost: 1400, billingType: 'RECURRING' },
  { sku: 'NX-SANDBOX', name: 'Dedicated Sandbox Environment', type: 'SUBSCRIPTION', listPrice: 6000, cost: 1800, billingType: 'RECURRING' },
  { sku: 'NX-INTEG', name: 'Custom Integration Build', type: 'SERVICE', listPrice: 22000, cost: 11000, billingType: 'ONE_TIME' },
];

const RFQ_TITLES = [
  'Platform rollout — initial scope',
  'Annual renewal + seat expansion',
  'Migration and onboarding package',
  'Multi-region deployment',
  'Support upgrade request',
  'Integration and training bundle',
  'Pilot to production conversion',
  'Departmental expansion',
  'Compliance and sandbox add-on',
  'Enterprise agreement refresh',
  'API tier upgrade',
  'Managed services engagement',
];

// ─── Step 1 — Login ───────────────────────────────────────────────────────────
async function login() {
  log('\n[1] Login');
  const res = await api('POST', CFG.AUTH, '/auth/login', {
    email: CFG.EMAIL,
    password: CFG.PASSWORD,
  });
  if (!res.ok) throw new Error(`Login failed [${res.status}] ${snippet(res.body)}`);
  const data = unwrap(res.body) ?? {};
  if (data.mfaRequired) throw new Error('Login returned mfaRequired — cannot seed non-interactively.');
  TOKEN = data.accessToken;
  if (!TOKEN) throw new Error(`Login OK but no accessToken: ${snippet(res.body)}`);
  const [, payloadB64] = TOKEN.split('.');
  const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  OWNER_ID = claims.sub;
  log(`  ✓ authenticated as ${CFG.EMAIL}  ownerId=${OWNER_ID}`);
}

// ─── Step 2 — Reuse existing CRM deals (RFQ requires account + deal) ──────────
async function loadDeals() {
  log('\n[2] Load existing deals from CRM');
  const res = await api('GET', CFG.CRM, '/deals?limit=100');
  if (!res.ok) throw new Error(`Cannot list deals [${res.status}] ${snippet(res.body)}`);
  const d = unwrap(res.body);
  const rows = d?.data ?? d ?? [];
  // An RFQ is rejected unless it carries BOTH accountId and dealId.
  const usable = rows.filter((x) => x?.id && x?.accountId);
  log(`  ✓ ${rows.length} deals, ${usable.length} usable (have accountId)`);
  if (!usable.length) {
    throw new Error('No deals with an accountId — run seed-demo-live.mjs first.');
  }
  return usable;
}

// ─── Step 3 — Products ────────────────────────────────────────────────────────
async function seedProducts() {
  log('\n[3] Products');
  const ids = [];
  for (const p of CATALOG) {
    const id = await create(`product ${p.sku}`, CFG.FINANCE, '/products', {
      sku: p.sku,
      name: p.name,
      description: `${p.name} — demo catalog item.`,
      type: p.type,
      currency: 'USD',
      listPrice: p.listPrice,
      cost: p.cost,
      billingType: p.billingType,
      taxable: true,
      isActive: true,
    });
    if (id) {
      ids.push({ id, ...p });
      summary.products += 1;
    }
  }
  // A duplicate SKU (re-run) returns no id, so fall back to listing.
  if (ids.length < CATALOG.length) {
    const res = await api('GET', CFG.FINANCE, '/products?limit=100');
    if (res.ok) {
      const d = unwrap(res.body);
      const rows = d?.data ?? d ?? [];
      for (const row of rows) {
        if (row?.id && !ids.some((x) => x.id === row.id)) {
          const meta = CATALOG.find((c) => c.sku === row.sku);
          ids.push({ id: row.id, sku: row.sku, listPrice: Number(row.listPrice ?? meta?.listPrice ?? 1000) });
        }
      }
      log(`  ✓ catalog resolved to ${ids.length} products`);
    }
  }
  return ids;
}

// ─── Step 4 — Price book ──────────────────────────────────────────────────────
async function seedPriceBook(products) {
  log('\n[4] Price book');
  if (!products.length) return;
  const id = await create('price book FY26 Standard', CFG.FINANCE, '/price-books', {
    name: 'FY26 Standard',
    code: 'STD-FY26',
    description: 'Standard list pricing for FY26 (demo).',
    currency: 'USD',
    isDefault: true,
    isActive: true,
    tiers: [],
    entries: products.map((p) => ({
      productId: p.id,
      // A modest book discount off list, so the book is visibly distinct from listPrice.
      unitPrice: Math.round(Number(p.listPrice) * 0.95),
      minQty: 1,
      discountPct: 0,
    })),
  });
  if (id) summary.priceBooks += 1;
}

// ─── Step 5 — The commercial pipeline, per deal ───────────────────────────────
/**
 * Drives one deal through: RFQ -> send -> review -> respond -> convert
 *                          -> quote send -> accept -> order -> invoice.
 *
 * `outcome` decides how far it goes, so the seeded data spans the whole funnel
 * instead of every record landing in the same terminal state.
 */
async function runPipeline(deal, products, outcome, idx) {
  const title = RFQ_TITLES[idx % RFQ_TITLES.length];
  log(`\n  ── deal ${deal.id} (${outcome})`);

  // Pick 2–4 distinct products for the line items.
  const chosen = [];
  const poolSize = Math.min(products.length, 4);
  while (chosen.length < Math.min(randInt(2, poolSize), poolSize)) {
    const p = pick(products);
    if (!chosen.some((c) => c.id === p.id)) chosen.push(p);
  }

  const rfqId = await create(`RFQ "${title}"`, CFG.FINANCE, '/rfqs', {
    title,
    dealId: deal.id,
    accountId: deal.accountId,
    ...(deal.contactId ? { contactId: deal.contactId } : {}),
    currency: 'USD',
    requiredByDate: isoDaysFromNow(randInt(20, 90)),
    internalNotes: 'Seeded demo RFQ.',
    lineItems: chosen.map((p) => ({
      productId: p.id,
      quantity: randInt(1, 10),
      unitPrice: Math.round(Number(p.listPrice) * 0.95),
      listPrice: Number(p.listPrice),
    })),
  });
  if (!rfqId) return;
  summary.rfqs += 1;

  if (outcome === 'rfq_only') return; // leave a couple sitting in DRAFT

  if (!(await transition('RFQ send', CFG.FINANCE, `/rfqs/${rfqId}/send`))) return;
  if (!(await transition('RFQ review', CFG.FINANCE, `/rfqs/${rfqId}/review`))) return;
  if (!(await transition('RFQ respond', CFG.FINANCE, `/rfqs/${rfqId}/respond`, {}))) return;

  if (outcome === 'rfq_responded') return; // awaiting conversion

  const conv = await transition('RFQ convert → quote', CFG.FINANCE, `/rfqs/${rfqId}/convert`);
  if (!conv) return;
  const quoteId = conv.quoteId ?? conv?.data?.quoteId;
  if (!quoteId) {
    summary.failures += 1;
    warn(`  ✗ convert returned no quoteId: ${snippet(conv)}`);
    return;
  }
  summary.quotes += 1;
  log(`  ✓ quote ${quoteId}`);

  if (outcome === 'quote_draft') return;

  // A quote cannot be sent until a customer package has been rendered — the send
  // guard looks for a QuoteDocument with status RENDERED.
  if (!(await transition('quote render package', CFG.FINANCE, `/quotes/${quoteId}/render`, { format: 'PDF' }))) return;

  if (!(await transition('quote send', CFG.FINANCE, `/quotes/${quoteId}/send`))) return;
  summary.quotesSent += 1;

  if (outcome === 'quote_sent') return;

  if (outcome === 'quote_rejected') {
    if (await transition('quote reject', CFG.FINANCE, `/quotes/${quoteId}/reject`, {
      reason: 'Budget deferred to next fiscal year.',
    })) {
      summary.quotesRejected += 1;
    }
    return;
  }

  if (!(await transition('quote accept', CFG.FINANCE, `/quotes/${quoteId}/accept`))) return;
  summary.quotesAccepted += 1;

  if (outcome === 'quote_accepted') return;

  // NOTE: do not PATCH the quote between accept and convert — convert requires
  // the latest revision to still match the quote's version AND status.
  const order = await transition('quote → order', CFG.FINANCE, `/quotes/${quoteId}/convert-order`);
  if (!order) return;
  const orderId = order.id ?? order?.data?.id;
  if (!orderId) {
    summary.failures += 1;
    warn(`  ✗ convert-order returned no order id: ${snippet(order)}`);
    return;
  }
  summary.orders += 1;
  log(`  ✓ order ${orderId}`);

  if (outcome === 'order_only') return;

  const inv = await transition('order → invoice', CFG.FINANCE, `/orders/${orderId}/invoice`, {
    dueDate: isoDaysFromNow(30),
    notes: 'Seeded demo invoice.',
  });
  if (!inv) return;
  const invoiceId = inv.id ?? inv?.data?.id;
  if (!invoiceId) {
    summary.failures += 1;
    warn(`  ✗ invoice returned no id: ${snippet(inv)}`);
    return;
  }
  summary.invoices += 1;
  log(`  ✓ invoice ${invoiceId}`);

  await transition('invoice send', CFG.FINANCE, `/invoices/${invoiceId}/send`);

  if (outcome === 'invoice_paid') {
    if (await transition('invoice mark-paid', CFG.FINANCE, `/invoices/${invoiceId}/mark-paid`, {})) {
      summary.invoicesPaid += 1;
    }
  }
}

// A spread across the funnel, weighted toward closed business so the revenue
// and invoice datasets have something to aggregate.
const OUTCOMES = [
  'invoice_paid',
  'invoice_paid',
  'invoice_paid',
  'order_only',
  'quote_accepted',
  'quote_sent',
  'quote_sent',
  'quote_rejected',
  'quote_draft',
  'rfq_responded',
  'rfq_only',
];

async function seedCommercial(deals, products) {
  log('\n[5] Commercial pipeline (RFQ → quote → order → invoice)');
  const n = Math.min(CFG.RFQ_COUNT, deals.length);
  for (let i = 0; i < n; i += 1) {
    const outcome = OUTCOMES[i % OUTCOMES.length];
    try {
      await runPipeline(deals[i], products, outcome, i);
    } catch (err) {
      summary.failures += 1;
      warn(`  ✗ pipeline for deal ${deals[i]?.id} threw: ${String(err)}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('═══ Nexus commercial seed ═══');
  log(`  finance=${CFG.FINANCE}  crm=${CFG.CRM}`);
  await login();
  const deals = await loadDeals();
  const products = await seedProducts();
  await seedPriceBook(products);
  await seedCommercial(deals, products);

  log('\n═══ Summary ═══');
  for (const [k, v] of Object.entries(summary)) log(`  ${k.padEnd(16)} ${v}`);
  log('');
  if (summary.failures > 0) {
    warn(`Completed with ${summary.failures} failure(s) — see ✗ lines above.`);
  } else {
    log('Completed with no failures.');
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
