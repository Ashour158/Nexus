import { countPresence, listPresence } from '../socket/presence.js';
import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async realtimeHealth() {
      return { status: 'ok', service: 'realtime-service' };
    },
    async connectedUsers(_root: unknown, _args: unknown, ctx: GraphQLContext) {
      try {
        return ctx.tenantId ? countPresence(ctx.tenantId) : 0;
      } catch {
        return 0;
      }
    },
    async presence(_root: unknown, _args: unknown, ctx: GraphQLContext) {
      try {
        if (!ctx.tenantId) return [];
        return listPresence(ctx.tenantId).map((p) => ({
          userId: p.userId,
          connections: p.connections,
          since: new Date(p.since).toISOString(),
        }));
      } catch {
        return [];
      }
    },
  },
  Mutation: {
    async broadcast() {
      return true;
    },
  },
};
