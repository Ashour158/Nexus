import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { startService, optionalEnv } from '@nexus/service-utils';
import { buildServer } from './server.js';

startTracing({ serviceName: 'billing-service' });

const port = Number(optionalEnv('PORT', '3011'));
const { app, prismaHealth } = await buildServer();

await startService(app, port, async () => {
  await prismaHealth.$disconnect();
});
