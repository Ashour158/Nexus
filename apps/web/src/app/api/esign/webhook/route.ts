import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.DOCUSIGN_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = createHmac('sha256', secret).update(raw).digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get('x-docusign-signature-1');
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(raw) as { event?: string; data?: { envelopeId?: string; status?: string } };
  return NextResponse.json({ ok: true, event: payload.event ?? payload.data?.status ?? 'unknown' });
}
