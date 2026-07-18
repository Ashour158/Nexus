import { verifyBearerToken } from '@nexus/service-utils';

export interface GraphQLContext {
  prisma: any;
  tenantId: string | null;
  userId: string | null;
}

export function buildContext(prisma: any) {
  return async function createContext({ request }: { request: Request }): Promise<GraphQLContext> {
    // Trust ONLY the verified JWT: signature + exp/nbf are checked via the same
    // precedence as the REST bootstrap (RS256 via AUTH_JWKS_URL, else HS256 via
    // JWT_SECRET). The previous code read tenantId straight off an `x-tenant-id`
    // header and base64-decoded the JWT body with no signature check, so any
    // caller could spoof both tenant and user. tenantId/userId now come from the
    // verified claim only; an unverifiable/absent token yields a null (anonymous)
    // context rather than a spoofable one.
    const authHeader = request.headers.get('authorization');
    const payload = await verifyBearerToken(authHeader);

    return {
      prisma,
      tenantId: payload?.tenantId ?? null,
      userId: payload?.sub ?? null,
    };
  };
}
