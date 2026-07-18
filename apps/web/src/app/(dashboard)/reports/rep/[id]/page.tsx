import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TrendingUp, Target, Activity, Award, ChevronLeft } from 'lucide-react';

async function getRepStats(id: string) {
  try {
    const [dealsRes, activitiesRes, planRes] = await Promise.allSettled([
      fetch(`${process.env.CRM_SERVICE_URL}/api/v1/deals?ownerId=${id}&limit=50`, { cache: 'no-store' }),
      fetch(`${process.env.COMM_SERVICE_URL}/api/v1/activities?ownerId=${id}&limit=100`, { cache: 'no-store' }),
      fetch(`${process.env.PLANNING_SERVICE_URL}/api/v1/quota?userId=${id}`, { cache: 'no-store' }),
    ]);

    const dealsBody = dealsRes.status === 'fulfilled' && dealsRes.value.ok ? await dealsRes.value.json() : { data: [] };
    const activitiesBody = activitiesRes.status === 'fulfilled' && activitiesRes.value.ok ? await activitiesRes.value.json() : { data: [] };
    const plan = planRes.status === 'fulfilled' && planRes.value.ok ? await planRes.value.json() : {};

    const deals = Array.isArray(dealsBody?.data) ? dealsBody.data : [];
    const activities = Array.isArray(activitiesBody?.data) ? activitiesBody.data : [];

    const openDeals = deals.filter((d: any) => d.status === 'OPEN');
    const wonDeals = deals.filter((d: any) => d.status === 'WON');
    const pipeline = openDeals.reduce((sum: number, d: any) => sum + Number(d.amount ?? 0), 0);
    const revenue = wonDeals.reduce((sum: number, d: any) => sum + Number(d.amount ?? 0), 0);
    const quota = Number(plan?.currentQuota ?? 0);
    const attainment = quota > 0 ? Math.round((revenue / quota) * 100) : 0;

    return { deals, openDeals, wonDeals, pipeline, revenue, quota, attainment, activities, plan };
  } catch {
    return null;
  }
}

export default async function RepDetailPage({ params }: { params: { id: string } }) {
  const stats = await getRepStats(params.id);
  if (!stats) notFound();

  const { openDeals, pipeline, revenue, attainment, activities } = stats;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link href="/reports/manager" className="flex items-center gap-1 text-sm text-primary hover:text-primary">
        <ChevronLeft className="h-4 w-4" /> Back to Manager Dashboard
      </Link>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Pipeline', value: `$${(pipeline / 1000).toFixed(1)}K`, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary-container' },
          { label: 'Revenue Won', value: `$${(revenue / 1000).toFixed(1)}K`, icon: Award, color: 'text-success', bg: 'bg-success-container' },
          { label: 'Quota Attainment', value: `${attainment}%`, icon: Target, color: attainment >= 100 ? 'text-success' : attainment >= 70 ? 'text-warning' : 'text-error', bg: attainment >= 100 ? 'bg-success-container' : attainment >= 70 ? 'bg-warning-container' : 'bg-error-container' },
          { label: 'Activities', value: String(activities.length), icon: Activity, color: 'text-tertiary', bg: 'bg-tertiary-container' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-outline-variant bg-surface p-5">
            <div className="mb-3 flex items-start justify-between"><p className="text-sm text-on-surface-variant">{card.label}</p><div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.bg}`}><card.icon className={`h-4 w-4 ${card.color}`} /></div></div>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
        <div className="border-b border-outline-variant px-5 py-4"><h2 className="font-semibold text-on-surface">Open Deals ({openDeals.length})</h2></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-outline-variant text-xs uppercase text-on-surface-variant"><th className="px-5 py-3 text-start font-medium">Deal</th><th className="px-5 py-3 text-start font-medium">Stage</th><th className="px-5 py-3 text-start font-medium">Amount</th><th className="px-5 py-3 text-start font-medium">Close Date</th></tr></thead>
          <tbody>
            {openDeals.slice(0, 10).map((deal: any, i: number) => (
              <tr key={deal.id} className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'} hover:bg-primary-container/30`}>
                <td className="px-5 py-3 font-medium text-on-surface">{deal.name}</td>
                <td className="px-5 py-3 text-on-surface-variant">{deal.stage?.name ?? '-'}</td>
                <td className="px-5 py-3 font-medium">${Number(deal.amount ?? 0).toLocaleString()}</td>
                <td className="px-5 py-3 text-on-surface-variant">{deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
            {openDeals.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-on-surface-variant">No open deals</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
