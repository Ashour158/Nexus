import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, unknown>;
  components?: Record<string, unknown>;
  tags?: unknown[];
}

const SERVICE_PORTS: Record<string, number> = {
  'auth-service': 3000,
  'crm-service': 3001,
  'finance-service': 3002,
  'metadata-service': 3004,
  'realtime-service': 3005,
  'analytics-service': 3008,
  'comm-service': 3009,
  'integration-service': 3012,
  'blueprint-service': 3013,
  'approval-service': 3014,
  'data-service': 3015,
  'document-service': 3016,
  'chatbot-service': 3017,
  'cadence-service': 3018,
  'storage-service': 3010,
  'search-service': 3006,
  'workflow-service': 3007,
  'notification-service': 3003,
  'email-sync-service': 3026,
  'territory-service': 3019,
  'incentive-service': 3024,
  'knowledge-service': 3023,
  'portal-service': 3022,
  'planning-service': 3020,
  'reporting-service': 3021,
  'router-coprocessor': 4001,
  'quotes-service': 3033,
};

async function fetchSpec(name: string, port: number): Promise<OpenAPISpec | null> {
  try {
    const res = await fetch(`http://localhost:${port}/docs/json`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const spec = (await res.json()) as OpenAPISpec;
    // Prefix paths with service name to avoid collisions
    const prefixedPaths: Record<string, unknown> = {};
    for (const [path, def] of Object.entries(spec.paths)) {
      prefixedPaths[`/${name}${path}`] = def;
    }
    return { ...spec, paths: prefixedPaths };
  } catch {
    return null;
  }
}

async function main() {
  const aggregated: OpenAPISpec = {
    openapi: '3.0.3',
    info: { title: 'NEXUS CRM API', version: '1.0.0' },
    paths: {},
    components: { schemas: {}, securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    tags: [],
  };

  const seenTags = new Set<string>();

  for (const [name, port] of Object.entries(SERVICE_PORTS)) {
    const spec = await fetchSpec(name, port);
    if (!spec) {
      console.warn(`Could not fetch spec for ${name} on port ${port}`);
      continue;
    }
    Object.assign(aggregated.paths, spec.paths);
    if (spec.components?.schemas) {
      Object.assign(aggregated.components!.schemas!, spec.components.schemas as Record<string, unknown>);
    }
    if (spec.tags) {
      for (const tag of spec.tags) {
        const tagName = (tag as { name: string }).name;
        if (!seenTags.has(tagName)) {
          seenTags.add(tagName);
          (aggregated.tags as unknown[]).push(tag);
        }
      }
    }
    console.log(`Merged spec from ${name}`);
  }

  const outPath = resolve(process.cwd(), 'openapi.json');
  writeFileSync(outPath, JSON.stringify(aggregated, null, 2));
  console.log(`Aggregated OpenAPI spec written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
