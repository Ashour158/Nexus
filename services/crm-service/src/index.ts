import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { startService, optionalEnv } from '@nexus/service-utils';
import { buildServer } from './server.js';

startTracing({ serviceName: 'crm-service' });

const port = Number(optionalEnv('PORT', '3001'));
const { app, prismaHealth } = await buildServer();

await startService(app, port, async () => {
  await prismaHealth.$disconnect();
});
