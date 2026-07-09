import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

const AUTH_URL = process.env.AUTH_SERVICE_URL ?? 'http://auth-service:3010/api/v1';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const auth = req.headers.get('authorization') ?? '';

    const res = await fetch(`${AUTH_URL}/tenants`, {
      headers: { Authorization: auth },
    }).catch(() => null);

    if (res && res.ok) {
      const tenants = await res.json().catch(() => null);
      if (tenants) {
        const data = Array.isArray(tenants.data) ? tenants.data : Array.isArray(tenants) ? tenants : [];
        return NextResponse.json({
          data: data.map((tenant: Record<string, unknown>) => ({
            id: tenant.id ?? 'unknown',
            name: tenant.name ?? 'Unknown Tenant',
            plan: tenant.plan ?? 'starter',
            usersCount: (tenant.usersCount ?? tenant.userCount ?? tenant.users) ?? null,
            dealsCount: (tenant.dealsCount ?? tenant.dealCount ?? tenant.deals) ?? null,
            storageUsed: tenant.storageUsed ?? null,
            createdAt: tenant.createdAt ?? new Date().toISOString(),
            status: (tenant.isActive === true) ? 'Active' : (tenant.isActive === false) ? 'Suspended' : (tenant.status as string) ?? 'Unknown',
          })),
        });
      }
    }

    return NextResponse.json({ data: [] });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const auth = req.headers.get('authorization') ?? '';
    const body = await req.text();

    const res = await fetch(`${AUTH_URL}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body,
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
