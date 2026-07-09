import { NextRequest, NextResponse } from 'next/server';

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const weekOf = getMonday(new Date()).toISOString().split('T')[0];

    const [teamRes, rollupRes] = await Promise.allSettled([
      fetch(`${process.env.PLANNING_SERVICE_URL}/api/v1/team`, {
        headers: auth ? { Authorization: auth } : undefined,
        cache: 'no-store',
      }),
      fetch(`${process.env.PLANNING_SERVICE_URL}/api/v1/forecasts/rollup?period=${encodeURIComponent(weekOf)}`, {
        headers: auth ? { Authorization: auth } : undefined,
        cache: 'no-store',
      }),
    ]);

    const team = teamRes.status === 'fulfilled' && teamRes.value.ok ? await teamRes.value.json() : [];
    const rollup = rollupRes.status === 'fulfilled' && rollupRes.value.ok ? await rollupRes.value.json() : { data: { owners: [] } };

    const members = Array.isArray(team?.data) ? team.data : Array.isArray(team) ? team : [];
    const owners = Array.isArray(rollup?.data?.owners) ? rollup.data.owners : [];
    const subMap = new Map<string, any>(owners.map((o: any) => [o.ownerId, o]));

    return NextResponse.json(
      members.map((m: any) => {
        const sub = subMap.get(m.userId) as any;
        return {
          userId: m.userId,
          name: m.name ?? m.userId,
          quota: Number(m.quota ?? m.targetValue ?? 0),
          commit: Number(sub?.commit ?? 0),
          bestCase: Number(sub?.bestCase ?? 0),
          pipeline: Number(sub?.pipeline ?? 0),
          submitted: Boolean(sub),
          submittedAt: sub?.submittedAt ?? null,
        };
      })
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to load team forecast' }, { status: 500 });
  }
}
