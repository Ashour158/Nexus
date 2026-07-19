import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { serviceApiBase } from '@/lib/server/service-url';

const AUTH_URL = serviceApiBase(process.env.AUTH_SERVICE_URL, 'http://auth-service:3000');
const CRM_URL = process.env.CRM_SERVICE_URL
  ? `${process.env.CRM_SERVICE_URL}/api/v1`
  : process.env.NEXT_PUBLIC_CRM_URL ?? 'http://crm-service:3001/api/v1';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const auth = req.headers.get('authorization') ?? '';

    // Fetch real data from backend services
    const [usersRes, dealsRes] = await Promise.allSettled([
      fetch(`${AUTH_URL}/users?page=1&limit=1`, { headers: { Authorization: auth } }),
      fetch(`${CRM_URL}/deals?page=1&limit=1`, { headers: { Authorization: auth } }),
    ]);

    let totalUsers = 0;
    if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
      const usersData = await usersRes.value.json().catch(() => ({}));
      totalUsers = usersData.total ?? usersData.data?.length ?? 0;
    }

    let totalDeals = 0;
    if (dealsRes.status === 'fulfilled' && dealsRes.value.ok) {
      const dealsData = await dealsRes.value.json().catch(() => ({}));
      totalDeals = dealsData.total ?? dealsData.data?.length ?? 0;
    }

    return NextResponse.json({
      totalUsers,
      totalDeals,
      activeTenants: null,
      apiCallsToday: null,
      kafkaQueueDepth: null,
      wsConnections: null,
      recentSignups: [],
      alerts: [],
      _meta: {
        message:
          'Some metrics are not yet available. Analytics service integration is pending for: activeTenants, apiCallsToday, kafkaQueueDepth, wsConnections, recentSignups, alerts.',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
