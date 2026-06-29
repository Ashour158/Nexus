import { NextRequest, NextResponse } from 'next/server';

const DATA_SERVICE = process.env.DATA_SERVICE_URL || 'http://localhost:3015';

export async function GET(req: NextRequest, { params }: { params: { jobId: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const res = await fetch(`${DATA_SERVICE}/api/v1/import/jobs/${params.jobId}`, {
    headers: { 'x-tenant-id': tenantId },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
