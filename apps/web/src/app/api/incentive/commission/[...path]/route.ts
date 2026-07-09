import { NextRequest, NextResponse } from 'next/server';

/**
 * Auth-forwarding BFF proxy for the Commission Engine (incentive-service).
 * Catches every /api/incentive/commission/** path and forwards it to the
 * service, preserving method, tenant, auth header, query string, and body.
 */
const INCENTIVE_SERVICE = process.env.INCENTIVE_SERVICE_URL || 'http://localhost:3024';

async function forward(req: NextRequest, path: string[]): Promise<NextResponse> {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const search = req.nextUrl.search;
  const url = `${INCENTIVE_SERVICE}/api/v1/commission/${path.join('/')}${search}`;

  const headers: Record<string, string> = {
    'x-tenant-id': tenantId,
    authorization: req.headers.get('authorization') ?? '',
  };

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    const raw = await req.text();
    if (raw) {
      body = raw;
      headers['content-type'] = 'application/json';
    }
  }

  const res = await fetch(url, { method: req.method, headers, body });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return NextResponse.json(data, { status: res.status });
}

type Ctx = { params: { path: string[] } };

export async function GET(req: NextRequest, { params }: Ctx) {
  return forward(req, params.path);
}
export async function POST(req: NextRequest, { params }: Ctx) {
  return forward(req, params.path);
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return forward(req, params.path);
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return forward(req, params.path);
}
