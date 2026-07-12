import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED } from '@/lib/server/dev-preview-data';
import {
  createField,
  createLayout,
  createModule,
  createRecord,
  deleteField,
  deleteLayout,
  deleteModule,
  deleteRecord,
  getLayout,
  getModule,
  getRecord,
  listFields,
  listLayouts,
  listModules,
  listRecords,
  reorderFields,
  updateField,
  updateLayout,
  updateModule,
  updateRecord,
} from '@/lib/server/metadata-mock-store';

const METADATA_SERVICE =
  process.env.METADATA_SERVICE_URL || 'http://localhost:3004';

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function notFound(message = 'Not found') {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message } },
    { status: 404 }
  );
}
function unprocessable(issues: unknown) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', issues } },
    { status: 422 }
  );
}

async function body(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isIssueList(value: unknown): value is { field: string; message: string }[] {
  return Array.isArray(value);
}

/** Dev-preview router over the in-memory metadata store. Returns null if unmatched. */
async function handleMock(
  method: string,
  segments: string[],
  req: NextRequest
): Promise<NextResponse | null> {
  // Base: /custom-modules
  if (segments.length === 0) {
    if (method === 'GET') return ok(listModules());
    if (method === 'POST') return ok(createModule(await body(req)), 201);
    return null;
  }

  const moduleId = segments[0];
  const rest = segments.slice(1);

  // /custom-modules/:id
  if (rest.length === 0) {
    if (method === 'GET') {
      const mod = getModule(moduleId);
      return mod ? ok(mod) : notFound('Module not found');
    }
    if (method === 'PATCH') {
      const mod = updateModule(moduleId, await body(req));
      return mod ? ok(mod) : notFound('Module not found');
    }
    if (method === 'DELETE') {
      return deleteModule(moduleId) ? ok({ deleted: true }) : notFound('Module not found');
    }
    return null;
  }

  const sub = rest[0];

  // ---- Fields ----
  if (sub === 'fields') {
    // /custom-modules/:id/fields
    if (rest.length === 1) {
      if (method === 'GET') return ok(listFields(moduleId));
      if (method === 'POST') {
        const field = createField(moduleId, await body(req));
        return field ? ok(field, 201) : notFound('Module not found');
      }
    }
    // /custom-modules/:id/fields/reorder
    // Real backend expects `{ order: [{ id, sortOrder }] }`. Normalize to an
    // ordered id array (sorted by sortOrder) for the in-memory store, while
    // tolerating legacy shapes.
    if (rest.length === 2 && rest[1] === 'reorder' && method === 'PATCH') {
      const payload = await body(req);
      const raw = (payload.order ?? payload.fieldIds ?? payload.ids) as unknown;
      let orderedIds: string[] = [];
      if (Array.isArray(raw)) {
        if (raw.every((e) => typeof e === 'string')) {
          orderedIds = raw as string[];
        } else {
          orderedIds = (raw as { id: string; sortOrder?: number }[])
            .slice()
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((e) => e.id);
        }
      }
      const result = reorderFields(moduleId, orderedIds);
      return result ? ok(result) : notFound('Module not found');
    }
    // /custom-modules/:id/fields/:fieldId
    if (rest.length === 2) {
      const fieldId = rest[1];
      if (method === 'PATCH') {
        const field = updateField(moduleId, fieldId, await body(req));
        return field ? ok(field) : notFound('Field not found');
      }
      if (method === 'DELETE') {
        return deleteField(moduleId, fieldId) ? ok({ deleted: true }) : notFound('Field not found');
      }
    }
    return null;
  }

  // ---- Layouts ----
  if (sub === 'layouts') {
    if (rest.length === 1) {
      if (method === 'GET') return ok(listLayouts(moduleId));
      if (method === 'POST') {
        const layout = createLayout(moduleId, await body(req));
        return layout ? ok(layout, 201) : notFound('Module not found');
      }
    }
    if (rest.length === 2) {
      const layoutId = rest[1];
      if (method === 'GET') {
        const layout = getLayout(moduleId, layoutId);
        return layout ? ok(layout) : notFound('Layout not found');
      }
      if (method === 'PATCH') {
        const layout = updateLayout(moduleId, layoutId, await body(req));
        return layout ? ok(layout) : notFound('Layout not found');
      }
      if (method === 'DELETE') {
        return deleteLayout(moduleId, layoutId) ? ok({ deleted: true }) : notFound('Layout not found');
      }
    }
    return null;
  }

  // ---- Records ----
  if (sub === 'records') {
    if (rest.length === 1) {
      if (method === 'GET') {
        const params = req.nextUrl.searchParams;
        const result = listRecords(moduleId, {
          page: Number(params.get('page') ?? 1),
          pageSize: Number(params.get('pageSize') ?? 25),
          filter: params.get('filter') ?? undefined,
        });
        return ok(result);
      }
      if (method === 'POST') {
        const values = (await body(req)) as Record<string, unknown>;
        const result = createRecord(moduleId, (values.values as Record<string, unknown>) ?? values);
        if (result === undefined) return notFound('Module not found');
        if (isIssueList(result)) return unprocessable(result);
        return ok(result, 201);
      }
    }
    if (rest.length === 2) {
      const recordId = rest[1];
      if (method === 'GET') {
        const record = getRecord(moduleId, recordId);
        return record ? ok(record) : notFound('Record not found');
      }
      if (method === 'PATCH') {
        const values = (await body(req)) as Record<string, unknown>;
        const result = updateRecord(moduleId, recordId, (values.values as Record<string, unknown>) ?? values);
        if (result === undefined) return notFound('Record not found');
        if (isIssueList(result)) return unprocessable(result);
        return ok(result);
      }
      if (method === 'DELETE') {
        return deleteRecord(moduleId, recordId) ? ok({ deleted: true }) : notFound('Record not found');
      }
    }
    return null;
  }

  return null;
}

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const path = segments.join('/');
  const qs = req.nextUrl.searchParams.toString();
  const url = `${METADATA_SERVICE}/api/v1/custom-modules${path ? `/${path}` : ''}${qs ? `?${qs}` : ''}`;
  const method = req.method;
  const init: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      authorization: req.headers.get('authorization') ?? '',
    },
    cache: 'no-store',
  };
  if (method !== 'GET' && method !== 'DELETE') {
    init.body = await req.text();
  }
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return new NextResponse(text, { status: res.status });
    }
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: err instanceof Error ? err.message : 'Failed to connect to metadata service',
        },
      },
      { status: 503 }
    );
  }
}

async function route(req: NextRequest, ctx: { params: { path?: string[] } }) {
  const segments = ctx.params.path ?? [];
  if (DEV_PREVIEW_ENABLED) {
    const mocked = await handleMock(req.method, segments, req);
    if (mocked) return mocked;
    return notFound(`Unhandled custom-modules route: ${req.method} /${segments.join('/')}`);
  }
  return proxy(req, segments);
}

export const GET = route;
export const POST = route;
export const PATCH = route;
export const PUT = route;
export const DELETE = route;
