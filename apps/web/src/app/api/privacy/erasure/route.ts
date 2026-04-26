import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = (await req.json()) as { query?: string };
  if (!body.query?.trim()) {
    return NextResponse.json({ success: false, error: 'query is required' }, { status: 400 });
  }
  return NextResponse.json({
    success: true,
    data: {
      query: body.query,
      records: ['deals', 'activities', 'notes', 'documents'],
      certificatePdfUrl: '/mock/erasure-certificate.pdf',
      erasedAt: new Date().toISOString(),
    },
  });
}
