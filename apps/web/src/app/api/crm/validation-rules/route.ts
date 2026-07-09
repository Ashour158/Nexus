import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiSuccess,
  apiError,
  createId,
  getDevValidationFieldCatalog,
  getDevPreviewState,
  type DevValidationRule,
} from '@/lib/server/dev-preview-data';

const C = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

function fwd(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    authorization: req.headers.get('authorization') ?? '',
    'Content-Type': 'application/json',
  };
}

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    const objectType = req.nextUrl.searchParams.get('objectType');
    const includeFields = req.nextUrl.searchParams.get('includeFields') === 'true';
    const rules = getDevPreviewState().validationRules.filter((rule) =>
      objectType ? rule.objectType === objectType : true
    );
    if (includeFields) {
      return NextResponse.json(
        apiSuccess({
          rules,
          fields: getDevValidationFieldCatalog(objectType ?? undefined),
        })
      );
    }
    return NextResponse.json(apiSuccess(rules));
  }

  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${C}/api/v1/validation-rules${qs ? `?${qs}` : ''}`, {
    headers: fwd(req),
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    const body = await req.json().catch(() => ({}));
    const now = new Date().toISOString();
    const field = String(body.field ?? '').trim();
    const objectType = String(body.objectType ?? 'contact').trim();
    const state = getDevPreviewState();

    if (!field) {
      return NextResponse.json(apiError('Field is required to create a validation policy.', 'VALIDATION_RULE_FIELD_REQUIRED'), { status: 422 });
    }

    const existing = state.validationRules.find((rule) => rule.objectType === objectType && rule.field === field);
    if (existing) {
      return NextResponse.json(apiError('A validation policy already exists for this module field.', 'VALIDATION_RULE_EXISTS'), { status: 409 });
    }

    const fieldDefinition = getDevValidationFieldCatalog(objectType).find((item) => item.field === field);
    const rule: DevValidationRule = {
      id: String(body.id ?? createId('validation-rule')),
      objectType,
      field,
      label: String(body.label ?? fieldDefinition?.label ?? field),
      ruleType: 'required',
      enabled: Boolean(body.enabled ?? true),
      message: String(body.message ?? fieldDefinition?.defaultMessage ?? `${body.label ?? field} is required.`),
      configurable: Boolean(body.configurable ?? true),
      updatedAt: now,
    };

    state.validationRules.unshift(rule);
    return NextResponse.json(apiSuccess(rule), { status: 201 });
  }

  const body = await req.text();
  const res = await fetch(`${C}/api/v1/validation-rules`, {
    method: 'POST',
    headers: fwd(req),
    body,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
