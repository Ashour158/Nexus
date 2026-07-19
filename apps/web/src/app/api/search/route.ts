import { NextRequest, NextResponse } from 'next/server';

// Canonical entity types emitted by the backend `/api/v1/search` default
// response (`data.{deals,contacts,accounts,leads}`).
type EntityType = 'deal' | 'contact' | 'account' | 'lead';

interface FlatHit {
  id: string;
  type: EntityType;
  title: string;
  subtitle: string;
  href: string;
  _index: string;
}

// The backend returns the four primary entities as keyed arrays of Meili
// documents (raw records with searchable fields), NOT a flat `hits` array.
// Shape: { success, data: { deals[], contacts[], accounts[], leads[], total } }.
interface BackendSearchResponse {
  success?: boolean;
  data?: {
    deals?: Record<string, any>[];
    contacts?: Record<string, any>[];
    accounts?: Record<string, any>[];
    leads?: Record<string, any>[];
    total?: number;
  };
}

function docId(doc: Record<string, any>, legacyKey: string): string {
  return String(doc.id ?? doc[legacyKey] ?? '');
}

function fullName(doc: Record<string, any>): string {
  return [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim();
}

function toDealHit(d: Record<string, any>): FlatHit {
  const id = docId(d, 'dealId');
  return {
    id,
    type: 'deal',
    title: d.name ?? `Deal ${id}`,
    subtitle: typeof d.amount === 'number' ? `$${d.amount.toLocaleString()}` : (d.stageId ?? ''),
    href: `/deals/${id}`,
    _index: 'deals',
  };
}

function toContactHit(c: Record<string, any>): FlatHit {
  const id = docId(c, 'contactId');
  return {
    id,
    type: 'contact',
    title: fullName(c) || c.email || `Contact ${id}`,
    subtitle: c.email ?? '',
    href: `/contacts/${id}`,
    _index: 'contacts',
  };
}

function toAccountHit(a: Record<string, any>): FlatHit {
  const id = docId(a, 'accountId');
  return {
    id,
    type: 'account',
    title: a.name ?? `Account ${id}`,
    subtitle: a.industry ?? a.website ?? '',
    href: `/accounts/${id}`,
    _index: 'accounts',
  };
}

function toLeadHit(l: Record<string, any>): FlatHit {
  const id = docId(l, 'leadId');
  return {
    id,
    type: 'lead',
    title: fullName(l) || l.company || l.email || `Lead ${id}`,
    subtitle: l.company ?? l.email ?? '',
    href: `/leads/${id}`,
    _index: 'leads',
  };
}

// SERVER-SIDE ONLY. This handler runs in the Node runtime, so the upstream must
// come from the server-only `SEARCH_SERVICE_URL` (an absolute internal URL such
// as `http://search-service:3006`). Never read `NEXT_PUBLIC_*_URL` here: those
// hold browser-relative paths (e.g. `/bff/search`) in production and a
// server-side `fetch()` against a host-less path THROWS. Same convention as the
// sibling routes `search/recent` and `search/saved`.
const SEARCH_SERVICE_URL = process.env.SEARCH_SERVICE_URL || 'http://localhost:3006';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const limit = req.nextUrl.searchParams.get('limit') ?? '8';

  // search-service rejects an empty `q` (zod `.min(1)`). An empty query is not
  // an error for the caller — it simply has no hits.
  if (!q) return NextResponse.json({ hits: [], total: 0 }, { status: 200 });

  const url = new URL(`${SEARCH_SERVICE_URL}/api/v1/search`);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', limit);
  const type = req.nextUrl.searchParams.get('type');
  if (type) url.searchParams.set('type', type);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: auth,
        'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      },
      cache: 'no-store',
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: 'SERVICE_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'Failed to connect to search service',
      },
      { status: 503 }
    );
  }

  // Propagate genuine auth failures; never let them masquerade as "no results".
  if (res.status === 401 || res.status === 403) {
    return NextResponse.json({ error: 'Forbidden', hits: [], total: 0 }, { status: res.status });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return NextResponse.json(
      { error: 'UPSTREAM_ERROR', message: text || `Search service returned ${res.status}` },
      { status: res.status }
    );
  }

  const body = (await res.json().catch(() => ({}))) as BackendSearchResponse;
  const data = body.data ?? {};

  // Flatten the keyed entity arrays into a single tagged `hits` array the
  // command palette / global search consumers expect. A query with no matches
  // yields an empty array with HTTP 200 — never a 404.
  const hits: FlatHit[] = [
    ...(data.deals ?? []).map(toDealHit),
    ...(data.contacts ?? []).map(toContactHit),
    ...(data.accounts ?? []).map(toAccountHit),
    ...(data.leads ?? []).map(toLeadHit),
  ];

  return NextResponse.json({ hits, total: data.total ?? hits.length }, { status: 200 });
}
