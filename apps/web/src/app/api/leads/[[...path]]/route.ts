import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  createId,
  getDevPreviewState,
  paginated,
  validateDevObject,
} from '@/lib/server/dev-preview-data';

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1';

type RouteContext = { params: { path?: string[] } };
type LeadPatch = Record<string, unknown>;
type PreviewRecord = Record<string, unknown> & {
  customFields?: Record<string, unknown>;
  updatedAt?: string;
};

function normalizePath(params: RouteContext['params']) {
  return params.path ?? [];
}

function findLead(id: string) {
  const state = getDevPreviewState();
  return {
    state,
    index: state.leads.findIndex((lead) => lead.id === id),
  };
}

function notFound() {
  return NextResponse.json(apiError('Lead not found', 'LEAD_NOT_FOUND'), { status: 404 });
}

function recordList(record: PreviewRecord, key: string) {
  const value = record.customFields?.[key];
  return Array.isArray(value) ? value : [];
}

function pushCustomItem(record: PreviewRecord, key: string, item: Record<string, unknown>) {
  record.customFields = {
    ...(record.customFields ?? {}),
    [key]: [item, ...recordList(record, key)],
  };
  record.updatedAt = new Date().toISOString();
}

async function proxy(req: NextRequest, { params }: RouteContext, method: string) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = normalizePath(params).join('/');
  const body = method !== 'GET' ? await req.text() : undefined;
  const search = req.nextUrl.searchParams.toString();

  const res = await fetch(
    `${CRM_URL}/leads${path ? `/${path}` : ''}${method === 'GET' && search ? `?${search}` : ''}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      },
      body,
    }
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

function listLeads(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get('search')?.trim().toLowerCase();
  const status = params.get('status');
  const ownerId = params.get('ownerId');
  const source = params.get('source');
  const sortBy = params.get('sortBy') ?? 'createdAt';
  const sortDir = params.get('sortDir') === 'asc' ? 1 : -1;

  let rows = [...getDevPreviewState().leads];

  if (q) {
    rows = rows.filter((lead) =>
      [
        lead.firstName,
        lead.lastName,
        lead.email,
        lead.company,
        lead.jobTitle,
        lead.source,
        lead.tags.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }

  if (status) rows = rows.filter((lead) => lead.status === status);
  if (ownerId) rows = rows.filter((lead) => lead.ownerId === ownerId);
  if (source) rows = rows.filter((lead) => lead.source === source);

  rows.sort((a, b) => {
    const left = a[sortBy] ?? '';
    const right = b[sortBy] ?? '';
    if (sortBy === 'score') {
      return ((Number(left) || 0) - (Number(right) || 0)) * sortDir;
    }
    return String(left).localeCompare(String(right)) * sortDir;
  });

  return NextResponse.json(apiSuccess(paginated(rows, params)));
}

async function createLead(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as LeadPatch;
  const state = getDevPreviewState();
  const createdAt = new Date().toISOString();
  const lead = {
    id: createId('lead'),
    tenantId: 'default',
    ownerId: typeof body.ownerId === 'string' ? body.ownerId : 'dev-admin',
    code: typeof body.code === 'string' ? body.code : `LEAD-${new Date().getFullYear()}-${String(state.leads.length + 1).padStart(6, '0')}`,
    firstName: typeof body.firstName === 'string' ? body.firstName : 'New',
    lastName: typeof body.lastName === 'string' ? body.lastName : 'Lead',
    email: typeof body.email === 'string' ? body.email : null,
    phone: typeof body.phone === 'string' ? body.phone : null,
    company: typeof body.company === 'string' ? body.company : null,
    jobTitle: typeof body.jobTitle === 'string' ? body.jobTitle : null,
    status: typeof body.status === 'string' ? body.status : 'NEW',
    source: typeof body.source === 'string' ? body.source : 'OTHER',
    score: typeof body.score === 'number' ? body.score : 50,
    aiScore: null,
    convertedAt: null,
    convertedToContactId: null,
    convertedToAccountId: null,
    convertedToDealId: null,
    disqualifiedReason:
      typeof body.disqualifiedReason === 'string' ? body.disqualifiedReason : null,
    customFields:
      body.customFields && typeof body.customFields === 'object'
        ? (body.customFields as Record<string, unknown>)
        : {},
    tags: Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === 'string') : [],
    createdAt,
    updatedAt: createdAt,
  };
  const validation = validateDevObject('lead', lead);
  if (!validation.valid) {
    return NextResponse.json(
      {
        ...apiError('Lead validation failed', 'VALIDATION_FAILED'),
        validation: validation.errors,
      },
      { status: 422 }
    );
  }
  state.leads.unshift(lead);
  return NextResponse.json(apiSuccess(lead), { status: 201 });
}

function getLead(id: string) {
  const { state, index } = findLead(id);
  if (index < 0) return notFound();
  return NextResponse.json(apiSuccess(state.leads[index]));
}

async function updateLead(req: NextRequest, id: string, forcedPatch?: LeadPatch) {
  const { state, index } = findLead(id);
  if (index < 0) return notFound();
  const patch = forcedPatch ?? ((await req.json().catch(() => ({}))) as LeadPatch);
  const previous = state.leads[index];
  const now = new Date().toISOString();
  const changedFields = Object.keys(patch).filter((field) => previous[field] !== patch[field]);
  const updated = {
    ...previous,
    ...patch,
    id: previous.id,
    tenantId: previous.tenantId,
    updatedAt: now,
    customFields: {
      ...(previous.customFields ?? {}),
      fieldHistory: [
        ...changedFields.map((field) => ({
          id: createId('field'),
          objectType: 'lead',
          objectId: id,
          fieldName: field,
          oldValue: previous[field] == null ? null : String(previous[field]),
          newValue: patch[field] == null ? null : String(patch[field]),
          changedBy: 'dev-admin',
          changedByName: 'Preview Admin',
          changedAt: now,
        })),
        ...recordList(previous, 'fieldHistory'),
      ],
      auditTrail: [
        {
          id: createId('audit'),
          type: 'lead.updated',
          action: changedFields.length ? `Updated ${changedFields.join(', ')}` : 'Lead touched',
          actor: 'Preview Admin',
          at: now,
        },
        ...recordList(previous, 'auditTrail'),
      ],
      outboxEvents: [
        {
          id: createId('outbox'),
          type: 'lead.updated',
          aggregateId: id,
          status: 'PENDING',
          createdAt: now,
          payload: { leadId: id, changedFields },
        },
        ...recordList(previous, 'outboxEvents'),
      ],
    },
  };
  const validation = validateDevObject('lead', updated);
  if (!validation.valid) {
    return NextResponse.json(
      {
        ...apiError('Lead validation failed', 'VALIDATION_FAILED'),
        validation: validation.errors,
      },
      { status: 422 }
    );
  }
  state.leads[index] = updated;
  return NextResponse.json(apiSuccess(updated));
}

async function convertLead(req: NextRequest, id: string) {
  const { state, index } = findLead(id);
  if (index < 0) return notFound();
  const body = (await req.json().catch(() => ({}))) as LeadPatch;
  const lead = state.leads[index];
  const convertedAt = new Date().toISOString();
  const contactId = lead.convertedToContactId ?? createId('contact');
  const accountId = lead.convertedToAccountId ?? createId('account');
  const dealId = body.createDeal === false ? undefined : lead.convertedToDealId ?? createId('deal');

  state.leads[index] = {
    ...lead,
    status: 'CONVERTED',
    convertedAt,
    convertedToContactId: contactId,
    convertedToAccountId: accountId,
    convertedToDealId: dealId ?? null,
    updatedAt: convertedAt,
  };

  if (!state.contacts.some((contact) => contact.id === contactId)) {
    state.contacts.unshift({
      id: contactId,
      tenantId: lead.tenantId,
      ownerId: lead.ownerId ?? 'dev-admin',
      code: `CON-${new Date().getFullYear()}-${String(state.contacts.length + 1).padStart(6, '0')}`,
      accountId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      mobile: null,
      linkedInUrl: null,
      twitterHandle: null,
      jobTitle: lead.jobTitle,
      department: null,
      country: null,
      city: null,
      timezone: null,
      address: null,
      preferredChannel: 'email',
      doNotEmail: false,
      doNotCall: false,
      gdprConsent: true,
      gdprConsentAt: convertedAt,
      customFields: { sourceLeadId: lead.id },
      tags: lead.tags,
      isActive: true,
      lastContactedAt: null,
      createdAt: convertedAt,
      updatedAt: convertedAt,
    });
  }

  return NextResponse.json(apiSuccess({ leadId: id, contactId, accountId, dealId }));
}

async function massUpdate(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ids?: string[]; data?: LeadPatch };
  const ids = new Set(body.ids ?? []);
  const patch = body.data ?? {};
  const state = getDevPreviewState();
  const now = new Date().toISOString();
  state.leads = state.leads.map((lead) =>
    ids.has(lead.id) ? { ...lead, ...patch, id: lead.id, updatedAt: now } : lead
  );
  return NextResponse.json(apiSuccess({ updated: ids.size }));
}

async function massDelete(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = new Set(body.ids ?? []);
  const state = getDevPreviewState();
  const now = new Date().toISOString();
  let archived = 0;
  state.leads = state.leads.map((lead) => {
    if (!ids.has(lead.id)) return lead;
    archived += 1;
    return {
      ...lead,
      deletedAt: now,
      updatedAt: now,
      status: lead.status === 'CONVERTED' ? lead.status : 'ARCHIVED',
      customFields: {
        ...(lead.customFields ?? {}),
        outboxEvents: [
          {
            id: createId('outbox'),
            type: 'lead.archived',
            aggregateId: lead.id,
            status: 'PENDING',
            createdAt: now,
            payload: { leadId: lead.id, massAction: true },
          },
          ...recordList(lead, 'outboxEvents'),
        ],
      },
    };
  });
  return NextResponse.json(apiSuccess({ deleted: archived, archived }));
}

function deleteLead(id: string) {
  const { state, index } = findLead(id);
  if (index < 0) return notFound();
  const now = new Date().toISOString();
  state.leads[index] = {
    ...state.leads[index],
    deletedAt: now,
    updatedAt: now,
    status: state.leads[index].status === 'CONVERTED' ? state.leads[index].status : 'ARCHIVED',
  };
  pushCustomItem(state.leads[index], 'outboxEvents', {
    id: createId('outbox'),
    type: 'lead.archived',
    aggregateId: id,
    status: 'PENDING',
    createdAt: now,
    payload: { leadId: id },
  });
  return NextResponse.json(apiSuccess({ id, deleted: true }));
}

function leadDocuments(id: string) {
  const { state, index } = findLead(id);
  if (index < 0) return notFound();
  return NextResponse.json(apiSuccess(recordList(state.leads[index], 'documents')));
}

async function createLeadDocument(req: NextRequest, id: string) {
  const { state, index } = findLead(id);
  if (index < 0) return notFound();
  const body = (await req.json().catch(() => ({}))) as LeadPatch;
  const now = new Date().toISOString();
  const document = {
    id: createId('lead-doc'),
    fileName: String(body.fileName ?? body.name ?? 'Lead document'),
    mimeType: String(body.mimeType ?? 'application/octet-stream'),
    fileSize: Number(body.fileSize ?? body.size ?? 0),
    category: String(body.category ?? 'lead'),
    uploadedBy: 'dev-admin',
    createdAt: now,
    updatedAt: now,
  };
  pushCustomItem(state.leads[index], 'documents', document);
  pushCustomItem(state.leads[index], 'auditTrail', {
    id: createId('audit'),
    type: 'document.attached',
    action: `${document.fileName} attached`,
    actor: 'Preview Admin',
    at: now,
  });
  return NextResponse.json(apiSuccess(recordList(state.leads[index], 'documents')), { status: 201 });
}

function leadDuplicates(id: string) {
  const { state, index } = findLead(id);
  if (index < 0) return notFound();
  const lead = state.leads[index];
  const rows = state.leads
    .filter((candidate) => candidate.id !== id)
    .map((candidate) => {
      const signals = [
        lead.email && candidate.email === lead.email ? 'email' : null,
        lead.company && candidate.company === lead.company && candidate.lastName === lead.lastName ? 'company+lastName' : null,
      ].filter(Boolean);
      return signals.length
        ? { ...candidate, duplicateSignals: signals, score: Math.min(100, 45 + signals.length * 20) }
        : null;
    })
    .filter(Boolean);
  return NextResponse.json(apiSuccess(rows));
}

async function handleDev(req: NextRequest, ctx: RouteContext, method: string) {
  const path = normalizePath(ctx.params);
  const [id, action] = path;

  if (method === 'GET' && path.length === 0) return listLeads(req);
  if (method === 'POST' && path.length === 0) return createLead(req);
  if (method === 'PATCH' && id === 'mass-update') return massUpdate(req);
  if (method === 'DELETE' && id === 'mass-delete') return massDelete(req);
  if (method === 'GET' && id && path.length === 1) return getLead(id);
  if (method === 'PATCH' && id && path.length === 1) return updateLead(req, id);
  if (method === 'DELETE' && id && path.length === 1) return deleteLead(id);
  if (method === 'GET' && id && (action === 'documents' || action === 'attachments')) return leadDocuments(id);
  if (method === 'POST' && id && (action === 'documents' || action === 'attachments')) return createLeadDocument(req, id);
  if (method === 'GET' && id && action === 'field-history') {
    const { state, index } = findLead(id);
    if (index < 0) return notFound();
    return NextResponse.json(apiSuccess(recordList(state.leads[index], 'fieldHistory')));
  }
  if (method === 'GET' && id && action === 'audit') {
    const { state, index } = findLead(id);
    if (index < 0) return notFound();
    return NextResponse.json(apiSuccess(recordList(state.leads[index], 'auditTrail')));
  }
  if (method === 'GET' && id && action === 'outbox') {
    const { state, index } = findLead(id);
    if (index < 0) return notFound();
    return NextResponse.json(apiSuccess(recordList(state.leads[index], 'outboxEvents')));
  }
  if (method === 'GET' && id && action === 'duplicates') return leadDuplicates(id);
  if (method === 'PATCH' && id && action === 'status') {
    const body = (await req.json().catch(() => ({}))) as { status?: string };
    return updateLead(req, id, { status: body.status });
  }
  if (method === 'POST' && id && action === 'convert') return convertLead(req, id);

  return NextResponse.json(apiError('Unsupported lead preview route'), { status: 404 });
}

export const GET = (req: NextRequest, ctx: RouteContext) =>
  DEV_PREVIEW_ENABLED ? handleDev(req, ctx, 'GET') : proxy(req, ctx, 'GET');
export const POST = (req: NextRequest, ctx: RouteContext) =>
  DEV_PREVIEW_ENABLED ? handleDev(req, ctx, 'POST') : proxy(req, ctx, 'POST');
export const PATCH = (req: NextRequest, ctx: RouteContext) =>
  DEV_PREVIEW_ENABLED ? handleDev(req, ctx, 'PATCH') : proxy(req, ctx, 'PATCH');
export const DELETE = (req: NextRequest, ctx: RouteContext) =>
  DEV_PREVIEW_ENABLED ? handleDev(req, ctx, 'DELETE') : proxy(req, ctx, 'DELETE');
