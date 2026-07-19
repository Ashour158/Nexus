import { serviceApiBase } from '@/lib/server/service-url';
﻿import { NextRequest, NextResponse } from 'next/server';

const CRM_URL = serviceApiBase(process.env.CRM_SERVICE_URL, 'http://crm-service:3001');

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = params.path.join('/');
  const searchParams = req.nextUrl.searchParams.toString();
  const url = `${CRM_URL}/dedup/${path}${searchParams ? `?${searchParams}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: auth } });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = params.path.join('/');
  const body = await req.text();
  const res = await fetch(`${CRM_URL}/dedup/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
