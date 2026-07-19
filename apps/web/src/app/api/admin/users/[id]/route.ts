import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { serviceApiBase } from '@/lib/server/service-url';

const AUTH_URL = serviceApiBase(process.env.AUTH_SERVICE_URL, 'http://auth-service:3000');

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const auth = req.headers.get('authorization') ?? '';
    const res = await fetch(`${AUTH_URL}/users/${params.id}`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Upstream error' }));
      return NextResponse.json(error, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const auth = req.headers.get('authorization') ?? '';
    const res = await fetch(`${AUTH_URL}/users/${params.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
    const auth = req.headers.get('authorization') ?? '';
    const res = await fetch(`${AUTH_URL}/users/${params.id}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    return NextResponse.json({ success: res.ok }, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
