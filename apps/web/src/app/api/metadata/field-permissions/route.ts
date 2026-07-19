import { NextRequest, NextResponse } from 'next/server';

// Field-level read/write permissions live in metadata-service as the
// FieldPermission model, exposed over its GraphQL subgraph (/graphql).
// This BFF route proxies list/create/delete to that endpoint, forwarding the
// caller's Bearer token (injected by middleware from the nexus_token cookie)
// and tenant header so the GraphQL context can scope + authorize the operation.
const METADATA_SERVICE = process.env.METADATA_SERVICE_URL || 'http://localhost:3004';

async function callGraphQL(
  req: NextRequest,
  query: string,
  variables: Record<string, unknown>
) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = req.headers.get('x-tenant-id') ?? 'default';

  const res = await fetch(`${METADATA_SERVICE}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
      'x-tenant-id': tenantId,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json().catch(() => ({}));
  if (json?.errors?.length) {
    const first = json.errors[0] ?? {};
    const message = first.message ?? 'GraphQL error';
    // Derive the HTTP status from the GraphQL error's own `extensions`, NOT from
    // a regex over the human-readable message. The message-sniffing version
    // mapped metadata-service's `Not authenticated` (code UNAUTHENTICATED) to a
    // misleading HTTP 400 "bad request" — the reason `GET ?objectType=deal`
    // returned 400 on a call whose parameters were perfectly valid.
    const code = String(first.extensions?.code ?? '');
    const extStatus = Number(first.extensions?.status);
    const status = Number.isFinite(extStatus) && extStatus >= 400 && extStatus <= 599
      ? extStatus
      : code === 'UNAUTHENTICATED'
        ? 401
        : code === 'FORBIDDEN'
          ? 403
          : 502;
    return NextResponse.json({ error: message, code: code || 'UPSTREAM_ERROR' }, { status });
  }
  return NextResponse.json(json?.data ?? {}, { status: res.status });
}

const LIST_QUERY = /* GraphQL */ `
  query FieldPermissions($limit: Int, $objectType: String) {
    fieldPermissions(limit: $limit, objectType: $objectType) {
      id
      tenantId
      objectType
      fieldName
      allowedRoles
      createdAt
    }
  }
`;

const CREATE_MUTATION = /* GraphQL */ `
  mutation CreateFieldPermission($input: CreateFieldPermissionInput!) {
    createFieldPermission(input: $input) {
      id
      tenantId
      objectType
      fieldName
      allowedRoles
      createdAt
    }
  }
`;

const DELETE_MUTATION = /* GraphQL */ `
  mutation DeleteFieldPermission($id: ID!) {
    deleteFieldPermission(id: $id)
  }
`;

/**
 * GET /api/metadata/field-permissions[?objectType=deal][&limit=100]
 *
 * Required: a caller `Authorization: Bearer <jwt>` carrying `settings:read`
 * (metadata-service resolves the tenant from the verified token). Both query
 * params are OPTIONAL filters — `objectType` narrows to one CRM object, `limit`
 * caps the page at 100 (the resolver's own ceiling).
 */
export async function GET(req: NextRequest) {
  const objectType = req.nextUrl.searchParams.get('objectType');
  const rawLimit = Number(req.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 100;
  return callGraphQL(req, LIST_QUERY, { limit, objectType: objectType || null });
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? 'default';
  const body = await req.json().catch(() => ({}));
  const { objectType, fieldName, allowedRoles } = body ?? {};

  if (!objectType || !fieldName || !Array.isArray(allowedRoles)) {
    return NextResponse.json(
      { error: 'objectType, fieldName and allowedRoles[] are required' },
      { status: 400 }
    );
  }

  return callGraphQL(req, CREATE_MUTATION, {
    input: { tenantId, objectType, fieldName, allowedRoles },
  });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  return callGraphQL(req, DELETE_MUTATION, { id });
}
