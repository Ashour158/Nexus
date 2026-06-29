import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/dev-preview-data';
import { getCadencePreviewState, normalizeCadence } from '@/lib/server/cadence-preview';

export async function GET() {
  const state = getCadencePreviewState();
  state.cadences = state.cadences.map((cadence) => normalizeCadence(cadence, cadence));
  return NextResponse.json(apiSuccess(state.cadences));
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!String(body.name ?? '').trim()) {
    return NextResponse.json(apiError('Cadence name is required.', 'VALIDATION_FAILED'), { status: 422 });
  }

  const cadence = normalizeCadence(body);
  getCadencePreviewState().cadences.unshift(cadence);
  return NextResponse.json(apiSuccess(cadence), { status: 201 });
}
