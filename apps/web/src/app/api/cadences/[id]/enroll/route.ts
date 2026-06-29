import { NextRequest, NextResponse } from 'next/server';

const CADENCE_URL = process.env.CADENCE_SERVICE_URL ?? process.env.NEXT_PUBLIC_CADENCE_URL ?? 'http://localhost:3018/api/v1';
const CRM_BASE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as { emails?: string[] };
  const emails = body.emails ?? [];
  if (emails.length === 0) {
    return NextResponse.json({ error: 'No emails provided' }, { status: 400 });
  }

  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  let enrolled = 0;
  const errors: string[] = [];

  for (const email of emails) {
    let found: { id: string; ownerId: string; objectType: 'CONTACT' | 'LEAD' } | null = null;

    // Search contacts first
    const contactRes = await fetch(
      `${CRM_BASE}/api/v1/contacts?search=${encodeURIComponent(email)}&limit=1`,
      { headers: { Authorization: auth, 'x-tenant-id': tenantId } }
    ).catch(() => null);

    if (contactRes?.ok) {
      const contactJson = (await contactRes.json().catch(() => null)) as {
        data?: { data?: Array<{ id: string; ownerId: string }> };
      } | null;
      const contact = contactJson?.data?.data?.[0];
      if (contact) {
        found = { id: contact.id, ownerId: contact.ownerId, objectType: 'CONTACT' };
      }
    }

    // If not found, search leads
    if (!found) {
      const leadRes = await fetch(
        `${CRM_BASE}/api/v1/leads?search=${encodeURIComponent(email)}&limit=1`,
        { headers: { Authorization: auth, 'x-tenant-id': tenantId } }
      ).catch(() => null);

      if (leadRes?.ok) {
        const leadJson = (await leadRes.json().catch(() => null)) as {
          data?: Array<{ id: string; ownerId: string }>;
        } | null;
        const lead = leadJson?.data?.[0];
        if (lead) {
          found = { id: lead.id, ownerId: lead.ownerId, objectType: 'LEAD' };
        }
      }
    }

    if (!found) {
      errors.push(`${email}: not found`);
      continue;
    }

    const enrollRes = await fetch(`${CADENCE_URL}/enrollments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({
        cadenceId: params.id,
        objectType: found.objectType,
        objectId: found.id,
        ownerId: found.ownerId,
      }),
    });

    if (enrollRes.ok) {
      enrolled++;
    } else {
      const err = (await enrollRes.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      errors.push(`${email}: ${err.error?.message ?? enrollRes.statusText}`);
    }
  }

  return NextResponse.json({ count: enrolled, errors: errors.length > 0 ? errors : undefined });
}
