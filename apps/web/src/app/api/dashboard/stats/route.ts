import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, getDevPreviewState } from '@/lib/server/dev-preview-data';

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const tenantId = req.headers.get('x-tenant-id') ?? '';

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const openDeals = state.deals.filter((deal) => deal.status === 'OPEN');
    const wonDeals = state.deals.filter((deal) => deal.status === 'WON');
    const pipeline = openDeals.reduce((sum, deal) => sum + toNum(deal.amount), 0);
    const revenueThisMonth = wonDeals.reduce((sum, deal) => sum + toNum(deal.amount), 0);
    const byStageMap = new Map<string, { name: string; value: number }>();

    for (const deal of openDeals) {
      const stageName =
        typeof deal.stage === 'object' && deal.stage !== null && 'name' in deal.stage
          ? String((deal.stage as { name: unknown }).name)
          : 'Unknown';
      byStageMap.set(stageName, {
        name: stageName,
        value: (byStageMap.get(stageName)?.value ?? 0) + toNum(deal.amount),
      });
    }

    return NextResponse.json({
      tenantId: tenantId || 'default',
      pipeline,
      dealsOpen: openDeals.length,
      dealsWonThisMonth: wonDeals.length,
      revenueThisMonth,
      contacts: state.contacts.length,
      newContactsThisWeek: state.contacts.filter(
        (contact) => Date.now() - new Date(String(contact.createdAt)).getTime() < 7 * 86400000
      ).length,
      activitiesToday: state.activities.filter(
        (activity) =>
          activity.createdAt && new Date(String(activity.createdAt)).toDateString() === new Date().toDateString()
      ).length,
      overdueActivities: state.activities.filter(
        (activity) =>
          activity.dueDate &&
          new Date(String(activity.dueDate)).getTime() < Date.now() &&
          activity.status !== 'COMPLETED'
      ).length,
      winRate: state.deals.length ? Math.round((wonDeals.length / state.deals.length) * 100) : 0,
      avgDealSize: wonDeals.length ? Math.round(revenueThisMonth / wonDeals.length) : 0,
      pipelineByStage: Array.from(byStageMap.values()),
      revenueByMonth: [
        { month: 'Jan', revenue: 82000 },
        { month: 'Feb', revenue: 138000 },
        { month: 'Mar', revenue: 221000 },
        { month: 'Apr', revenue: 298000 },
        { month: 'May', revenue: revenueThisMonth },
      ],
    });
  }

  try {
    const [dealsRes, contactsRes, activitiesRes] = await Promise.allSettled([
      fetch(`${process.env.CRM_SERVICE_URL}/api/v1/deals?limit=200`, {
        headers: auth ? { Authorization: auth } : undefined,
        cache: 'no-store',
      }),
      fetch(`${process.env.CRM_SERVICE_URL}/api/v1/contacts?limit=200`, {
        headers: auth ? { Authorization: auth } : undefined,
        cache: 'no-store',
      }),
      fetch(`${process.env.CRM_SERVICE_URL}/api/v1/activities?limit=200`, {
        headers: auth ? { Authorization: auth } : undefined,
        cache: 'no-store',
      }),
    ]);

    const dealsBody = dealsRes.status === 'fulfilled' && dealsRes.value.ok ? await dealsRes.value.json() : { data: [] };
    const contactsBody = contactsRes.status === 'fulfilled' && contactsRes.value.ok ? await contactsRes.value.json() : { data: [] };
    const activitiesBody = activitiesRes.status === 'fulfilled' && activitiesRes.value.ok ? await activitiesRes.value.json() : { data: [] };

    const deals = Array.isArray(dealsBody?.data) ? dealsBody.data : [];
    const contacts = Array.isArray(contactsBody?.data) ? contactsBody.data : [];
    const activities = Array.isArray(activitiesBody?.data) ? activitiesBody.data : [];

    const openDeals = deals.filter((d: any) => d.status === 'OPEN');
    const wonDeals = deals.filter((d: any) => d.status === 'WON');
    const pipeline = openDeals.reduce((sum: number, d: any) => sum + toNum(d.amount), 0);
    const revenueThisMonth = wonDeals.reduce((sum: number, d: any) => sum + toNum(d.amount), 0);
    const winRate = deals.length ? Math.round((wonDeals.length / deals.length) * 100) : 0;
    const avgDealSize = wonDeals.length ? Math.round(revenueThisMonth / wonDeals.length) : 0;

    const byStageMap = new Map<string, { name: string; value: number }>();
    for (const d of openDeals) {
      const stageName = d?.stage?.name ?? 'Unknown';
      byStageMap.set(stageName, { name: stageName, value: (byStageMap.get(stageName)?.value ?? 0) + toNum(d.amount) });
    }

    const byMonthMap = new Map<string, number>();
    for (const d of wonDeals) {
      const dt = d?.actualCloseDate ?? d?.updatedAt ?? d?.createdAt;
      const key = dt ? new Date(dt).toLocaleDateString(undefined, { month: 'short' }) : 'Unknown';
      byMonthMap.set(key, (byMonthMap.get(key) ?? 0) + toNum(d.amount));
    }

    const today = new Date().toDateString();
    const activitiesToday = activities.filter((a: any) => a?.createdAt && new Date(a.createdAt).toDateString() === today).length;
    const overdueActivities = activities.filter((a: any) => a?.dueDate && new Date(a.dueDate).getTime() < Date.now() && a?.status !== 'COMPLETED').length;

    return NextResponse.json({
      tenantId,
      pipeline,
      dealsOpen: openDeals.length,
      dealsWonThisMonth: wonDeals.length,
      revenueThisMonth,
      contacts: contacts.length,
      newContactsThisWeek: contacts.filter((c: any) => c?.createdAt && Date.now() - new Date(c.createdAt).getTime() < 7 * 86400000).length,
      activitiesToday,
      overdueActivities,
      winRate,
      avgDealSize,
      pipelineByStage: Array.from(byStageMap.values()),
      revenueByMonth: Array.from(byMonthMap.entries()).map(([month, revenue]) => ({ month, revenue })),
    });
  } catch (err) {
    console.error('[dashboard/stats]', err);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
