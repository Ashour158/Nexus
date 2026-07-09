import { NextRequest, NextResponse } from 'next/server';

const KNOWLEDGE_SERVICE = process.env.KNOWLEDGE_SERVICE_URL || 'http://localhost:3023';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const { searchParams } = new URL(req.url);
  const res = await fetch(`${KNOWLEDGE_SERVICE}/api/v1/knowledge/articles?${searchParams.toString()}`, {
    headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
