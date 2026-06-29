import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/dev-preview-data';
import { getCadencePreviewState, normalizeCadence } from '@/lib/server/cadence-preview';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const cadence = getCadencePreviewState().cadences.find((item) => item.id === params.id);
  if (!cadence) return NextResponse.json(apiError('Cadence not found.', 'NOT_FOUND'), { status: 404 });
  return NextResponse.json(apiSuccess(cadence));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const state = getCadencePreviewState();
  const index = state.cadences.findIndex((item) => item.id === params.id);
  if (index === -1) return NextResponse.json(apiError('Cadence not found.', 'NOT_FOUND'), { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if ('name' in body && !String(body.name ?? '').trim()) {
    return NextResponse.json(apiError('Cadence name is required.', 'VALIDATION_FAILED'), { status: 422 });
  }

  state.cadences[index] = normalizeCadence(body, state.cadences[index]);
  return NextResponse.json(apiSuccess(state.cadences[index]));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const state = getCadencePreviewState();
  const index = state.cadences.findIndex((item) => item.id === params.id);
  if (index === -1) return NextResponse.json(apiError('Cadence not found.', 'NOT_FOUND'), { status: 404 });
  state.cadences.splice(index, 1);
  return NextResponse.json(apiSuccess(null));
}
