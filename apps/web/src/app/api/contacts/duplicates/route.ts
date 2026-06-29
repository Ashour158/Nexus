import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';
import { findDuplicateContacts } from '@/lib/server/contact-hardening';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(
      apiSuccess({
        duplicates: findDuplicateContacts(
          getDevPreviewState().contacts,
          body as Record<string, unknown>,
          typeof body.id === 'string' ? body.id : undefined
        ),
      })
    );
  }

  return NextResponse.json(apiSuccess({ duplicates: [] }));
}
