import { NextRequest } from 'next/server';

const DATA_SERVICE = process.env.DATA_SERVICE_URL || 'http://localhost:3015';

export async function GET(req: NextRequest, { params }: { params: { jobId: string } }) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const upstream = await fetch(`${DATA_SERVICE}/api/v1/imports/${params.jobId}/status`, {
    headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
  });
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
