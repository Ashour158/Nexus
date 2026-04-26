import { NextRequest, NextResponse } from 'next/server';

function authOr401(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  return auth && auth.startsWith('Bearer ') ? auth : null;
}

export async function GET(req: NextRequest) {
  const auth = authOr401(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q') ?? '';
  const res = await fetch(`${process.env.BILLING_SERVICE_URL}/products?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: auth },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const auth = authOr401(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const payload = {
    ...body,
    listPrice: body.price ?? body.listPrice ?? 0,
    type: body.type ?? 'SERVICE',
    billingType: body.billingType ?? 'ONE_TIME',
    taxable: body.taxable ?? true,
    pricingRules: body.pricingRules ?? [],
    priceTiers: body.priceTiers ?? [],
    customFields: body.customFields ?? {},
  };

  const res = await fetch(`${process.env.BILLING_SERVICE_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
