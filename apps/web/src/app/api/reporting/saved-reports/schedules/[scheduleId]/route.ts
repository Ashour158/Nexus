import { NextRequest, NextResponse } from 'next/server';

const R = process.env.REPORTING_SERVICE_URL || 'http://localhost:3021';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { scheduleId: string } }
) {
  const res = await fetch(`${R}/api/v1/saved-reports/schedules/${params.scheduleId}`, {
    method: 'DELETE',
    headers: {
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      authorization: req.headers.get('authorization') ?? '',
    },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
