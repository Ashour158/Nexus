import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async search(_parent: unknown, { query, index }: { query: string; index?: string; limit?: number; offset?: number }, _ctx: GraphQLContext) {
      return {
        id: `search-${Date.now()}`,
        query,
        index: index ?? null,
        hits: [],
        totalHits: 0,
        processingTimeMs: 0,
      };
    },
    async searchHealth() {
      return { status: 'ok', service: 'search-service' };
    },
  },
  Mutation: {
    async indexDocument() {
      return true;
    },
    async deleteDocument() {
      return true;
    },
  },
};
