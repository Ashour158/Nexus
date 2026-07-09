import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

/**
 * Feature-flags BFF (PC-25). Durable store now lives in metadata-service as the
 * tenant-scoped `FeatureFlag` model (GET/PUT/POST /api/v1/feature-flags). This
 * route is admin-gated, forwards the caller's Bearer token, and preserves the
 * response shape the admin Feature Flags page expects. Unknown-to-DB keys fall
 * back to the code-defined defaults below so nothing regresses on a fresh tenant.
 */

const METADATA_SERVICE = process.env.METADATA_SERVICE_URL || 'http://localhost:3004';
const FLAGS_ENDPOINT = `${METADATA_SERVICE}/api/v1/feature-flags`;

type Flag = {
  name: string;
  description: string;
  enabled: boolean;
  tenants: string[];
  users: string;
  rollout: number;
  modifiedBy: string;
  modifiedAt: string;
};

// Backend row shape (metadata-service FeatureFlag model).
type FlagRow = {
  key: string;
  enabled: boolean;
  description: string | null;
  rollout: number;
  tenants: unknown;
  users: string;
  updatedBy: string;
  updatedAt: string;
};

// Default flags — identical set to what the file store previously seeded. Used
// to backfill any known key with no DB row so the admin page never regresses.
const DEFAULT_FLAGS: Flag[] = [
  { name: 'RULE_FORECASTING', description: 'Enable rule-based deal scoring and forecast', enabled: true, tenants: [], users: '', rollout: 50, modifiedBy: 'system', modifiedAt: new Date(0).toISOString() },
  { name: 'CALLING_MODULE', description: 'Show calling/dialer UI', enabled: false, tenants: [], users: '', rollout: 0, modifiedBy: 'system', modifiedAt: new Date(0).toISOString() },
  { name: 'EMAIL_SEQUENCES', description: 'Enable cadence email builder', enabled: true, tenants: ['Tenant 1'], users: '', rollout: 100, modifiedBy: 'system', modifiedAt: new Date(0).toISOString() },
  { name: 'WHATSAPP_INTEGRATION', description: 'WhatsApp message sending from contacts', enabled: false, tenants: [], users: '', rollout: 20, modifiedBy: 'system', modifiedAt: new Date(0).toISOString() },
  { name: 'PRODUCT_CATALOG', description: 'Product/price book in deals', enabled: true, tenants: [], users: '', rollout: 100, modifiedBy: 'system', modifiedAt: new Date(0).toISOString() },
  { name: 'COMMISSION_TRACKER', description: 'Commission calculator and leaderboard', enabled: true, tenants: [], users: '', rollout: 100, modifiedBy: 'system', modifiedAt: new Date(0).toISOString() },
  { name: 'CUSTOMER_PORTAL', description: 'External customer portal', enabled: true, tenants: ['Tenant 3'], users: '', rollout: 60, modifiedBy: 'system', modifiedAt: new Date(0).toISOString() },
  { name: 'GDPR_EXPORT', description: 'Self-service data export (GDPR Art. 20)', enabled: false, tenants: [], users: '', rollout: 0, modifiedBy: 'system', modifiedAt: new Date(0).toISOString() },
  { name: 'ADVANCED_REPORTING', description: 'Custom report builder', enabled: true, tenants: ['Tenant 2'], users: '', rollout: 80, modifiedBy: 'system', modifiedAt: new Date(0).toISOString() },
  { name: 'MOBILE_APP', description: 'Allow mobile app API access', enabled: true, tenants: [], users: '', rollout: 90, modifiedBy: 'system', modifiedAt: new Date(0).toISOString() },
];

function rowToFlag(row: FlagRow): Flag {
  return {
    name: row.key,
    description: row.description ?? '',
    enabled: Boolean(row.enabled),
    tenants: Array.isArray(row.tenants) ? row.tenants.filter((t): t is string => typeof t === 'string') : [],
    users: typeof row.users === 'string' ? row.users : '',
    rollout: typeof row.rollout === 'number' ? row.rollout : 0,
    modifiedBy: row.updatedBy || 'system',
    modifiedAt: row.updatedAt || new Date(0).toISOString(),
  };
}

/** Merge DB rows over the code defaults: DB wins per key, defaults backfill. */
function mergeWithDefaults(rows: FlagRow[]): Flag[] {
  const byKey = new Map<string, Flag>();
  for (const def of DEFAULT_FLAGS) byKey.set(def.name, def);
  for (const row of rows) byKey.set(row.key, rowToFlag(row));
  return Array.from(byKey.values());
}

function authOf(req: NextRequest): string | null {
  return req.headers.get('authorization');
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status });
  }

  const auth = authOf(req);
  try {
    const res = await fetch(FLAGS_ENDPOINT, {
      headers: auth ? { Authorization: auth } : {},
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`metadata-service ${res.status}`);
    const json = (await res.json()) as { data?: FlagRow[] };
    const rows = Array.isArray(json.data) ? json.data : [];
    return NextResponse.json({ flags: mergeWithDefaults(rows) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Store unreachable — serve code defaults so the admin page still renders.
    return NextResponse.json({ flags: DEFAULT_FLAGS }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 403;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status });
  }

  let body: { flags?: unknown };
  try {
    body = (await req.json()) as { flags?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.flags)) {
    return NextResponse.json({ error: '`flags` must be an array' }, { status: 400 });
  }

  const auth = authOf(req);
  try {
    const res = await fetch(FLAGS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      // The backend accepts `name` as a `key` fallback, so the page's Flag[]
      // (which uses `name`) forwards as-is; rollout/tenants/users/description
      // are persisted too.
      body: JSON.stringify({ flags: body.flags }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      const message = (detail as { error?: string }).error ?? 'Save failed';
      return NextResponse.json({ error: message }, { status: res.status });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Feature-flag store unreachable' }, { status: 502 });
  }
}
