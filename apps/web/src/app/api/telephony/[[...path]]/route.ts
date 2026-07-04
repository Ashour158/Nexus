import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED } from '@/lib/server/dev-preview-data';
import { clickToCall, listCalls } from '@/lib/server/telephony-mock-store';

const COMM_SERVICE =
  process.env.COMM_SERVICE_URL || 'http://localhost:3009';

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function notFound(message = 'Not found') {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message } },
    { status: 404 }
  );
}

async function body(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Dev-preview router over the in-memory telephony store. Returns null if unmatched. */
async function handleMock(
  method: string,
  segments: string[],
  req: NextRequest
): Promise<NextResponse | null> {
  const [action] = segments;

  // POST /telephony/click-to-call
  if (action === 'click-to-call' && method === 'POST') {
    const payload = (await body(req)) as {
      toNumber?: string;
      contactId?: string;
      dealId?: string;
      accountId?: string;
    };
    return ok(clickToCall(payload), 201);
  }

  // GET /telephony/calls?contactId|dealId|accountId
  if (action === 'calls' && method === 'GET') {
    const params = req.nextUrl.searchParams;
    return ok(
      listCalls({
        contactId: params.get('contactId') ?? undefined,
        dealId: params.get('dealId') ?? undefined,
        accountId: params.get('accountId') ?? undefined,
      })
    );
  }

  return null;
}

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const path = segments.join('/');
  const qs = req.nextUrl.searchParams.toString();
  const url = `${COMM_SERVICE}/api/v1/telephony/${path}${qs ? `?${qs}` : ''}`;
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
          message: err instanceof Error ? err.message : 'Failed to connect to comm service',
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
    return notFound(`Unhandled telephony route: ${req.method} /${segments.join('/')}`);
  }
  return proxy(req, segments);
}

export const GET = route;
export const POST = route;
export const PATCH = route;
export const PUT = route;
export const DELETE = route;
