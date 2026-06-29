import { NextRequest, NextResponse } from 'next/server';

const FINANCE = process.env.FINANCE_SERVICE_URL || 'http://localhost:3002';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const auth = req.headers.get('authorization');
  const headers: Record<string, string> = { 'x-tenant-id': tenantId };
  if (auth) headers.authorization = auth;

  const res = await fetch(`${FINANCE}/api/v1/invoices/${params.id}/pdf`, { headers });
  if (!res.ok) {
    return NextResponse.json({ error: 'PDF generation failed' }, { status: res.status });
  }

  const pdfBuffer = await res.arrayBuffer();
  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${params.id}.pdf"`,
    },
  });
}
