import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

const AUTH_URL = process.env.AUTH_SERVICE_URL ?? 'http://auth-service:3010/api/v1';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const auth = req.headers.get('authorization') ?? '';

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') ?? '';
    const tenant = searchParams.get('tenant') ?? 'all';
    const role = searchParams.get('role') ?? 'all';
    const status = searchParams.get('status') ?? 'all';
    const page = searchParams.get('page') ?? '1';
    const limit = searchParams.get('limit') ?? '50';

    // Build upstream query params
    const upstreamParams = new URLSearchParams();
    if (q) upstreamParams.set('search', q);
    if (page) upstreamParams.set('page', page);
    if (limit) upstreamParams.set('limit', limit);
    // Note: auth-service may not support tenant/role/status filters;
    // we forward what we can and filter client-side as fallback.

    const queryString = upstreamParams.toString();
    const res = await fetch(`${AUTH_URL}/users${queryString ? `?${queryString}` : ''}`, {
      headers: { Authorization: auth },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Upstream error' }));
      return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();

    // Client-side filtering for fields auth-service may not support
    let users = Array.isArray(data.data) ? data.data : [];
    if (tenant !== 'all') {
      users = users.filter((u: Record<string, unknown>) => u.tenantId === tenant || u.tenant === tenant);
    }
    if (role !== 'all') {
      users = users.filter((u: Record<string, unknown>) => {
        const roles = Array.isArray(u.roles) ? u.roles : [];
        return roles.includes(role) || u.role === role;
      });
    }
    if (status !== 'all') {
      users = users.filter((u: Record<string, unknown>) => u.status === status || u.isActive === (status === 'Active'));
    }

    const total = data.total ?? users.length;
    return NextResponse.json({
      data: users,
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const auth = req.headers.get('authorization') ?? '';
    const body = await req.text();

    const res = await fetch(`${AUTH_URL}/users`, {
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
