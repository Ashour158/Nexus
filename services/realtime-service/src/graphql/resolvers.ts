export const resolvers = {
  Query: {
    async realtimeHealth() {
      return { status: 'ok', service: 'realtime-service' };
    },
    async connectedUsers() {
      return 0;
    },
  },
  Mutation: {
    async broadcast() {
      return true;
    },
  },
};
