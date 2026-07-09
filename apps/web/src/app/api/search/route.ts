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

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q') ?? '';
  const limit = req.nextUrl.searchParams.get('limit') ?? '8';

  const res = await fetch(`${process.env.SEARCH_SERVICE_URL}/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
    headers: { Authorization: auth },
  });

  const body = (await res.json().catch(() => ({}))) as BackendSearchResponse;
  const data = body.data ?? {};

  // Flatten the keyed entity arrays into a single tagged `hits` array the
  // command palette / global search consumers expect.
  const hits: FlatHit[] = [
    ...(data.deals ?? []).map(toDealHit),
    ...(data.contacts ?? []).map(toContactHit),
    ...(data.accounts ?? []).map(toAccountHit),
    ...(data.leads ?? []).map(toLeadHit),
  ];

  return NextResponse.json({ hits, total: data.total ?? hits.length }, { status: res.status });
}
