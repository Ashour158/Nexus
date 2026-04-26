import { NextResponse } from 'next/server';

const CRM_BASE = process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1';

type MergeRequest = {
  masterId: string;
  mergeIds: string[];
  keepFields?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const body = (await req.json()) as MergeRequest;

  if (!body.masterId || !Array.isArray(body.mergeIds) || body.mergeIds.length === 0) {
    return NextResponse.json({ success: false, error: 'masterId and mergeIds are required' }, { status: 400 });
  }

  // Soft merge strategy for now: remove duplicate records, keep selected master.
  const results = await Promise.all(
    body.mergeIds.map(async (id) => {
      const res = await fetch(`${CRM_BASE}/contacts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });
      return { id, ok: res.ok };
    })
  );

  return NextResponse.json({ success: true, data: { masterId: body.masterId, merged: results } });
}
