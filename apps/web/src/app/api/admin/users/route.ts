import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

function mockUsers() {
  return Array.from({ length: 180 }).map((_, i) => ({
    id: String(i + 1),
    name: `User ${i + 1}`,
    email: `user${i + 1}@nexuscrm.app`,
    role: i % 6 === 0 ? 'admin' : i % 3 === 0 ? 'manager' : 'ae',
    tenant: `Tenant ${(i % 8) + 1}`,
    status: i % 9 === 0 ? 'Suspended' : i % 11 === 0 ? 'Invited' : 'Active',
    joined: new Date(Date.now() - i * 86400000).toISOString(),
    lastActive: new Date(Date.now() - i * 3600000).toISOString(),
  }));
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') ?? '').toLowerCase();
    const tenant = searchParams.get('tenant') ?? 'all';
    const role = searchParams.get('role') ?? 'all';
    const status = searchParams.get('status') ?? 'all';
    const page = Number(searchParams.get('page') ?? '1');
    const limit = Number(searchParams.get('limit') ?? '50');

    const filtered = mockUsers().filter((u) => {
      const matchesQ = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchesTenant = tenant === 'all' || u.tenant === tenant;
      const matchesRole = role === 'all' || u.role === role;
      const matchesStatus = status === 'all' || u.status === status;
      return matchesQ && matchesTenant && matchesRole && matchesStatus;
    });

    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return NextResponse.json({ data, page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    return NextResponse.json({ id: crypto.randomUUID(), ...body, createdAt: new Date().toISOString() }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
