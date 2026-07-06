import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Per-tenant first-run onboarding state.
 *
 * Uses the same durable JSON-file-under-`data/` mechanism as the feature-flags
 * and system-settings BFF routes, but keyed per tenant (`data/onboarding/<tenant>.json`).
 * Unlike those routes it is NOT admin-gated: onboarding progress is not sensitive
 * and the dashboard must read it for any authenticated user to decide whether to
 * surface the checklist. Writes require a bearer token (any authenticated user).
 *
 * The tenant is taken from the forwarded `x-tenant-id` header (same convention as
 * the CRM BFF routes), falling back to `default`.
 */

interface OnboardingState {
  completed: boolean;
  /** Per-step completion, keyed by wizard step id. */
  steps: Record<string, boolean>;
  updatedAt: string;
}

const DEFAULT_STATE: OnboardingState = {
  completed: false,
  steps: {},
  updatedAt: new Date(0).toISOString(),
};

/** Restrict the tenant id to a safe filename component. */
function safeTenant(raw: string | null): string {
  const t = (raw || 'default').toLowerCase();
  return /^[a-z0-9._-]{1,128}$/.test(t) ? t : 'default';
}

function stateFile(tenant: string): string {
  return path.join(process.cwd(), 'data', 'onboarding', `${tenant}.json`);
}

async function readState(tenant: string): Promise<OnboardingState> {
  try {
    const raw = await readFile(stateFile(tenant), 'utf8');
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      completed: Boolean(parsed.completed),
      steps: parsed.steps && typeof parsed.steps === 'object' ? (parsed.steps as Record<string, boolean>) : {},
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : DEFAULT_STATE.updatedAt,
    };
  } catch {
    return { ...DEFAULT_STATE, steps: {} };
  }
}

export async function GET(req: NextRequest) {
  const tenant = safeTenant(req.headers.get('x-tenant-id'));
  const state = await readState(tenant);
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  // Any authenticated request may update onboarding progress.
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenant = safeTenant(req.headers.get('x-tenant-id'));

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const current = await readState(tenant);

  const stepsPatch =
    body.steps && typeof body.steps === 'object'
      ? Object.fromEntries(
          Object.entries(body.steps as Record<string, unknown>).map(([k, v]) => [k, Boolean(v)])
        )
      : {};

  const next: OnboardingState = {
    completed: typeof body.completed === 'boolean' ? body.completed : current.completed,
    steps: { ...current.steps, ...stepsPatch },
    updatedAt: new Date().toISOString(),
  };

  try {
    await mkdir(path.dirname(stateFile(tenant)), { recursive: true });
    await writeFile(stateFile(tenant), JSON.stringify(next, null, 2), 'utf8');
  } catch {
    return NextResponse.json({ error: 'Failed to persist onboarding state' }, { status: 500 });
  }
  return NextResponse.json(next);
}
