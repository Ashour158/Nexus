import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, createId, getDevPreviewState, paginated } from '@/lib/server/dev-preview-data';

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    let rows = [...getDevPreviewState().activities];
    const ownerId = req.nextUrl.searchParams.get('ownerId');
    const contactId = req.nextUrl.searchParams.get('contactId');
    const dealId = req.nextUrl.searchParams.get('dealId');
    const accountId = req.nextUrl.searchParams.get('accountId');
    const leadId = req.nextUrl.searchParams.get('leadId');
    const type = req.nextUrl.searchParams.get('type');
    const status = req.nextUrl.searchParams.get('status');
    const overdue = req.nextUrl.searchParams.get('overdue');
    const dueBefore = req.nextUrl.searchParams.get('dueBefore');
    const dueAfter = req.nextUrl.searchParams.get('dueAfter');
    if (ownerId) rows = rows.filter((activity) => activity.ownerId === ownerId);
    if (contactId) rows = rows.filter((activity) => activity.contactId === contactId);
    if (dealId) rows = rows.filter((activity) => activity.dealId === dealId);
    if (accountId) rows = rows.filter((activity) => activity.accountId === accountId);
    if (leadId) rows = rows.filter((activity) => activity.leadId === leadId);
    if (type && type !== 'all') rows = rows.filter((activity) => activity.type === type);
    if (status) rows = rows.filter((activity) => activity.status === status);
    if (overdue === 'true') {
      const now = Date.now();
      rows = rows.filter((activity) => {
        const due = activity.dueDate ? new Date(String(activity.dueDate)).getTime() : null;
        return due !== null && due < now && activity.status !== 'COMPLETED' && activity.status !== 'DONE' && activity.status !== 'CANCELLED';
      });
    }
    if (dueAfter) rows = rows.filter((activity) => !activity.dueDate || new Date(String(activity.dueDate)) >= new Date(dueAfter));
    if (dueBefore) rows = rows.filter((activity) => !activity.dueDate || new Date(String(activity.dueDate)) <= new Date(dueBefore));
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }

  const type = req.nextUrl.searchParams.get('type') ?? 'all';
  const userId = req.headers.get('x-user-id') ?? '';

  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/activities?type=${type}&userId=${userId}`, {
    headers: {
      Authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const activity = {
      id: createId('act'),
      tenantId: 'default',
      ownerId: String(body.ownerId ?? 'dev-admin'),
      code: String(body.code ?? `ACT-${new Date().getFullYear()}-${String(state.activities.length + 1).padStart(6, '0')}`),
      type: String(body.type ?? 'TASK'),
      subject: String(body.subject ?? 'Preview activity'),
      description: body.description ?? null,
      priority: body.priority ?? 'NORMAL',
      status: body.status ?? 'PLANNED',
      dueDate: body.dueDate ?? null,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      completedAt: null,
      duration: body.duration ?? null,
      outcome: null,
      dealId: body.dealId ?? null,
      contactId: body.contactId ?? null,
      leadId: body.leadId ?? null,
      accountId: body.accountId ?? null,
      customFields: {},
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.activities.unshift(activity);
    return NextResponse.json(apiSuccess(activity), { status: 201 });
  }

  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/activities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
