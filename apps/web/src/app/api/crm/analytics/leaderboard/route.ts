import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess } from '@/lib/server/dev-preview-data';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(
      apiSuccess([
        { rank: 1, repId: 'rep-sara', repName: 'Sara Manager', wonDeals: 18, totalRevenue: 620000 },
        { rank: 2, repId: 'rep-omar', repName: 'Omar Hassan', wonDeals: 15, totalRevenue: 540000 },
        { rank: 3, repId: 'rep-lina', repName: 'Lina Farouk', wonDeals: 12, totalRevenue: 410000 },
        { rank: 4, repId: 'rep-dev', repName: 'Dev Admin', wonDeals: 9, totalRevenue: 325000 },
      ])
    );
  }

  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  try {
    const res = await fetch(`${CRM_SERVICE}/api/v1/analytics/leaderboard${qs ? `?${qs}` : ''}`, {
      headers: { 'x-tenant-id': tenantId },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess([]));
  }
}
