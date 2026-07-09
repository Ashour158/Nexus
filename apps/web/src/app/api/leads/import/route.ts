import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  createId,
  getDevPreviewState,
  validateDevObject,
} from '@/lib/server/dev-preview-data';

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1';

function parseCsv(text: string) {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  const [headers = [], ...dataRows] = rows;
  return dataRows.map((dataRow) =>
    headers.reduce<Record<string, unknown>>((record, header, index) => {
      if (header) record[header] = dataRow[index] ?? '';
      return record;
    }, {})
  );
}

async function readImportRows(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as { rows?: Record<string, unknown>[] };
    return Array.isArray(body.rows) ? body.rows : [];
  }
  return parseCsv(await req.text());
}

function leadDuplicateKey(row: Record<string, unknown>) {
  const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
  if (email) return `email:${email}`;
  return `name:${String(row.firstName ?? '').trim().toLowerCase()}:${String(row.lastName ?? '').trim().toLowerCase()}:${String(row.company ?? '').trim().toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  if (!DEV_PREVIEW_ENABLED) {
    const auth = req.headers.get('authorization');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const res = await fetch(`${CRM_URL}/leads/import`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': req.headers.get('content-type') ?? 'text/csv',
        'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      },
      body: await req.text(),
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  }

  const state = getDevPreviewState();
  const now = new Date().toISOString();
  const rows = await readImportRows(req);
  const existingKeys = new Set(state.leads.map((lead) => leadDuplicateKey(lead)));
  const imported: Array<(typeof state.leads)[number]> = [];
  const errors = [];

  for (const [index, row] of rows.entries()) {
    const lead: Record<string, unknown> = {
      id: createId('lead'),
      tenantId: 'default',
      ownerId: typeof row.ownerId === 'string' && row.ownerId ? row.ownerId : 'dev-admin',
      code: typeof row.code === 'string' && row.code ? row.code : `LEAD-${new Date().getFullYear()}-${String(state.leads.length + imported.length + 1).padStart(6, '0')}`,
      firstName: typeof row.firstName === 'string' && row.firstName ? row.firstName : 'Imported',
      lastName: typeof row.lastName === 'string' && row.lastName ? row.lastName : 'Lead',
      email: typeof row.email === 'string' && row.email ? row.email : null,
      phone: typeof row.phone === 'string' && row.phone ? row.phone : null,
      company: typeof row.company === 'string' && row.company ? row.company : null,
      jobTitle: typeof row.jobTitle === 'string' && row.jobTitle ? row.jobTitle : null,
      status: typeof row.status === 'string' && row.status ? row.status : 'NEW',
      source: typeof row.source === 'string' && row.source ? row.source : 'IMPORT',
      score: Number(row.score ?? 50) || 50,
      aiScore: null,
      convertedAt: null,
      convertedToContactId: null,
      convertedToAccountId: null,
      convertedToDealId: null,
      disqualifiedReason: null,
      customFields: {
        importBatch: now,
        auditTrail: [
          {
            id: createId('audit'),
            type: 'lead.imported',
            action: 'Lead imported',
            actor: 'Preview Admin',
            at: now,
          },
        ],
        outboxEvents: [
          {
            id: createId('outbox'),
            type: 'lead.imported',
            aggregateId: null,
            status: 'PENDING',
            createdAt: now,
            payload: { source: 'import' },
          },
        ],
      },
      tags: typeof row.tags === 'string' ? row.tags.split('|').map((tag) => tag.trim()).filter(Boolean) : [],
      createdAt: now,
      updatedAt: now,
    };

    const duplicateKey = leadDuplicateKey(lead);
    const validation = validateDevObject('lead', lead);
    if (existingKeys.has(duplicateKey)) {
      errors.push({ row: index + 2, code: 'DUPLICATE_LEAD', message: 'Lead already exists' });
      continue;
    }
    if (!validation.valid) {
      errors.push({ row: index + 2, code: 'VALIDATION_FAILED', fields: validation.errors });
      continue;
    }
    existingKeys.add(duplicateKey);
    imported.push(lead as (typeof state.leads)[number]);
  }

  state.leads.unshift(...imported);
  return NextResponse.json(apiSuccess({ imported: imported.length, failed: errors.length, errors }), {
    status: errors.length ? 207 : 201,
  });
}

export async function GET() {
  return NextResponse.json(apiError('Use POST to import leads', 'METHOD_NOT_ALLOWED'), { status: 405 });
}
