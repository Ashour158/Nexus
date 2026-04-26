import { NextRequest, NextResponse } from 'next/server';

const store = new Map<string, { enabled: boolean; token: string; permissions: Record<string, boolean> }>();

function getValue(id: string) {
  const existing = store.get(id);
  if (existing) return existing;
  const initial = {
    enabled: true,
    token: `${id}-token`,
    permissions: {
      showDeals: true,
      showInvoices: true,
      showDocuments: true,
      allowUpload: false,
      allowMessaging: true,
    },
  };
  store.set(id, initial);
  return initial;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json(getValue(params.id));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json()) as { enabled?: boolean };
  const current = getValue(params.id);
  const next = { ...current, enabled: body.enabled ?? current.enabled };
  store.set(params.id, next);
  return NextResponse.json(next);
}
