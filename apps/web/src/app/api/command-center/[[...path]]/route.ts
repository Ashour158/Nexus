import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED } from '@/lib/server/dev-preview-data';
import {
  createJourney,
  deleteJourney,
  enroll,
  exitEnrollment,
  getJourney,
  listEnrollments,
  listJourneys,
  setJourneyStatus,
  updateJourney,
} from '@/lib/server/command-center-mock-store';

const WORKFLOW_SERVICE =
  process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3007';

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

/** Dev-preview router over the in-memory CommandCenter store. Returns null if unmatched. */
async function handleMock(
  method: string,
  segments: string[],
  req: NextRequest
): Promise<NextResponse | null> {
  const [resource, ...rest] = segments;
  if (resource !== 'journeys') return null;

  // /command-center/journeys
  if (rest.length === 0) {
    if (method === 'GET') return ok(listJourneys());
    if (method === 'POST') return ok(createJourney(await body(req)), 201);
    return null;
  }

  const journeyId = rest[0];
  const action = rest[1];

  // /command-center/journeys/:id
  if (rest.length === 1) {
    if (method === 'GET') {
      const journey = getJourney(journeyId);
      return journey ? ok(journey) : notFound('Journey not found');
    }
    if (method === 'PATCH') {
      const journey = updateJourney(journeyId, await body(req));
      return journey ? ok(journey) : notFound('Journey not found');
    }
    if (method === 'DELETE') {
      return deleteJourney(journeyId) ? ok({ deleted: true }) : notFound('Journey not found');
    }
    return null;
  }

  // /command-center/journeys/:id/<action>
  if (rest.length === 2) {
    if (action === 'activate' && method === 'POST') {
      const journey = setJourneyStatus(journeyId, 'ACTIVE');
      return journey ? ok(journey) : notFound('Journey not found');
    }
    if (action === 'archive' && method === 'POST') {
      const journey = setJourneyStatus(journeyId, 'ARCHIVED');
      return journey ? ok(journey) : notFound('Journey not found');
    }
    if (action === 'enrollments' && method === 'GET') {
      if (!getJourney(journeyId)) return notFound('Journey not found');
      return ok(listEnrollments(journeyId));
    }
    if (action === 'enroll' && method === 'POST') {
      const enrollment = enroll(journeyId, await body(req));
      return enrollment ? ok(enrollment, 201) : notFound('Journey not found');
    }
    if (action === 'exit' && method === 'POST') {
      if (!getJourney(journeyId)) return notFound('Journey not found');
      return ok(exitEnrollment(journeyId, await body(req)));
    }
  }

  return null;
}

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const path = segments.join('/');
  const qs = req.nextUrl.searchParams.toString();
  const url = `${WORKFLOW_SERVICE}/api/v1/command-center/${path}${qs ? `?${qs}` : ''}`;
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
          message: err instanceof Error ? err.message : 'Failed to connect to workflow service',
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
    return notFound(`Unhandled command-center route: ${req.method} /${segments.join('/')}`);
  }
  return proxy(req, segments);
}

export const GET = route;
export const POST = route;
export const PATCH = route;
export const PUT = route;
export const DELETE = route;
