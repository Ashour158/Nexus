import { NextRequest, NextResponse } from 'next/server';

const R = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

function fwd(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    authorization: req.headers.get('authorization') ?? '',
    'Content-Type': 'application/json',
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; widgetId: string } }
) {
  const body = await req.text();
  const res = await fetch(`${R}/api/v1/dashboards/widgets/${params.widgetId}`, {
    method: 'PATCH',
    headers: fwd(req),
    body,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; widgetId: string } }
) {
  const res = await fetch(`${R}/api/v1/dashboards/widgets/${params.widgetId}`, {
    method: 'DELETE',
    headers: fwd(req),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
