import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = resolve(root, 'scripts/__fixtures__/event-contracts');
const script = resolve(root, 'scripts/check-event-contracts.mjs');

function guard(args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
}

async function fixtureRoot(files) {
  const directory = await mkdtemp(resolve(tmpdir(), 'nexus-event-fixture-'));
  const defaults = {
    'packages/kafka/src/index.ts': `export const TOPICS = {
  INVOICES: 'nexus.finance.invoices',
  PAYMENTS: 'nexus.finance.payments',
} as const;\n`,
    'scripts/event-contract-allowlist.json': '{"entries":[]}\n',
  };
  for (const [name, contents] of Object.entries({ ...defaults, ...files })) {
    const target = resolve(directory, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  await mkdir(resolve(directory, 'docs'), { recursive: true });
  return directory;
}

async function runFixture(files, extraArgs = []) {
  const directory = await fixtureRoot(files);
  const result = guard(['--root', directory, '--docs', resolve(directory, 'docs/EVENTS.md'), ...extraArgs]);
  return { directory, result };
}

test('flags invoice.paid when its started handler subscribes to the wrong topic', () => {
  const result = guard(['--root', fixture, '--docs', resolve(tmpdir(), 'nexus-events-fixture.md')]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\(a\) unreachable handler \(1\)/);
  assert.match(result.stderr, /finance-service: invoice\.paid @ nexus\.finance\.payments/);
  assert.match(result.stderr, /\(b\) published event has no started consumer \(1\)/);
});

test('activates only the invoked consumer start function in a service', async () => {
  const { directory, result } = await runFixture({
    'services/producer/src/index.ts': `
      producer.publish(TOPICS.PAYMENTS, { type: 'active.event', tenantId: 't' });
      producer.publish(TOPICS.INVOICES, { type: 'dead.event', tenantId: 't' });
    `,
    'services/consumer/src/index.ts': `import { startActiveConsumer } from './consumers.js';\nawait startActiveConsumer();\n`,
    'services/consumer/src/consumers.ts': `
      export async function startActiveConsumer() {
        const active = new NexusConsumer('active');
        active.on('active.event', async () => undefined);
        await active.subscribe([TOPICS.PAYMENTS]);
      }
      export async function startDeadConsumer() {
        const dead = new NexusConsumer('dead');
        dead.on('dead.event', async () => undefined);
        await dead.subscribe([TOPICS.INVOICES]);
      }
    `,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /producer: dead\.event @ nexus\.finance\.invoices/);
  assert.doesNotMatch(result.stderr, /producer: active\.event/);
  assert.doesNotMatch(result.stderr, /handler has no publisher/);
  await rm(directory, { recursive: true, force: true });
});

test('does not cross-satisfy subscriptions between consumer instances', async () => {
  const { directory, result } = await runFixture({
    'services/producer/src/index.ts': `producer.publish(TOPICS.PAYMENTS, { type: 'cross.event', tenantId: 't' });\n`,
    'services/consumer/src/index.ts': `import { startConsumers } from './consumers.js';\nawait startConsumers();\n`,
    'services/consumer/src/consumers.ts': `
      export async function startConsumers() {
        const handlerConsumer = new NexusConsumer('handler');
        handlerConsumer.on('cross.event', async () => undefined);
        await handlerConsumer.subscribe([TOPICS.INVOICES]);
        const topicConsumer = new NexusConsumer('topic');
        await topicConsumer.subscribe([TOPICS.PAYMENTS]);
      }
    `,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\(a\) unreachable handler \(1\)/);
  assert.match(result.stderr, /\(b\) published event has no started consumer \(1\)/);
  await rm(directory, { recursive: true, force: true });
});

test('reports a constant-resolved off-contract published topic once', async () => {
  const { directory, result } = await runFixture({
    'services/producer/src/index.ts': `
      const CUSTOM_TOPIC = 'nexus.crm.custom-fields';
      producer.publish(CUSTOM_TOPIC, { type: 'custom-field.created', tenantId: 't' });
      producer.publish(CUSTOM_TOPIC, { type: 'custom-field.created', tenantId: 't' });
    `,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\(d\) published literal topic is absent from TOPICS \(1\)/);
  assert.match(result.stderr, /custom-field\.created @ nexus\.crm\.custom-fields/);
  await rm(directory, { recursive: true, force: true });
});

test('recognizes index to buildServer factory to consumer start reachability', async () => {
  const { directory, result } = await runFixture({
    'services/producer/src/index.ts': `producer.publish(TOPICS.PAYMENTS, { type: 'factory.ready', tenantId: 't' });\n`,
    'services/consumer/src/index.ts': `import { buildServer } from './server.js';\nawait buildServer();\n`,
    'services/consumer/src/server.ts': `
      import { startFactoryConsumer } from './consumer.js';
      export async function buildServer(): Promise<{
        app: unknown;
        prismaHealth: unknown;
      }> {
        await startFactoryConsumer();
        return { app: {}, prismaHealth: {} };
      }
    `,
    'services/consumer/src/consumer.ts': `
      export async function startFactoryConsumer() {
        const consumer = new NexusConsumer('factory');
        consumer.on('factory.ready', async () => undefined);
        await consumer.subscribe([TOPICS.PAYMENTS]);
      }
    `,
  });
  assert.equal(result.status, 0, result.stderr);
  await rm(directory, { recursive: true, force: true });
});

test('accepts a positive direct boot contract', async () => {
  const { directory, result } = await runFixture({
    'services/producer/src/index.ts': `producer.publish(TOPICS.INVOICES, { type: 'invoice.created', tenantId: 't' });\n`,
    'services/consumer/src/index.ts': `
      const consumer = new NexusConsumer('inline');
      consumer.on('invoice.created', async () => undefined);
      await consumer.subscribe([TOPICS.INVOICES]);
    `,
  });
  assert.equal(result.status, 0, result.stderr);
  await rm(directory, { recursive: true, force: true });
});

test('includes analytics-service in the repository contract scan', async () => {
  const { directory, result } = await runFixture({
    'services/producer/src/index.ts': `producer.publish(TOPICS.PAYMENTS, { type: 'analytics.payment', tenantId: 't' });\n`,
    'services/analytics-service/src/index.ts': `
      const consumer = new NexusConsumer('analytics');
      consumer.on('analytics.payment', async () => undefined);
      await consumer.subscribe([TOPICS.PAYMENTS]);
    `,
  });
  assert.equal(result.status, 0, result.stderr);
  await rm(directory, { recursive: true, force: true });
});

test('extracts a transactional outbox row using a TOPICS constant', async () => {
  const { directory, result } = await runFixture({
    'services/producer/src/index.ts': `
      await prisma.outboxMessage.create({
        data: { topic: TOPICS.PAYMENTS, eventType: 'payment.recorded', payload: {} },
      });
    `,
    'services/consumer/src/index.ts': `
      const consumer = new NexusConsumer('outbox');
      consumer.on('payment.recorded', async () => undefined);
      await consumer.subscribe([TOPICS.PAYMENTS]);
    `,
  });
  assert.equal(result.status, 0, result.stderr);
  await rm(directory, { recursive: true, force: true });
});

test('reports an off-contract literal transactional outbox topic', async () => {
  const { directory, result } = await runFixture({
    'services/producer/src/index.ts': `
      await prisma.outboxMessage.create({
        data: { topic: 'nexus.finance.legacy-payments', eventType: 'payment.legacy', payload: {} },
      });
    `,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\(d\) published literal topic is absent from TOPICS \(1\)/);
  assert.match(result.stderr, /payment\.legacy @ nexus\.finance\.legacy-payments/);
  await rm(directory, { recursive: true, force: true });
});

test('binds helper-registered handlers to the caller-owned consumer unit', async () => {
  const { directory, result } = await runFixture({
    'services/producer/src/index.ts': `producer.publish(TOPICS.PAYMENTS, { type: 'helper.event', tenantId: 't' });\n`,
    'services/consumer/src/index.ts': `
      import { registerHandlers } from './handlers.js';
      const consumer = new NexusConsumer('helper');
      registerHandlers(consumer);
      await consumer.subscribe([TOPICS.PAYMENTS]);
    `,
    'services/consumer/src/handlers.ts': `
      import type { NexusConsumer } from '@nexus/kafka';
      export function registerHandlers(consumer: NexusConsumer) {
        consumer.on('helper.event', async () => undefined);
      }
    `,
  });
  assert.equal(result.status, 0, result.stderr);
  await rm(directory, { recursive: true, force: true });
});

test('reports an uninvoked consumer handler with no publisher as dead and phantom', async () => {
  const { directory, result } = await runFixture({
    'services/consumer/src/index.ts': `export const booted = true;\n`,
    'services/consumer/src/dead.ts': `
      export async function startDeadConsumer() {
        const consumer = new NexusConsumer('dead');
        consumer.on('never.published', async () => undefined);
        await consumer.subscribe([TOPICS.INVOICES]);
      }
    `,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\(a\) unreachable handler \(1\)/);
  assert.match(result.stderr, /never\.published @ nexus\.finance\.invoices/);
  assert.match(result.stderr, /not reachable from the service boot path/);
  assert.match(result.stderr, /\(c\) handler has no publisher \(1\)/);
  await rm(directory, { recursive: true, force: true });
});

test('module-qualified startup does not activate an unrelated same-named function', async () => {
  const { directory, result } = await runFixture({
    'services/producer/src/index.ts': `producer.publish(TOPICS.PAYMENTS, { type: 'live.event', tenantId: 't' });\n`,
    'services/consumer/src/index.ts': `import { startSameConsumer } from './live.js';\nawait startSameConsumer();\n`,
    'services/consumer/src/live.ts': `
      export async function startSameConsumer() {
        const consumer = new NexusConsumer('live');
        consumer.on('live.event', async () => undefined);
        await consumer.subscribe([TOPICS.PAYMENTS]);
      }
    `,
    'services/consumer/src/unrelated.ts': `
      export async function startSameConsumer() {
        const consumer = new NexusConsumer('unrelated');
        consumer.on('unrelated.event', async () => undefined);
        await consumer.subscribe([TOPICS.INVOICES]);
      }
    `,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unrelated\.event @ nexus\.finance\.invoices/);
  assert.match(result.stderr, /not reachable from the service boot path/);
  assert.doesNotMatch(result.stderr, /producer: live\.event/);
  await rm(directory, { recursive: true, force: true });
});

test('malformed allowlists fail closed', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'nexus-event-allowlist-'));
  const allowlist = resolve(directory, 'allowlist.json');
  await writeFile(allowlist, JSON.stringify({
    entries: [{ category: 'unreachable', service: 'finance-service', event: 'invoice.paid', topic: 'nexus.finance.payments', reason: '' }],
  }));
  const result = guard(['--root', fixture, '--allowlist', allowlist, '--docs', resolve(directory, 'EVENTS.md')]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Malformed allowlist entry 1/);
  await rm(directory, { recursive: true, force: true });
});

test('--check detects documentation drift', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'nexus-event-docs-'));
  const docs = resolve(directory, 'EVENTS.md');
  await mkdir(dirname(docs), { recursive: true });
  await writeFile(docs, 'stale\n');
  const result = guard(['--root', fixture, '--docs', docs, '--check']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /generated event documentation is stale/);
  assert.equal(await readFile(docs, 'utf8'), 'stale\n');
  await rm(directory, { recursive: true, force: true });
});
