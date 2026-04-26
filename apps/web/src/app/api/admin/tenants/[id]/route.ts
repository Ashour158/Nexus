import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    return NextResponse.json({
      id: params.id,
      name: `Tenant ${params.id}`,
      plan: 'Enterprise',
      users: 145,
      activeDeals: 893,
      revenueTracked: 2800000,
      storageUsed: '96 GB',
      renewalDate: '2026-12-01',
      limits: { maxUsers: 250, maxContacts: 50000, maxStorageGb: 250, maxApiCallsPerDay: 250000 },
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    return NextResponse.json({ id: params.id, ...body, updatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    return NextResponse.json({ deleted: true, id: params.id });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
