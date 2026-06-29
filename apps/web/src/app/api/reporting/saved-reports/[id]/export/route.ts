import { NextRequest, NextResponse } from 'next/server';

const R = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await fetch(`${R}/api/v1/saved-reports/${params.id}/export`, {
    headers: {
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      authorization: req.headers.get('authorization') ?? '',
    },
    cache: 'no-store',
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="report-${params.id}.csv"`,
    },
  });
}
