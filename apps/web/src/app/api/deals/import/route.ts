import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  createId,
  getDevPreviewState,
  validateDevObject,
} from '@/lib/server/dev-preview-data';

const CRM_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

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

export async function POST(req: NextRequest) {
  if (!DEV_PREVIEW_ENABLED) {
    const auth = req.headers.get('authorization');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const res = await fetch(`${CRM_URL}/api/v1/deals/import`, {
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
  const imported: Array<(typeof state.deals)[number]> = [];
  const errors = [];
  const defaultPipeline = state.pipelines[0];
  const defaultStage = defaultPipeline?.stages[0];

  for (const [index, row] of rows.entries()) {
    const stageId = String(row.stageId ?? defaultStage?.id ?? 'stage-new');
    const stage = state.pipelines.flatMap((pipeline) => pipeline.stages).find((candidate) => candidate.id === stageId);
    const accountId = String(row.accountId ?? '');
    const account = state.accounts.find((candidate) => candidate.id === accountId);

    const deal: Record<string, unknown> = {
      id: createId('deal'),
      tenantId: 'default',
      ownerId: typeof row.ownerId === 'string' && row.ownerId ? row.ownerId : 'dev-admin',
      accountId: accountId || 'acct-preview',
      accountName: typeof row.accountName === 'string' && row.accountName ? row.accountName : account?.name ?? 'Imported Account',
      pipelineId: String(row.pipelineId ?? defaultPipeline?.id ?? 'pipeline-enterprise'),
      stageId,
      stage: stage ? { id: stage.id, name: stage.name } : undefined,
      code: typeof row.code === 'string' && row.code ? row.code : `OPP-${new Date().getFullYear()}-${String(state.deals.length + imported.length + 1).padStart(6, '0')}`,
      name: typeof row.name === 'string' && row.name ? row.name : 'Imported Deal',
      amount: String(row.amount ?? '0'),
      currency: typeof row.currency === 'string' && row.currency ? row.currency : 'USD',
      probability: Number(row.probability ?? stage?.probability ?? 10) || 10,
      expectedCloseDate: row.expectedCloseDate ?? null,
      actualCloseDate: null,
      status: typeof row.status === 'string' && row.status ? row.status : 'OPEN',
      lostReason: null,
      lostDetail: null,
      forecastCategory: typeof row.forecastCategory === 'string' && row.forecastCategory ? row.forecastCategory : 'PIPELINE',
      meddicicScore: 0,
      meddicicData: {},
      aiWinProbability: null,
      aiInsights: null,
      competitors: [],
      source: 'IMPORT',
      campaignId: null,
      customFields: {
        importBatch: now,
        auditTrail: [
          {
            id: createId('audit'),
            type: 'deal.imported',
            action: 'Deal imported',
            actor: 'Preview Admin',
            at: now,
          },
        ],
        outboxEvents: [
          {
            id: createId('outbox'),
            type: 'deal.imported',
            aggregateId: null,
            status: 'PENDING',
            createdAt: now,
            payload: { source: 'import' },
          },
        ],
      },
      tags: typeof row.tags === 'string' ? row.tags.split('|').map((tag) => tag.trim()).filter(Boolean) : [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const validation = validateDevObject('deal', deal);
    if (!validation.valid) {
      errors.push({ row: index + 2, code: 'VALIDATION_FAILED', fields: validation.errors });
      continue;
    }
    imported.push(deal as (typeof state.deals)[number]);
  }

  state.deals.unshift(...imported);
  return NextResponse.json(apiSuccess({ imported: imported.length, failed: errors.length, errors }), {
    status: errors.length ? 207 : 201,
  });
}

export async function GET() {
  return NextResponse.json(apiError('Use POST to import deals', 'METHOD_NOT_ALLOWED'), { status: 405 });
}
