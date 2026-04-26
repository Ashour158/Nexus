import rq from '@fastify/request-context';

type Store = { get: (key: string) => unknown; set: (key: string, value: unknown) => void };

export const alsStore: Store = (rq as unknown as { requestContext: Store }).requestContext;
