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

const CRM_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';
const DEALS_SERVICE_URL = process.env.DEALS_SERVICE_URL || 'http://localhost:3042';
type PreviewRecord = Record<string, unknown> & {
  customFields?: Record<string, unknown>;
  updatedAt?: string;
};

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

async function proxy(
  req: NextRequest,
  { params }: { params: { path?: string[] } },
  method: string
) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = params.path?.join('/') ?? '';
  const body = method !== 'GET' ? await req.text() : undefined;
  const search = req.nextUrl.searchParams.toString();

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const segments = params.path ?? [];

    if (method === 'GET' && segments.length === 0) {
      let rows = [...state.deals];
      const pipelineId = req.nextUrl.searchParams.get('pipelineId');
      const stageId = req.nextUrl.searchParams.get('stageId');
      const ownerId = req.nextUrl.searchParams.get('ownerId');
      const status = req.nextUrl.searchParams.get('status');
      const searchTerm = req.nextUrl.searchParams.get('search')?.toLowerCase();

      if (pipelineId) rows = rows.filter((deal) => deal.pipelineId === pipelineId);
      if (stageId) rows = rows.filter((deal) => deal.stageId === stageId);
      if (ownerId) rows = rows.filter((deal) => deal.ownerId === ownerId);
      if (status) rows = rows.filter((deal) => deal.status === status);
      if (searchTerm) {
        rows = rows.filter(
          (deal) =>
            deal.name.toLowerCase().includes(searchTerm) ||
            deal.accountName.toLowerCase().includes(searchTerm)
        );
      }

      return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
    }

    if (method === 'POST' && segments.length === 0) {
      const parsed = body ? JSON.parse(body) : {};
      const stageId = String(parsed.stageId ?? state.pipelines[0]?.stages[0]?.id ?? 'stage-new');
      const stage = state.pipelines.flatMap((pipeline) => pipeline.stages).find((candidate) => candidate.id === stageId);
      const deal = {
        tenantId: 'default',
        ownerId: String(parsed.ownerId ?? 'dev-admin'),
        accountId: String(parsed.accountId ?? 'acct-preview'),
        pipelineId: String(parsed.pipelineId ?? state.pipelines[0]?.id ?? 'pipeline-enterprise'),
        stageId,
        stage: stage ? { id: stage.id, name: stage.name } : undefined,
        id: createId('deal'),
        code: String(parsed.code ?? `OPP-${new Date().getFullYear()}-${String(state.deals.length + 1).padStart(6, '0')}`),
        name: String(parsed.name ?? 'New Preview Deal'),
        accountName: String(parsed.accountName ?? 'Preview Account'),
        amount: String(parsed.amount ?? '0'),
        currency: String(parsed.currency ?? 'USD'),
        probability: Number(parsed.probability ?? stage?.probability ?? 10),
        expectedCloseDate: parsed.expectedCloseDate ?? null,
        actualCloseDate: null,
        status: 'OPEN' as const,
        lostReason: null,
        lostDetail: null,
        forecastCategory: 'PIPELINE' as const,
        meddicicScore: 0,
        meddicicData: {},
        aiWinProbability: null,
        aiInsights: null,
        competitors: [],
        source: null,
        campaignId: null,
        customFields:
          parsed.customFields && typeof parsed.customFields === 'object'
            ? parsed.customFields
            : {},
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.filter((tag: unknown) => typeof tag === 'string')
          : [],
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const validation = validateDevObject('deal', deal);
      if (!validation.valid) {
        return NextResponse.json(
          {
            ...apiError('Deal validation failed', 'VALIDATION_FAILED'),
            validation: validation.errors,
          },
          { status: 422 }
        );
      }
      state.deals.unshift(deal);
      return NextResponse.json(apiSuccess(deal), { status: 201 });
    }

    const id = segments[0];
    const deal = state.deals.find((candidate) => candidate.id === id);
    if (!deal) {
      return NextResponse.json(apiError('Deal not found', 'NOT_FOUND'), { status: 404 });
    }

    if (method === 'GET' && segments.length === 1) {
      return NextResponse.json(apiSuccess(deal));
    }

    if (method === 'GET' && (segments[1] === 'documents' || segments[1] === 'attachments')) {
      return NextResponse.json(apiSuccess(recordList(deal, 'documents')));
    }

    if (method === 'POST' && (segments[1] === 'documents' || segments[1] === 'attachments')) {
      const parsed = body ? JSON.parse(body) : {};
      const now = new Date().toISOString();
      const document = {
        id: createId('deal-doc'),
        fileName: String(parsed.fileName ?? parsed.name ?? 'Deal document'),
        mimeType: String(parsed.mimeType ?? 'application/octet-stream'),
        fileSize: Number(parsed.fileSize ?? parsed.size ?? 0),
        category: String(parsed.category ?? 'deal'),
        uploadedBy: 'dev-admin',
        createdAt: now,
        updatedAt: now,
      };
      pushCustomItem(deal, 'documents', document);
      pushCustomItem(deal, 'auditTrail', {
        id: createId('audit'),
        type: 'document.attached',
        action: `${document.fileName} attached`,
        actor: 'Preview Admin',
        at: now,
      });
      return NextResponse.json(apiSuccess(recordList(deal, 'documents')), { status: 201 });
    }

    if (method === 'GET' && segments[1] === 'field-history') {
      return NextResponse.json(apiSuccess(recordList(deal, 'fieldHistory')));
    }

    if (method === 'GET' && segments[1] === 'audit') {
      return NextResponse.json(apiSuccess(recordList(deal, 'auditTrail')));
    }

    if (method === 'GET' && segments[1] === 'outbox') {
      return NextResponse.json(apiSuccess(recordList(deal, 'outboxEvents')));
    }

    if (method === 'GET' && segments[1] === 'quotes') {
      const rows = state.quotes
        .filter((quote) => quote.dealId === id)
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
      return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
    }

    if (method === 'GET' && segments[1] === 'orders') {
      const rows = state.orders
        .filter((order) => order.dealId === id)
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
      return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
    }

    if (method === 'GET' && segments[1] === 'notes') {
      return NextResponse.json(apiSuccess(paginated([], req.nextUrl.searchParams)));
    }

    if (method === 'GET' && segments[1] === 'stakeholders') {
      const primaryContactIds = Array.isArray(deal.contactIds) ? deal.contactIds : [];
      const accountContacts = state.contacts.filter((contact) => {
        return contact.accountId === deal.accountId || primaryContactIds.includes(contact.id);
      });
      const rows = accountContacts.map((contact, index) => ({
        id: contact.id,
        name: `${contact.firstName} ${contact.lastName}`,
        role: String(contact.jobTitle ?? (index === 0 ? 'Primary buyer' : 'Stakeholder')),
        email: contact.email,
        influence: index === 0 ? 'High' : 'Medium',
      }));
      return NextResponse.json(apiSuccess({ data: rows }));
    }

    if (method === 'GET' && segments[1] === 'competitors') {
      const competitors = Array.isArray(deal.competitors) ? deal.competitors : [];
      const rows = competitors.map((item, index) =>
        typeof item === 'string'
          ? { id: `${id}-competitor-${index + 1}`, name: item, strength: null, threatLevel: 'Medium' }
          : item
      );
      return NextResponse.json(apiSuccess({ data: rows }));
    }

    if (method === 'GET' && segments[1] === 'timeline') {
      const activityRows = state.activities
        .filter((activity) => activity.dealId === id)
        .map((activity) => ({
          id: `activity:${activity.id}`,
          type: 'ACTIVITY',
          at: activity.createdAt,
          title: `${activity.type}: ${activity.subject}`,
          description: activity.description ?? null,
          actorId: activity.ownerId,
          metadata: activity,
        }));
      const quoteRows = state.quotes
        .filter((quote) => quote.dealId === id)
        .map((quote) => ({
          id: `quote:${quote.id}`,
          type: 'QUOTE',
          at: quote.createdAt,
          title: `Quote ${quote.quoteNumber}`,
          description: `${quote.status} - ${quote.total} ${quote.currency}`,
          actorId: quote.ownerId,
          metadata: quote,
        }));
      const rows = [...activityRows, ...quoteRows].sort((left, right) => String(right.at).localeCompare(String(left.at)));
      return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
    }

    if (method === 'PATCH') {
      const parsed = body ? JSON.parse(body) : {};
      const previous = { ...deal };
      const now = new Date().toISOString();
      const proposed = { ...deal };
      if (segments[1] === 'stage') {
        proposed.stageId = String(parsed.stageId ?? deal.stageId);
        const stage = state.pipelines.flatMap((pipeline) => pipeline.stages).find((candidate) => candidate.id === proposed.stageId);
        proposed.stage = stage ? { id: stage.id, name: stage.name } : deal.stage;
      } else {
        Object.assign(proposed, parsed);
      }
      proposed.updatedAt = now;
      const validation = validateDevObject('deal', proposed);
      if (!validation.valid) {
        return NextResponse.json(
          {
            ...apiError('Deal validation failed', 'VALIDATION_FAILED'),
            validation: validation.errors,
          },
          { status: 422 }
        );
      }
      Object.assign(deal, proposed);
      deal.updatedAt = now;
      const changedFields = Object.keys(parsed).filter((field) => previous[field] !== deal[field]);
      if (segments[1] === 'stage' && previous.stageId !== deal.stageId) changedFields.push('stageId');
      deal.customFields = {
        ...(deal.customFields ?? {}),
        fieldHistory: [
          ...changedFields.map((field) => ({
            id: createId('field'),
            objectType: 'deal',
            objectId: id,
            fieldName: field,
            oldValue: previous[field] == null ? null : String(previous[field]),
            newValue: deal[field] == null ? null : String(deal[field]),
            changedBy: 'dev-admin',
            changedByName: 'Preview Admin',
            changedAt: now,
          })),
          ...recordList(previous, 'fieldHistory'),
        ],
        auditTrail: [
          {
            id: createId('audit'),
            type: segments[1] === 'stage' ? 'deal.stage_changed' : 'deal.updated',
            action: changedFields.length ? `Updated ${changedFields.join(', ')}` : 'Deal touched',
            actor: 'Preview Admin',
            at: now,
          },
          ...recordList(previous, 'auditTrail'),
        ],
        outboxEvents: [
          {
            id: createId('outbox'),
            type: segments[1] === 'stage' ? 'deal.stage_changed' : 'deal.updated',
            aggregateId: id,
            status: 'PENDING',
            createdAt: now,
            payload: { dealId: id, changedFields },
          },
          ...recordList(previous, 'outboxEvents'),
        ],
      };
      return NextResponse.json(apiSuccess(deal));
    }

    if (method === 'POST' && segments[1] === 'clone') {
      const clone = {
        ...deal,
        id: createId('deal'),
        code: `OPP-${new Date().getFullYear()}-${String(state.deals.length + 1).padStart(6, '0')}`,
        name: body ? String(JSON.parse(body).name ?? `${deal.name} Copy`) : `${deal.name} Copy`,
        status: 'OPEN' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.deals.unshift(clone);
      return NextResponse.json(apiSuccess(clone), { status: 201 });
    }

    if (method === 'POST' && segments[1] === 'restore') {
      const now = new Date().toISOString();
      const previous = { ...deal };
      deal.deletedAt = null;
      deal.updatedAt = now;
      deal.customFields = {
        ...(deal.customFields ?? {}),
        auditTrail: [
          {
            id: createId('audit'),
            type: 'deal.restored',
            action: 'Deal restored',
            actor: 'Preview Admin',
            at: now,
          },
          ...recordList(previous, 'auditTrail'),
        ],
        outboxEvents: [
          {
            id: createId('outbox'),
            type: 'deal.restored',
            aggregateId: id,
            status: 'PENDING',
            createdAt: now,
            payload: { dealId: id },
          },
          ...recordList(previous, 'outboxEvents'),
        ],
      };
      return NextResponse.json(apiSuccess(deal));
    }

    if (method === 'DELETE') {
      const now = new Date().toISOString();
      const previous = { ...deal };
      deal.deletedAt = now;
      deal.updatedAt = now;
      deal.customFields = {
        ...(deal.customFields ?? {}),
        auditTrail: [
          {
            id: createId('audit'),
            type: 'deal.archived',
            action: 'Deal archived',
            actor: 'Preview Admin',
            at: now,
          },
          ...recordList(previous, 'auditTrail'),
        ],
        outboxEvents: [
          {
            id: createId('outbox'),
            type: 'deal.archived',
            aggregateId: id,
            status: 'PENDING',
            createdAt: now,
            payload: { dealId: id },
          },
          ...recordList(previous, 'outboxEvents'),
        ],
      };
      return NextResponse.json(apiSuccess({ id, deleted: true, archived: true }));
    }
  }

  const segments = params.path ?? [];
  if (method === 'GET' && segments.length === 2 && segments[1] === 'quotes') {
    const dealId = segments[0];
    const res = await fetch(
      `${DEALS_SERVICE_URL}/api/v1/data/quote-projections/deal/${encodeURIComponent(dealId)}${search ? `?${search}` : ''}`,
      {
        headers: {
          Authorization: auth ?? '',
          'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
        },
        cache: 'no-store',
      }
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

  try {
    const res = await fetch(
      `${CRM_URL}/api/v1/deals${path ? `/${path}` : ''}${method === 'GET' && search ? `?${search}` : ''}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth ?? '',
          'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
        },
        body,
      }
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiError('Deal service unavailable', 'UPSTREAM_UNAVAILABLE'), {
      status: 502,
    });
  }
}

export const GET = (req: NextRequest, ctx: { params: { path?: string[] } }) =>
  proxy(req, ctx, 'GET');
export const POST = (req: NextRequest, ctx: { params: { path?: string[] } }) =>
  proxy(req, ctx, 'POST');
export const PATCH = (req: NextRequest, ctx: { params: { path?: string[] } }) =>
  proxy(req, ctx, 'PATCH');
export const DELETE = (req: NextRequest, ctx: { params: { path?: string[] } }) =>
  proxy(req, ctx, 'DELETE');
