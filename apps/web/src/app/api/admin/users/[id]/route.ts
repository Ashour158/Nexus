import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    return NextResponse.json({
      id: params.id,
      name: `User ${params.id}`,
      email: `user${params.id}@nexuscrm.app`,
      role: 'ae',
      tenant: 'Tenant 1',
      status: 'Active',
      joined: new Date(Date.now() - 86400000 * 90).toISOString(),
      loginHistory: Array.from({ length: 20 }).map((_, i) => ({ id: String(i), at: new Date(Date.now() - i * 3600000).toISOString(), action: 'LOGIN_SUCCESS' })),
      sessions: Array.from({ length: 3 }).map((_, i) => ({ id: String(i), ip: `10.0.0.${i + 20}`, device: `Browser ${i + 1}` })),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const auth = req.headers.get('authorization') ?? '';
    if (process.env.AUTH_SERVICE_URL) {
      const res = await fetch(`${process.env.AUTH_SERVICE_URL}/admin/users/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json({ id: params.id, ...body, updatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const auth = req.headers.get('authorization') ?? '';
    if (process.env.AUTH_SERVICE_URL) {
      const res = await fetch(`${process.env.AUTH_SERVICE_URL}/admin/users/${params.id}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });
      return NextResponse.json({ success: res.ok }, { status: res.status });
    }
    return NextResponse.json({ deleted: true, id: params.id });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
