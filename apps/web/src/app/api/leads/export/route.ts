import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

const CRM_URL = process.env.CRM_SERVICE_URL
  ? `${process.env.CRM_SERVICE_URL}/api/v1`
  : process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1';

const LEAD_EXPORT_FIELDS = [
  'id',
  'code',
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'jobTitle',
  'status',
  'source',
  'score',
  'ownerId',
  'createdAt',
  'updatedAt',
];

function csvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  const text = Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: NextRequest) {
  if (!DEV_PREVIEW_ENABLED) {
    const auth = req.headers.get('authorization');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const res = await fetch(`${CRM_URL}/leads/export?${req.nextUrl.searchParams.toString()}`, {
      headers: {
        Authorization: auth,
        'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      },
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="leads-export.csv"',
      },
    });
  }

  const rows = getDevPreviewState().leads;
  const csv = [
    LEAD_EXPORT_FIELDS.join(','),
    ...rows.map((row) => LEAD_EXPORT_FIELDS.map((field) => csvCell(row[field])).join(',')),
  ].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leads-export.csv"',
    },
  });
}
