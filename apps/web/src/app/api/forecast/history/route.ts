import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const period = req.nextUrl.searchParams.get('period');
    const qs = period ? `?period=${encodeURIComponent(period)}` : '';

    const res = await fetch(`${process.env.PLANNING_SERVICE_URL}/api/v1/forecasts${qs}`, {
      headers: auth ? { Authorization: auth } : undefined,
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || 'Failed to load forecast history' }, { status: res.status });
    }

    const body = await res.json();
    const submissions = Array.isArray(body?.data) ? body.data : [];
    return NextResponse.json(
      submissions.map((s: any) => ({
        id: s.id,
        weekOf: s.period,
        commit: Number(s.commitAmount ?? 0),
        bestCase: Number(s.bestCaseAmount ?? 0),
        pipeline: Number(s.pipelineAmount ?? 0),
        notes: s.commentary ?? null,
        submittedAt: s.submittedAt,
      }))
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to load forecast history' }, { status: 500 });
  }
}
