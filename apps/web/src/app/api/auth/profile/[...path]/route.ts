import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiSuccess,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';
import { serviceApiBase } from '@/lib/server/service-url';

const AUTH_URL = serviceApiBase(process.env.AUTH_SERVICE_URL, 'http://auth-service:3000');

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }, method: string) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = params.path.join('/');
  const body = method !== 'GET' ? await req.text() : undefined;
  const search = req.nextUrl.searchParams.toString();

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();

    if (path === 'me' && method === 'GET') {
      return NextResponse.json(apiSuccess(state.profile));
    }

    if (path === 'me' && method === 'PUT') {
      const parsed = body ? JSON.parse(body) : {};
      state.profile = {
        ...state.profile,
        firstName: parsed.firstName ?? state.profile.firstName,
        lastName: parsed.lastName ?? state.profile.lastName,
        phone: parsed.phone ?? state.profile.phone,
        locale: parsed.locale ?? state.profile.locale,
        timezone: parsed.timezone ?? state.profile.timezone,
        profile: {
          ...state.profile.profile,
          ...parsed,
        },
      };
      return NextResponse.json(apiSuccess(state.profile));
    }

    if (path === 'me/avatar' && method === 'POST') {
      const parsed = body ? JSON.parse(body) : {};
      state.profile.avatarUrl = parsed.avatarUrl ?? state.profile.avatarUrl;
      return NextResponse.json(apiSuccess(state.profile));
    }

    if (path === 'team' && method === 'GET') {
      return NextResponse.json(apiSuccess(state.users));
    }
  }

  try {
    const res = await fetch(`${AUTH_URL}/profile/${path}${method === 'GET' && search ? `?${search}` : ''}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess(null));
  }
}

export const GET = (req: NextRequest, ctx: { params: { path: string[] } }) => proxy(req, ctx, 'GET');
export const PUT = (req: NextRequest, ctx: { params: { path: string[] } }) => proxy(req, ctx, 'PUT');
export const POST = (req: NextRequest, ctx: { params: { path: string[] } }) => proxy(req, ctx, 'POST');
