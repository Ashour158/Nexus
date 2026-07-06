import { NextRequest, NextResponse } from 'next/server';

const SEARCH_SERVICE_URL = process.env.SEARCH_SERVICE_URL || 'http://localhost:3006';

// Delete a saved search (SRCH-08). Owner-scoped in the service.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const res = await fetch(`${SEARCH_SERVICE_URL}/api/v1/search/saved/${encodeURIComponent(params.id)}`, {
    method: 'DELETE',
    headers: {
      Authorization: auth,
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
