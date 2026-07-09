import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  createId,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;
const TRIGGERS = new Set(['deal_stage_changed', 'rfq_received', 'deal_created', 'quote_expiring', 'discount_requested']);
const ACTIONS = new Set(['create_quote', 'assign_owner', 'request_approval', 'render_template', 'send_notification']);

function validateRule(input: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const name = String(input.name ?? '').trim();
  const trigger = String(input.trigger ?? '').trim();
  const conditions = input.conditions && typeof input.conditions === 'object' && !Array.isArray(input.conditions)
    ? input.conditions as Record<string, unknown>
    : {};
  const actions = Array.isArray(input.actions) ? input.actions as Array<Record<string, unknown>> : [];

  if (name.length < 3) errors.name = 'Rule name must be at least 3 characters.';
  if (!TRIGGERS.has(trigger)) errors.trigger = 'Choose a supported automation trigger.';
  if (Object.keys(conditions).length === 0) errors.conditions = 'At least one condition is required before a rule can run.';
  if (actions.length === 0) errors.actions = 'At least one action is required.';
  actions.forEach((action, index) => {
    if (!ACTIONS.has(String(action.type ?? ''))) errors[`actions.${index}.type`] = 'Action type is not supported.';
  });

  return { valid: Object.keys(errors).length === 0, errors, name, trigger, conditions, actions };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(apiSuccess(getDevPreviewState().quoteAutomationRules));
  }

  try {
    const res = await fetch(`${FINANCE_URL}/quote-automation-rules`, {
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess([]));
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.text();
  const parsedBody = body ? JSON.parse(body) as Record<string, unknown> : {};
  const validated = validateRule(parsedBody);
  if (!validated.valid) {
    return NextResponse.json(
      { ...apiError('Quote automation rule is missing required data', 'VALIDATION_ERROR'), details: validated.errors },
      { status: 422 }
    );
  }

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const rule = {
      id: createId('quote-rule'),
      name: validated.name,
      trigger: validated.trigger,
      isActive: typeof parsedBody.isActive === 'boolean' ? parsedBody.isActive : true,
      conditions: validated.conditions,
      actions: validated.actions,
    };
    state.quoteAutomationRules.unshift(rule);
    return NextResponse.json(apiSuccess(rule), { status: 201 });
  }

  try {
    const res = await fetch(`${FINANCE_URL}/quote-automation-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess(null), { status: 202 });
  }
}
