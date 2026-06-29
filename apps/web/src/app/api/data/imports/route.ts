import { NextRequest, NextResponse } from 'next/server';

const DATA_SERVICE = process.env.DATA_SERVICE_URL || 'http://localhost:3015';

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') || 'default';
  const formData = await req.formData();
  const file = formData.get('file');
  const mappingRaw = formData.get('mapping');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const mapping =
    typeof mappingRaw === 'string' ? (JSON.parse(mappingRaw) as Record<string, string>) : {};
  const buffer = Buffer.from(await file.arrayBuffer());
  const csvBase64 = buffer.toString('base64');

  const res = await fetch(`${DATA_SERVICE}/api/v1/import/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
    body: JSON.stringify({
      fileName: file.name,
      csvBase64,
      fieldMap: mapping,
    }),
  });

  const data = await res.json();
  const jobId = data?.data?.id as string | undefined;
  return NextResponse.json({ jobId, data }, { status: res.status });
}
