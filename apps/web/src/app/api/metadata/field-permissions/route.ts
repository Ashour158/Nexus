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
    const message = json.errors[0]?.message ?? 'GraphQL error';
    const status = /permission|forbidden|unauthor/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json(json?.data ?? {}, { status: res.status });
}

const LIST_QUERY = /* GraphQL */ `
  query FieldPermissions($limit: Int) {
    fieldPermissions(limit: $limit) {
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

export async function GET(req: NextRequest) {
  return callGraphQL(req, LIST_QUERY, { limit: 100 });
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
