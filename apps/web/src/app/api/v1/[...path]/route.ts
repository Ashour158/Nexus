import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  createId,
  getDevPreviewState,
  paginated,
} from '@/lib/server/dev-preview-data';

type RouteContext = { params: { path: string[] } };

function unsupported(path: string) {
  return NextResponse.json(
    apiError(`Development preview has no handler for /api/v1/${path}`, 'NOT_FOUND'),
    { status: 404 }
  );
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  if (!DEV_PREVIEW_ENABLED) return unsupported(params.path.join('/'));

  const state = getDevPreviewState();
  const path = params.path.join('/');

  if (path === 'users') {
    const search = req.nextUrl.searchParams.get('search')?.toLowerCase().trim();
    const rows = search
      ? state.users.filter((user) =>
          `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(search)
        )
      : state.users;
    return NextResponse.json(apiSuccess(paginated(rows, req.nextUrl.searchParams)));
  }

  if (path === 'roles') {
    return NextResponse.json(apiSuccess(paginated(state.roles, req.nextUrl.searchParams)));
  }

  if (path === 'roles/permissions/matrix') {
    const permissions = [...new Set(state.roles.flatMap((role) => role.permissions))].sort();
    return NextResponse.json(
      apiSuccess({
        permissions,
        builtInRolePermissions: Object.fromEntries(
          state.roles.map((role) => [role.name, role.permissions])
        ),
      })
    );
  }

  if (path === 'profile/me') {
    return NextResponse.json(apiSuccess(state.profile));
  }

  if (path === 'auth/mfa/status') {
    return NextResponse.json(apiSuccess({ enabled: false }));
  }

  if (path === 'api-keys') {
    return NextResponse.json(apiSuccess(paginated([], req.nextUrl.searchParams)));
  }

  if (path === 'notifications') {
    return NextResponse.json(apiSuccess(paginated([], req.nextUrl.searchParams)));
  }

  if (path === 'notifications/unread-count') {
    return NextResponse.json(apiSuccess({ count: 0 }));
  }

  return unsupported(path);
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  if (!DEV_PREVIEW_ENABLED) return unsupported(params.path.join('/'));

  const state = getDevPreviewState();
  const path = params.path.join('/');

  if (path === 'users/invite') {
    const body = await req.json();
    const user = {
      id: createId('user'),
      firstName: String(body.firstName ?? 'New'),
      lastName: String(body.lastName ?? 'User'),
      email: String(body.email ?? 'new.user@nexus.local'),
      isActive: true,
      roles: state.roles
        .filter((role) => Array.isArray(body.roleIds) && body.roleIds.includes(role.id))
        .map((role) => ({ id: role.id, name: role.name })),
      timezone: 'Africa/Cairo',
      language: 'en',
    };
    state.users.unshift(user);
    return NextResponse.json(apiSuccess(user), { status: 201 });
  }

  if (path === 'roles') {
    const body = await req.json();
    const role = {
      id: createId('role'),
      name: String(body.name ?? 'Custom Role'),
      description: body.description ? String(body.description) : '',
      permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
      isSystem: false,
    };
    state.roles.push(role);
    return NextResponse.json(apiSuccess(role), { status: 201 });
  }

  if (path === 'auth/mfa/setup') {
    return NextResponse.json(
      apiSuccess({
        secret: 'DEV-PREVIEW-MFA-SECRET',
        qrCodeUrl: '',
      })
    );
  }

  if (path === 'auth/mfa/enable' || path === 'auth/mfa/disable') {
    return NextResponse.json(apiSuccess({ enabled: path.endsWith('enable') }));
  }

  if (path === 'notifications/read-all') {
    return NextResponse.json(apiSuccess({ count: 0 }));
  }

  return unsupported(path);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  if (!DEV_PREVIEW_ENABLED) return unsupported(params.path.join('/'));

  const path = params.path.join('/');
  if (path === 'profile/me') {
    const state = getDevPreviewState();
    const body = await req.json();
    const profileUpdates = { ...body };
    delete profileUpdates.firstName;
    delete profileUpdates.lastName;
    delete profileUpdates.phone;
    delete profileUpdates.locale;
    delete profileUpdates.timezone;
    delete profileUpdates.avatarUrl;

    state.profile = {
      ...state.profile,
      firstName: body.firstName ?? state.profile.firstName,
      lastName: body.lastName ?? state.profile.lastName,
      phone: body.phone ?? state.profile.phone,
      locale: body.locale ?? state.profile.locale,
      timezone: body.timezone ?? state.profile.timezone,
      avatarUrl: body.avatarUrl ?? state.profile.avatarUrl,
      profile: {
        ...state.profile.profile,
        ...profileUpdates,
      },
    };
    return NextResponse.json(apiSuccess(state.profile));
  }

  return unsupported(path);
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  if (!DEV_PREVIEW_ENABLED) return unsupported(params.path.join('/'));

  const state = getDevPreviewState();
  const [resource, id, subresource] = params.path;

  if (resource === 'users' && id && subresource === 'roles') {
    const body = await req.json();
    const user = state.users.find((candidate) => candidate.id === id);
    if (!user) return NextResponse.json(apiError('User not found', 'NOT_FOUND'), { status: 404 });

    user.roles = state.roles
      .filter((role) => Array.isArray(body.roleIds) && body.roleIds.includes(role.id))
      .map((role) => ({ id: role.id, name: role.name }));
    return NextResponse.json(apiSuccess(user));
  }

  if (resource === 'users' && id) {
    const body = await req.json();
    const user = state.users.find((candidate) => candidate.id === id);
    if (!user) return NextResponse.json(apiError('User not found', 'NOT_FOUND'), { status: 404 });

    Object.assign(user, body);
    if (state.profile.id === id) Object.assign(state.profile, body);
    return NextResponse.json(apiSuccess(user));
  }

  if (resource === 'roles' && id) {
    const body = await req.json();
    const role = state.roles.find((candidate) => candidate.id === id);
    if (!role) return NextResponse.json(apiError('Role not found', 'NOT_FOUND'), { status: 404 });

    Object.assign(role, body);
    return NextResponse.json(apiSuccess(role));
  }

  if (resource === 'notifications' && id && subresource === 'read') {
    return NextResponse.json(apiSuccess({ id, isRead: true }));
  }

  return unsupported(params.path.join('/'));
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  if (!DEV_PREVIEW_ENABLED) return unsupported(params.path.join('/'));

  const state = getDevPreviewState();
  const [resource, id] = params.path;

  if (resource === 'users' && id) {
    const user = state.users.find((candidate) => candidate.id === id);
    if (!user) return NextResponse.json(apiError('User not found', 'NOT_FOUND'), { status: 404 });

    user.isActive = false;
    return NextResponse.json(apiSuccess({ id, deactivated: true }));
  }

  if (resource === 'roles' && id) {
    const index = state.roles.findIndex((role) => role.id === id);
    if (index === -1) return NextResponse.json(apiError('Role not found', 'NOT_FOUND'), { status: 404 });

    const [removed] = state.roles.splice(index, 1);
    return NextResponse.json(apiSuccess({ id: removed.id }));
  }

  return unsupported(params.path.join('/'));
}
