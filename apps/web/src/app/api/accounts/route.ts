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

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    let rows = [...getDevPreviewState().accounts];
    const q = req.nextUrl.searchParams.get('search')?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((account) =>
        [account.name, account.industry, account.city, account.country]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }

  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts${qs ? `?${qs}` : ''}`, {
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
    const validation = validateDevObject('account', body as Record<string, unknown>);
    if (!validation.valid) {
      return NextResponse.json(
        apiError(Object.values(validation.errors)[0] ?? 'Account validation failed', 'VALIDATION_FAILED'),
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const account = {
      id: createId('account'),
      tenantId: 'default',
      ownerId: String(body.ownerId ?? 'dev-admin'),
      code: String(body.code ?? `ACC-${new Date().getFullYear()}-${String(state.accounts.length + 1).padStart(6, '0')}`),
      name: String(body.name ?? 'New Account'),
      legalName: body.legalName ?? null,
      tradeName: body.tradeName ?? null,
      type: body.type ?? 'PROSPECT',
      lifecycleStage: body.lifecycleStage ?? null,
      industry: body.industry ?? null,
      subIndustry: body.subIndustry ?? null,
      website: body.website ?? null,
      phone: body.phone ?? null,
      fax: body.fax ?? null,
      email: body.email ?? null,
      billingAddressLine1: body.billingAddressLine1 ?? body.billingAddress ?? null,
      billingAddressLine2: body.billingAddressLine2 ?? null,
      billingCountry: body.billingCountry ?? null,
      billingCity: body.billingCity ?? null,
      billingState: body.billingState ?? null,
      billingPostalCode: body.billingPostalCode ?? null,
      billingLatitude: body.billingLatitude ?? null,
      billingLongitude: body.billingLongitude ?? null,
      shippingAddressLine1: body.shippingAddressLine1 ?? body.shippingAddress ?? null,
      shippingAddressLine2: body.shippingAddressLine2 ?? null,
      shippingCountry: body.shippingCountry ?? null,
      shippingCity: body.shippingCity ?? null,
      shippingState: body.shippingState ?? null,
      shippingPostalCode: body.shippingPostalCode ?? null,
      shippingLatitude: body.shippingLatitude ?? null,
      shippingLongitude: body.shippingLongitude ?? null,
      shippingInstructions: body.shippingInstructions ?? null,
      sameAsBilling: Boolean(body.sameAsBilling ?? false),
      tier: body.tier ?? 'STANDARD',
      status: body.status ?? 'ACTIVE',
      healthScore: body.healthScore ?? 70,
      riskLevel: body.riskLevel ?? 'LOW',
      annualRevenue: body.annualRevenue ?? null,
      employeeCount: body.employeeCount ?? null,
      taxId: body.taxId ?? null,
      vatNumber: body.vatNumber ?? null,
      commercialRegistrationNumber: body.commercialRegistrationNumber ?? null,
      paymentTerms: body.paymentTerms ?? null,
      creditLimit: body.creditLimit ?? null,
      currency: body.currency ?? 'USD',
      customFields: body.customFields ?? {},
      tags: Array.isArray(body.tags) ? body.tags : [],
      createdAt: now,
      updatedAt: now,
    };
    state.accounts.unshift(account);
    return NextResponse.json(apiSuccess(account), { status: 201 });
  }

  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts`, {
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
