import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  createId,
  getDevPreviewState,
  validateDevObject,
} from '@/lib/server/dev-preview-data';
import {
  applyModuleListQuery,
  moduleListResponse,
  parseModuleListParams,
} from '@/lib/server/module-api';
import { findDuplicateContacts, hardenContactRecord } from '@/lib/server/contact-hardening';

const CONTACTS_SERVICE_URL = process.env.CONTACTS_SERVICE_URL || process.env.CRM_SERVICE_URL || 'http://localhost:3041';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (DEV_PREVIEW_ENABLED) {
    const params = parseModuleListParams(req.nextUrl.searchParams, {
      defaultSortBy: 'createdAt',
      filterKeys: ['ownerId', 'accountId'],
    });
    const includeArchived = req.nextUrl.searchParams.get('includeArchived') === 'true';
    const sourceRows = includeArchived
      ? [...getDevPreviewState().contacts]
      : getDevPreviewState().contacts.filter((contact) => contact.isActive !== false);
    const rows = applyModuleListQuery(sourceRows, params, {
      searchFields: ['firstName', 'lastName', 'email', 'jobTitle', 'department'],
    });
    return NextResponse.json(moduleListResponse(rows, params));
  }

  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts${qs ? `?${qs}` : ''}`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
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
    const validation = validateDevObject('contact', body as Record<string, unknown>);
    if (!validation.valid) {
      return NextResponse.json(
        apiError(Object.values(validation.errors)[0] ?? 'Contact validation failed', 'VALIDATION_FAILED'),
        { status: 422 }
      );
    }

    const idempotencyKey = req.headers.get('idempotency-key')?.trim();
    if (idempotencyKey) {
      const existing = state.contacts.find(
        (contact) =>
          typeof contact.customFields === 'object' &&
          contact.customFields &&
          (contact.customFields as Record<string, unknown>).idempotencyKey === idempotencyKey
      );
      if (existing) return NextResponse.json(apiSuccess(hardenContactRecord(existing)));
    }

    const duplicate = findDuplicateContacts(state.contacts, body as Record<string, unknown>)[0];

    if (duplicate) {
      return NextResponse.json(
        {
          ...apiError(
            `Possible duplicate contact: ${duplicate.firstName} ${duplicate.lastName}`,
            'DUPLICATE_CONTACT'
          ),
          duplicate,
        },
        { status: 409 }
      );
    }

    const customFields = {
      ...(typeof body.customFields === 'object' && body.customFields ? body.customFields : {}),
      idempotencyKey,
      photoUrl: body.photoUrl ?? body.customFields?.photoUrl ?? '',
      whatsapp: body.whatsapp ?? body.customFields?.whatsapp ?? '',
      secondPhone: body.secondPhone ?? body.customFields?.secondPhone ?? '',
      lifecycleStage: body.lifecycleStage ?? body.customFields?.lifecycleStage ?? 'New relationship',
      buyingCommitteeRole: body.buyingCommitteeRole ?? body.customFields?.buyingCommitteeRole,
      influenceLevel: body.influenceLevel ?? body.customFields?.influenceLevel,
      productTags: body.productTags ?? body.customFields?.productTags ?? [],
      industryTags: body.industryTags ?? body.customFields?.industryTags ?? [],
      documents: body.documents ?? body.customFields?.documents ?? [],
      emailThreads: body.emailThreads ?? body.customFields?.emailThreads ?? [],
      fieldHistory: [],
      outboxEvents: [
        {
          id: createId('outbox'),
          topic: 'contact.created',
          aggregateType: 'contact',
          aggregateId: 'pending',
          actor: String(body.ownerId ?? 'dev-admin'),
          status: 'pending',
          createdAt: new Date().toISOString(),
          payload: { accountId: body.accountId, email: body.email },
        },
      ],
      auditTrail: [
        {
          id: createId('audit'),
          action: 'Contact created',
          actor: String(body.ownerId ?? 'dev-admin'),
          at: new Date().toISOString(),
        },
      ],
    };

    const contact = hardenContactRecord({
      id: createId('contact'),
      tenantId: 'default',
      ownerId: String(body.ownerId ?? 'dev-admin'),
      code: String(body.code ?? `CON-${new Date().getFullYear()}-${String(state.contacts.length + 1).padStart(6, '0')}`),
      accountId: String(body.accountId),
      firstName: String(body.firstName ?? 'New'),
      lastName: String(body.lastName ?? 'Contact'),
      email: body.email ? String(body.email) : null,
      phone: body.phone ? String(body.phone) : null,
      mobile: body.mobile ? String(body.mobile) : null,
      jobTitle: body.jobTitle ?? null,
      department: body.department ?? null,
      linkedInUrl: body.linkedInUrl ?? null,
      twitterHandle: body.twitterHandle ?? null,
      country: body.country ?? null,
      city: body.city ?? null,
      address: body.address ?? null,
      timezone: body.timezone ?? 'Africa/Cairo',
      preferredChannel: body.preferredChannel ?? 'email',
      doNotEmail: Boolean(body.doNotEmail ?? false),
      doNotCall: Boolean(body.doNotCall ?? false),
      gdprConsent: Boolean(body.gdprConsent ?? false),
      gdprConsentAt: body.gdprConsent ? new Date().toISOString() : null,
      lastContactedAt: null,
      customFields,
      tags: Array.isArray(body.tags) ? body.tags : [],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const outboxEvents = Array.isArray(contact.customFields?.outboxEvents) ? contact.customFields.outboxEvents : [];
    contact.customFields = {
      ...contact.customFields,
      outboxEvents: outboxEvents.map((event) =>
        event && typeof event === 'object' ? { ...event, aggregateId: contact.id } : event
      ),
    };
    state.contacts.unshift(contact);
    return NextResponse.json(apiSuccess(contact), { status: 201 });
  }

  const res = await fetch(`${CONTACTS_SERVICE_URL}/api/v1/contacts`, {
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
