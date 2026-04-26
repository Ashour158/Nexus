import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json({
      totalUsers: 142,
      activeTenants: 18,
      totalDeals: 3847,
      apiCallsToday: 28493,
      kafkaQueueDepth: 12,
      wsConnections: 34,
      recentSignups: Array.from({ length: 10 }).map((_, i) => ({
        id: String(i + 1),
        name: `User ${i + 1}`,
        email: `user${i + 1}@nexuscrm.app`,
        tenant: `Tenant ${(i % 5) + 1}`,
        joined: new Date(Date.now() - i * 86400000).toISOString(),
      })),
      alerts: [
        { id: '1', timestamp: new Date().toISOString(), service: 'kafka', message: 'Lag exceeded threshold on topic deals.events', severity: 'medium' },
        { id: '2', timestamp: new Date(Date.now() - 120000).toISOString(), service: 'search', message: 'Meilisearch response p95 over 900ms', severity: 'low' },
      ],
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
