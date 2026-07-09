import { verifyBearerToken } from '@nexus/service-utils';

export interface GraphQLContext {
  prisma: any;
  tenantId: string | null;
  userId: string | null;
  permissions: string[];
  roles: string[];
}

export function buildContext(prisma: any) {
  return async function createContext({ request }: { request: Request }): Promise<GraphQLContext> {
    let tenantId = request.headers.get('x-tenant-id') ?? null;
    let userId: string | null = null;
    let permissions: string[] = [];
    let roles: string[] = [];

    // Cryptographically verify the JWT (RS256 via AUTH_JWKS_URL, else HS256 via
    // JWT_SECRET) — the same trust model the REST routes enforce. An invalid or
    // missing token yields an unauthenticated context rather than trusted claims.
    const payload = await verifyBearerToken(request.headers.get('authorization'));
    if (payload) {
      tenantId = payload.tenantId ?? tenantId;
      userId = payload.sub ?? null;
      permissions = payload.permissions ?? [];
      roles = payload.roles ?? [];
    }

    return { prisma, tenantId, userId, permissions, roles };
  };
}
