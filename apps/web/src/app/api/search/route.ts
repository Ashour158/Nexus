import { NextRequest, NextResponse } from 'next/server';

function normalizeType(value: string): 'contact' | 'deal' | 'company' | 'document' | 'activity' | 'unknown' {
  const v = value.toLowerCase();
  if (v.includes('contact')) return 'contact';
  if (v.includes('deal')) return 'deal';
  if (v.includes('account') || v.includes('company')) return 'company';
  if (v.includes('document') || v.includes('file') || v.includes('knowledge')) return 'document';
  if (v.includes('activity') || v.includes('task') || v.includes('note')) return 'activity';
  return 'unknown';
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q') ?? '';
  const limit = req.nextUrl.searchParams.get('limit') ?? '8';

  const res = await fetch(`${process.env.SEARCH_SERVICE_URL}/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
    headers: { Authorization: auth },
  });

  const results = (await res.json().catch(() => ({}))) as { hits?: any[]; estimatedTotalHits?: number };
  const withTypes = (results.hits ?? []).map((hit: any) => ({
    ...hit,
    type: hit.type ?? normalizeType(hit._index ?? ''),
  }));

  return NextResponse.json({ hits: withTypes, total: results.estimatedTotalHits ?? withTypes.length }, { status: res.status });
}
