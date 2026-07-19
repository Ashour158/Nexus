/**
 * Full-route smoke crawl against a deployed Nexus web instance.
 *
 * Logs in through the real login form, then HARD-navigates to every dashboard
 * route (each goto is a fresh document load — this exercises the HttpOnly
 * cookie auth path, not the in-memory token). Records per route:
 *   - document HTTP status
 *   - uncaught page errors
 *   - error-boundary / crash markers in the rendered body
 *   - "Request failed" toasts (failed API calls behind the page)
 *
 * Usage:
 *   node scripts/crawl-prod.mjs [baseUrl]
 * Env: CRAWL_EMAIL / CRAWL_PASSWORD override the default demo credentials.
 *
 * Serial on purpose: the droplet is load-fragile (one browser, one page,
 * small settle between routes).
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'https://159-65-32-72.sslip.io';
const EMAIL = process.env.CRAWL_EMAIL ?? 'admin@demo.com';
const PASSWORD = process.env.CRAWL_PASSWORD ?? 'Demo1234!';

const STATIC_ROUTES = [
  '/dashboard', '/accounts', '/accounts/duplicates', '/activities', '/analytics',
  '/analytics/competitors', '/analytics/dashboards', '/analytics/funnel',
  '/analytics/leaderboard', '/analytics/reports/builder', '/analytics/win-loss',
  '/approvals', '/cadences', '/cadences/enroll', '/calendar', '/campaigns',
  '/campaigns/new', '/chatbot', '/command-center', '/commission', '/contacts',
  '/contacts/duplicates', '/contracts', '/deals', '/deals/new', '/documents',
  '/feed', '/forecast', '/inbox', '/incentives', '/integrations', '/invoices',
  '/knowledge', '/knowledge/new', '/leads', '/leads/new', '/messages/whatsapp',
  '/notes', '/notifications', '/orders', '/org-chart', '/pipeline',
  '/pipeline/analytics', '/planning', '/portal/settings', '/products', '/quotes',
  '/quotes/new', '/recycle-bin', '/reporting', '/reports', '/reports/builder',
  '/reports/manager', '/reports/performance', '/rfqs', '/roles', '/status',
  '/system-map', '/tasks', '/territories', '/tickets', '/tickets/sla-policies',
  '/whats-new', '/workflows',
  '/settings', '/settings/account', '/settings/ai-models', '/settings/api-keys',
  '/settings/approval-processes', '/settings/assignment-rules', '/settings/audit',
  '/settings/automation-rules', '/settings/blueprint-transitions',
  '/settings/company', '/settings/config-export-import', '/settings/currencies',
  '/settings/custom-fields', '/settings/data-privacy', '/settings/data-quality',
  '/settings/data-sharing', '/settings/duplicate-rules', '/settings/duplicates',
  '/settings/escalation-rules', '/settings/field-permissions', '/settings/flags',
  '/settings/gdpr', '/settings/global-picklist-sets', '/settings/health',
  '/settings/integrations', '/settings/integrations/slack',
  '/settings/integrations/teams', '/settings/integrations/webhooks',
  '/settings/integrations/zatca', '/settings/label-translations',
  '/settings/layouts', '/settings/mail-accounts', '/settings/mapping-templates',
  '/settings/migration', '/settings/modules', '/settings/notifications',
  '/settings/org-structure', '/settings/outbound-webhooks', '/settings/pipelines',
  '/settings/profile', '/settings/quote-automation', '/settings/quotes',
  '/settings/review-process', '/settings/roles', '/settings/scheduled-jobs',
  '/settings/schema-builder', '/settings/scoring-rules', '/settings/sso',
  '/settings/system', '/settings/tax', '/settings/templates', '/settings/tenants',
  '/settings/territories', '/settings/threshold-alerts', '/settings/users',
  '/settings/validation-rules', '/settings/workflow-builder', '/settings/workflows',
  '/admin', '/admin/api-keys', '/admin/audit', '/admin/automation-rules',
  '/admin/flags', '/admin/health', '/admin/mail-accounts', '/admin/roles',
  '/admin/settings', '/admin/tenants', '/admin/users', '/admin/validation-rules',
];

/** Detail routes resolved at runtime from list endpoints: [listPath, detailPrefix]. */
const DETAIL_SOURCES = [
  ['/bff/crm/deals?limit=1', '/deals/'],
  ['/bff/crm/accounts?limit=1', '/accounts/'],
  ['/bff/crm/contacts?limit=1', '/contacts/'],
  ['/bff/crm/leads?limit=1', '/leads/'],
  ['/bff/finance/quotes?limit=1', '/quotes/'],
  ['/bff/tickets/tickets?limit=1', '/tickets/'],
];

