export interface GraphQLContext {
  prisma: any;
  tenantId: string | null;
  userId: string | null;
}

export function buildContext(prisma: any) {
  return async function createContext({ request }: { request: Request }): Promise<GraphQLContext> {
    const tenantId = request.headers.get('x-tenant-id') ?? null;
    const authHeader = request.headers.get('authorization');
    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '{}', 'base64').toString());
        userId = payload.sub ?? null;
      } catch {
        // ignore invalid/malformed token
      }
    }

    return { prisma, tenantId, userId };
  };
}
