import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

function mockTenants() {
  return Array.from({ length: 35 }).map((_, i) => ({
    id: String(i + 1),
    name: `Tenant ${i + 1}`,
    plan: i % 6 === 0 ? 'Enterprise' : i % 2 === 0 ? 'Pro' : 'Free',
    usersCount: 8 + i,
    dealsCount: 50 + i * 4,
    storageUsed: `${2 + i} GB`,
    createdAt: new Date(Date.now() - i * 86400000 * 10).toISOString(),
    status: i % 8 === 0 ? 'Suspended' : 'Active',
  }));
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json({ data: mockTenants() });
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