const CRASH_MARKERS = [
  'Application error: a client-side exception',
  'Something went wrong',
  'Internal Server Error',
  'This page could not be found',
];

function firstId(payload) {
  const d = payload?.data;
  const arr = Array.isArray(d) ? d : (d?.items ?? d?.records ?? d?.deals ?? d?.results ?? []);
  const row = Array.isArray(arr) ? arr[0] : undefined;
  return row?.id;
}

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 200)));

// ---- Login through the real form ----
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
  page.click('button[type="submit"]'),
]);
console.log(`logged in → ${page.url()}`);

// ---- Resolve a few real detail-route IDs via the app's own BFF ----
const routes = [...STATIC_ROUTES];
for (const [listPath, prefix] of DETAIL_SOURCES) {
  try {
    const payload = await page.evaluate(async (p) => {
      const r = await fetch(p);
      return r.ok ? r.json() : null;
    }, listPath);
    const id = firstId(payload);
    if (id) routes.push(`${prefix}${id}`);
    else console.log(`  (no id from ${listPath})`);
  } catch {
    console.log(`  (detail lookup failed: ${listPath})`);
  }
}

// ---- Crawl ----
const results = [];
for (const route of routes) {
  pageErrors.length = 0;
  let status = 0;
  let marker = null;
  let toast = null;
  try {
    const res = await page.goto(`${BASE}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    status = res?.status() ?? 0;
    await page.waitForTimeout(1800); // let client queries land
    const body = await page.evaluate(() => document.body.innerText.slice(0, 20000));
    marker = CRASH_MARKERS.find((m) => body.includes(m)) ?? null;
    if (body.includes('Request failed')) {
      const m = body.match(/Request failed[^\n]*/);
      toast = m ? m[0].slice(0, 80) : 'Request failed';
    }
    // Landing back on /login means the route lost the session — the exact bug
    // class this crawl exists to catch.
    if (new URL(page.url()).pathname.startsWith('/login')) marker = 'BOUNCED TO LOGIN';
  } catch (err) {
    marker = `NAV FAILED: ${String(err).slice(0, 80)}`;
  }
  const errs = [...pageErrors];
  const bad = status >= 400 || marker || errs.length > 0;
  results.push({ route, status, marker, toast, errs });
  console.log(
    `${bad ? 'FAIL' : ' ok '} ${status} ${route}` +
      (marker ? `  [${marker}]` : '') +
      (toast ? `  [toast: ${toast}]` : '') +
      (errs.length ? `  [jsErr: ${errs[0]}]` : '')
  );
  await page.waitForTimeout(250);
}

await browser.close();

const failures = results.filter((r) => r.status >= 400 || r.marker || r.errs.length > 0);
const toasts = results.filter((r) => r.toast && !failures.includes(r));
console.log(`\n=== ${results.length} routes | ${failures.length} failures | ${toasts.length} degraded (failed API behind page)`);
for (const f of failures) console.log(`FAIL ${f.status} ${f.route} ${f.marker ?? ''} ${f.errs[0] ?? ''}`);
for (const t of toasts) console.log(`DEGRADED ${t.route} ${t.toast}`);
process.exit(failures.length > 0 ? 1 : 0);
