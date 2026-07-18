import { NextRequest, NextResponse } from 'next/server';

// Generic authenticated export proxy. The browser must NOT call data-service
// (localhost:3015) directly — that is cross-origin and unauthenticated. This
// same-origin BFF route forwards the bearer token to the data-service export
// endpoint (POST /api/v1/export/:module, permission-gated) and streams the file
// back. leads/deals keep their richer dedicated CRM export routes.
const DATA_SERVICE = process.env.DATA_SERVICE_URL || 'http://localhost:3015';

export async function POST(req: NextRequest, { params }: { params: { module: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const moduleName = encodeURIComponent(params.module);
  const body = await req.text();
  const upstream = await fetch(`${DATA_SERVICE}/api/v1/export/${moduleName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: body || '{}',
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: 'Export failed', detail: detail.slice(0, 500) },
      { status: upstream.status },
    );
  }

  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ?? `attachment; filename="${params.module}-export"`,
    },
  });
}
