import { http, HttpResponse } from 'msw';
import { createFakeDeal, createFakeDeals } from '../factories/deal.factory';
import { createFakeContact, createFakeContacts } from '../factories/contact.factory';
import { createFakeUser, createFakeUsers } from '../factories/user.factory';

/* ── stateful in-memory stores (per session) ─────────────────────────────── */
const dealsStore = createFakeDeals(5);
const contactsStore = createFakeContacts(5);
const leadsStore = createFakeContacts(5).map((c) => ({
  ...c,
  status: 'NEW',
  score: Math.floor(Math.random() * 100),
  source: 'website',
}));

/* ── Auth / Users ────────────────────────────────────────────────────────── */
const authUser = createFakeUser({ roles: ['ADMIN'] });

export const handlers = [
  // Auth
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({
      id: authUser.id,
      email: authUser.email,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      tenantId: authUser.tenantId,
      roles: authUser.roles,
    })
  ),

  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    if (body?.email && body?.password) {
      return HttpResponse.json({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: authUser,
      });
    }
    return new HttpResponse(null, { status: 401 });
  }),

  http.post('/api/v1/auth/logout', () =>
    HttpResponse.json({ success: true })
  ),

  http.post('/api/v1/auth/refresh', () =>
    HttpResponse.json({
      accessToken: 'mock-refreshed-token',
      refreshToken: 'mock-refreshed-refresh-token',
    })
  ),

  // Users
  http.get('/api/v1/users', () =>
    HttpResponse.json({
      data: createFakeUsers(3),
      meta: { total: 3 },
    })
  ),

  http.get('/api/v1/users/:id', ({ params }) =>
    HttpResponse.json(createFakeUser({ id: String(params.id) }))
  ),

  /* ── Deals CRUD ────────────────────────────────────────────────────────── */
  http.get('/api/v1/deals', () =>
    HttpResponse.json({
      data: dealsStore,
      meta: { total: dealsStore.length },
    })
  ),

  http.get('/api/v1/deals/:id', ({ params }) => {
    const deal = dealsStore.find((d) => d.id === params.id);
    if (!deal) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(deal);
  }),

  http.post('/api/v1/deals', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newDeal = createFakeDeal(body as Partial<typeof body>);
    dealsStore.push(newDeal);
    return HttpResponse.json(newDeal, { status: 201 });
  }),

  http.patch('/api/v1/deals/:id', async ({ request, params }) => {
    const deal = dealsStore.find((d) => d.id === params.id);
    if (!deal) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(deal, body);
    return HttpResponse.json(deal);
  }),

  http.delete('/api/v1/deals/:id', ({ params }) => {
    const idx = dealsStore.findIndex((d) => d.id === params.id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    dealsStore.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  /* ── Contacts CRUD ─────────────────────────────────────────────────────── */
  http.get('/api/v1/contacts', () =>
    HttpResponse.json({
      data: contactsStore,
      meta: { total: contactsStore.length },
    })
  ),

  http.get('/api/v1/contacts/:id', ({ params }) => {
    const contact = contactsStore.find((c) => c.id === params.id);
    if (!contact) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(contact);
  }),

  http.post('/api/v1/contacts', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newContact = createFakeContact(body as Partial<typeof body>);
    contactsStore.push(newContact);
    return HttpResponse.json(newContact, { status: 201 });
  }),

  http.patch('/api/v1/contacts/:id', async ({ request, params }) => {
    const contact = contactsStore.find((c) => c.id === params.id);
    if (!contact) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(contact, body);
    return HttpResponse.json(contact);
  }),

  http.delete('/api/v1/contacts/:id', ({ params }) => {
    const idx = contactsStore.findIndex((c) => c.id === params.id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    contactsStore.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  /* ── Leads CRUD ────────────────────────────────────────────────────────── */
  http.get('/api/v1/leads', () =>
    HttpResponse.json({
      data: leadsStore,
      meta: { total: leadsStore.length },
    })
  ),

  http.get('/api/v1/leads/:id', ({ params }) => {
    const lead = leadsStore.find((l) => l.id === params.id);
    if (!lead) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(lead);
  }),

  http.post('/api/v1/leads', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newLead = {
      ...createFakeContact(body as Partial<typeof body>),
      status: 'NEW',
      score: Math.floor(Math.random() * 100),
      source: body.source ?? 'website',
    };
    leadsStore.push(newLead as (typeof leadsStore)[number]);
    return HttpResponse.json(newLead, { status: 201 });
  }),

  http.patch('/api/v1/leads/:id', async ({ request, params }) => {
    const lead = leadsStore.find((l) => l.id === params.id);
    if (!lead) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(lead, body);
    return HttpResponse.json(lead);
  }),

  http.delete('/api/v1/leads/:id', ({ params }) => {
    const idx = leadsStore.findIndex((l) => l.id === params.id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    leadsStore.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  /* ── Activities ────────────────────────────────────────────────────────── */
  http.get('/api/v1/activities', ({ request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') ?? 'all';
    const allActivities = [
      { id: 'act-1', type: 'call', title: 'Discovery call with Acme', contactName: 'John Doe', dealName: 'Acme Corp', createdAt: new Date().toISOString() },
      { id: 'act-2', type: 'email', title: 'Follow-up email sent', contactName: 'Jane Smith', dealName: null, createdAt: new Date().toISOString() },
      { id: 'act-3', type: 'meeting', title: 'Product demo', contactName: 'Bob Jones', dealName: 'Globex', createdAt: new Date().toISOString() },
    ];
    const filtered = type === 'all' ? allActivities : allActivities.filter((a) => a.type === type);
    return HttpResponse.json({ activities: filtered });
  }),

  /* ── Pipelines & Stages ────────────────────────────────────────────────── */
  http.get('/api/v1/pipelines', () =>
    HttpResponse.json({
      data: [
        { id: 'pipeline-1', name: 'Sales Pipeline', stages: [{ id: 'stage-1', name: 'Prospecting' }, { id: 'stage-2', name: 'Qualification' }, { id: 'stage-3', name: 'Proposal' }, { id: 'stage-4', name: 'Negotiation' }, { id: 'stage-5', name: 'Closed Won' }] },
      ],
    })
  ),

  http.get('/api/v1/pipelines/:id', ({ params }) =>
    HttpResponse.json({
      id: params.id,
      name: 'Sales Pipeline',
      stages: [
        { id: 'stage-1', name: 'Prospecting', probability: 10 },
        { id: 'stage-2', name: 'Qualification', probability: 25 },
        { id: 'stage-3', name: 'Proposal', probability: 50 },
        { id: 'stage-4', name: 'Negotiation', probability: 75 },
        { id: 'stage-5', name: 'Closed Won', probability: 100 },
      ],
    })
  ),

  http.get('/api/v1/pipelines/:id/stages', ({ params }) =>
    HttpResponse.json({
      data: [
        { id: 'stage-1', name: 'Prospecting', pipelineId: params.id, probability: 10, order: 1 },
        { id: 'stage-2', name: 'Qualification', pipelineId: params.id, probability: 25, order: 2 },
        { id: 'stage-3', name: 'Proposal', pipelineId: params.id, probability: 50, order: 3 },
        { id: 'stage-4', name: 'Negotiation', pipelineId: params.id, probability: 75, order: 4 },
        { id: 'stage-5', name: 'Closed Won', pipelineId: params.id, probability: 100, order: 5 },
      ],
    })
  ),

  /* ── Quotes ────────────────────────────────────────────────────────────── */
  http.get('/api/v1/quotes', () =>
    HttpResponse.json({
      data: [
        { id: 'quote-1', quoteNumber: 'Q-2026-001', dealId: 'deal-1', accountId: 'acc-1', status: 'DRAFT', total: 15000, currency: 'USD', version: 1, expiresAt: new Date().toISOString(), validUntil: new Date().toISOString(), ownerId: authUser.id, createdAt: new Date().toISOString() },
        { id: 'quote-2', quoteNumber: 'Q-2026-002', dealId: 'deal-2', accountId: 'acc-2', status: 'SENT', total: 42000, currency: 'USD', version: 1, expiresAt: new Date().toISOString(), validUntil: new Date().toISOString(), ownerId: authUser.id, createdAt: new Date().toISOString() },
      ],
      total: 2,
    })
  ),

  http.get('/api/v1/quotes/:id', ({ params }) =>
    HttpResponse.json({
      id: params.id,
      quoteNumber: 'Q-2026-001',
      dealId: 'deal-1',
      accountId: 'acc-1',
      status: 'DRAFT',
      total: 15000,
      currency: 'USD',
      version: 1,
      expiresAt: new Date().toISOString(),
      validUntil: new Date().toISOString(),
      ownerId: authUser.id,
      createdAt: new Date().toISOString(),
    })
  ),

  /* ── Invoices ──────────────────────────────────────────────────────────── */
  http.get('/api/v1/invoices', () =>
    HttpResponse.json({
      data: [
        { id: 'inv-1', invoiceNumber: 'INV-2026-001', accountId: 'acc-1', status: 'PAID', subtotal: '10000', tax: '1500', total: '11500', currency: 'USD', dueDate: new Date().toISOString(), paidAt: new Date().toISOString(), createdAt: new Date().toISOString() },
        { id: 'inv-2', invoiceNumber: 'INV-2026-002', accountId: 'acc-2', status: 'SENT', subtotal: '25000', tax: '3750', total: '28750', currency: 'USD', dueDate: new Date().toISOString(), paidAt: null, createdAt: new Date().toISOString() },
      ],
      total: 2,
    })
  ),

  http.get('/api/v1/invoices/:id', ({ params }) =>
    HttpResponse.json({
      id: params.id,
      invoiceNumber: 'INV-2026-001',
      accountId: 'acc-1',
      status: 'PAID',
      subtotal: '10000',
      tax: '1500',
      total: '11500',
      currency: 'USD',
      dueDate: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })
  ),

  /* ── Forecast overrides ────────────────────────────────────────────────── */
  http.get('/api/v1/forecast', () =>
    HttpResponse.json({
      pipeline: 500000,
      weighted: 325000,
      committed: 280000,
      closed: 150000,
      stages: [
        { stageId: 'stage-1', stageName: 'Prospecting', probability: 10, dealCount: 20, totalAmount: 200000, weightedAmount: 20000 },
        { stageId: 'stage-2', stageName: 'Qualification', probability: 25, dealCount: 15, totalAmount: 150000, weightedAmount: 37500 },
        { stageId: 'stage-3', stageName: 'Proposal', probability: 50, dealCount: 8, totalAmount: 100000, weightedAmount: 50000 },
        { stageId: 'stage-4', stageName: 'Negotiation', probability: 75, dealCount: 5, totalAmount: 50000, weightedAmount: 37500 },
        { stageId: 'stage-5', stageName: 'Closed Won', probability: 100, dealCount: 3, totalAmount: 150000, weightedAmount: 150000 },
      ],
    })
  ),

  http.get('/api/v1/forecast-overrides', () =>
    HttpResponse.json({
      data: [
        { id: 'fo-1', repId: authUser.id, periodKey: 'this_quarter', managerOverride: 300000, adjustedBy: authUser.id, createdAt: new Date().toISOString() },
      ],
    })
  ),

  http.put('/api/v1/forecast-overrides', async () =>
    HttpResponse.json({ success: true })
  ),

  http.get('/api/v1/forecast-overrides/team-summary', () =>
    HttpResponse.json({
      data: {
        reps: [
          { repId: authUser.id, repName: `${authUser.firstName} ${authUser.lastName}`, weightedCommit: 325000, override: null, attainment: 92.5 },
        ],
        totals: { repTotal: 325000, managerTotal: 325000 },
      },
    })
  ),

  /* ── Next.js API Routes ──────────────────────────────────────────────────── */
  http.get('/api/dashboard/stats', () =>
    HttpResponse.json({
      totalDeals: 42,
      totalRevenue: 1250000,
      activeContacts: 156,
      openTasks: 23,
      monthlyGrowth: 12.5,
    })
  ),

  http.get('/api/reports/performance', () =>
    HttpResponse.json({
      performance: [
        { id: '1', date: '2026-01-15', customer: 'Acme Corp', customerSubtitle: 'Enterprise', ownerName: 'Jane Doe', dealValue: 50000, status: 'CLOSED WON' },
        { id: '2', date: '2026-01-20', customer: 'Globex', customerSubtitle: 'Mid-Market', ownerName: 'John Smith', dealValue: 25000, status: 'IN PROGRESS' },
      ],
      territory: [
        { name: 'North America', value: 750000, delta: 15 },
        { name: 'Europe', value: 350000, delta: -5 },
      ],
      events: [
        { id: 'e1', type: 'deal_won', title: 'Deal Closed', body: 'Acme Corp - $50k', createdAt: new Date().toISOString() },
      ],
      kpis: {
        totalRevenue: 1250000,
        dealsClosed: 42,
        avgDealSize: 29762,
        winRate: 68,
      },
    })
  ),

  /* ── CRM BFF routes (used by use-pipelines.ts) ───────────────────────────── */
  http.get('/api/crm/pipelines', () =>
    HttpResponse.json({
      success: true,
      data: [
        { id: 'pipeline-1', name: 'Sales Pipeline', stages: [{ id: 'stage-1', name: 'Prospecting' }, { id: 'stage-2', name: 'Qualification' }, { id: 'stage-3', name: 'Proposal' }, { id: 'stage-4', name: 'Negotiation' }, { id: 'stage-5', name: 'Closed Won' }] },
      ],
    })
  ),

  http.get('/api/crm/pipelines/:id/stages', ({ params }) =>
    HttpResponse.json({
      success: true,
      data: [
        { id: 'stage-1', name: 'Prospecting', pipelineId: params.id, probability: 10, order: 1 },
        { id: 'stage-2', name: 'Qualification', pipelineId: params.id, probability: 25, order: 2 },
        { id: 'stage-3', name: 'Proposal', pipelineId: params.id, probability: 50, order: 3 },
        { id: 'stage-4', name: 'Negotiation', pipelineId: params.id, probability: 75, order: 4 },
        { id: 'stage-5', name: 'Closed Won', pipelineId: params.id, probability: 100, order: 5 },
      ],
    })
  ),

  /* ── CORS preflight catch-all for axios cross-origin requests ────────────── */
  http.options('*', () => new HttpResponse(null, { status: 204 })),

  /* ── Explicit full-URL fallbacks for axios requests in jsdom ─────────────── */
  http.get('http://localhost:3001/api/v1/deals', () =>
    HttpResponse.json({
      data: dealsStore,
      meta: { total: dealsStore.length },
    })
  ),

  http.get('http://localhost:3001/api/v1/activities', () =>
    HttpResponse.json({
      data: [
        { id: 'act-1', type: 'EMAIL', status: 'COMPLETED', subject: 'Discovery call with Acme', contactName: 'John Doe', dealName: 'Acme Corp', ownerId: authUser.id, createdAt: new Date().toISOString() },
        { id: 'act-2', type: 'TASK', status: 'PENDING', subject: 'Follow-up email sent', contactName: 'Jane Smith', dealName: null, ownerId: authUser.id, createdAt: new Date().toISOString() },
        { id: 'act-3', type: 'NOTE', status: 'COMPLETED', subject: 'Product demo', contactName: 'Bob Jones', dealName: 'Globex', ownerId: authUser.id, createdAt: new Date().toISOString() },
      ],
      meta: { total: 3 },
    })
  ),

  http.get('http://localhost:3001/api/v1/users', () =>
    HttpResponse.json({
      data: createFakeUsers(3),
      meta: { total: 3 },
    })
  ),
];
