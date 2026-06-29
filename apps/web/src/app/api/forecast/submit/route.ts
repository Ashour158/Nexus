import { NextRequest, NextResponse } from 'next/server';

function getUser(req: NextRequest) {
  return {
    id: req.headers.get('x-user-id') ?? 'demo-user',
    tenantId: req.headers.get('x-tenant-id') ?? 'demo-tenant',
    auth: req.headers.get('authorization') ?? '',
  };
}

export async function POST(req: NextRequest) {
  try {
    const { weekOf, dealCategories, notes } = await req.json();
    if (!weekOf) return NextResponse.json({ error: 'weekOf is required' }, { status: 400 });

    const user = getUser(req);
    const dealIds = Object.keys(dealCategories ?? {});

    let commit = 0;
    let bestCase = 0;
    let pipeline = 0;

    if (dealIds.length > 0) {
      const dealsRes = await fetch(`${process.env.CRM_SERVICE_URL}/api/v1/deals?limit=500`, {
        headers: user.auth ? { Authorization: user.auth } : undefined,
      });
      if (dealsRes.ok) {
        const body = await dealsRes.json();
        const deals = Array.isArray(body?.data) ? body.data.filter((d: any) => dealIds.includes(d.id)) : [];
        for (const deal of deals) {
          const amount = Number(deal.amount ?? 0);
          const cat = dealCategories[deal.id];
          if (cat === 'commit') {
            commit += amount;
            bestCase += amount;
            pipeline += amount;
          } else if (cat === 'best_case') {
            bestCase += amount;
            pipeline += amount;
          } else if (cat === 'pipeline') {
            pipeline += amount;
          }
        }
      }
    }

    const payload = {
      period: weekOf,
      commitAmount: commit,
      bestCaseAmount: bestCase,
      pipelineAmount: pipeline,
      commentary: notes ?? null,
    };

    const planningRes = await fetch(`${process.env.PLANNING_SERVICE_URL}/api/v1/forecasts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user.auth ? { Authorization: user.auth } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!planningRes.ok) {
      const text = await planningRes.text();
      return NextResponse.json({ error: text || 'Failed to submit forecast' }, { status: planningRes.status });
    }

    const data = await planningRes.json();
    return NextResponse.json({
      id: data?.data?.id ?? `forecast-${Date.now()}`,
      weekOf,
      commit,
      bestCase,
      pipeline,
      notes: notes ?? null,
      submittedAt: new Date().toISOString(),
      userId: user.id,
      tenantId: user.tenantId,
    });
  } catch (err: any) {
    console.error('[forecast/submit]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to submit forecast' }, { status: 500 });
  }
}
