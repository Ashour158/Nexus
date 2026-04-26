import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const mapping = formData.get('mapping') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  let text = await file.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = text
    .split('\n')
    .map((r) => r.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
  const headers = rows[0] ?? [];
  const fieldMap = mapping ? (JSON.parse(mapping) as Record<string, string>) : {};

  const contacts = rows
    .slice(1)
    .filter((r) => r.length > 1)
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (fieldMap[h]) obj[fieldMap[h]] = row[i] ?? '';
      });
      return obj;
    });

  if (contacts.length === 0) {
    return NextResponse.json({ error: 'No contacts found in CSV', imported: 0 }, { status: 400 });
  }

  const res = await fetch(`${process.env.CRM_SERVICE_URL}/contacts/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ contacts }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `CRM import failed: ${err}`, imported: 0 }, { status: 500 });
  }

  const result = (await res.json()) as { count?: number; errors?: unknown[] };
  return NextResponse.json({ imported: result.count ?? contacts.length, errors: result.errors ?? [] });
}
