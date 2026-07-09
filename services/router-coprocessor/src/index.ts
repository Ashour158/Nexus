// import { startTracing } from '@nexus/service-utils/tracing';
/**
 * Apollo Router Coprocessor — validates query depth and complexity.
 *
 * Receives GraphQL requests from Apollo Router, parses the AST,
 * and rejects queries exceeding configured limits.
 *
 * Environment:
 *   PORT — defaults to 4001
 *   MAX_DEPTH — defaults to 15
 *   MAX_COMPLEXITY — defaults to 1000
 */

import { createService, startService } from '@nexus/service-utils';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { parse, type DocumentNode, type FieldNode, type InlineFragmentNode, type FragmentSpreadNode, type SelectionNode } from 'graphql';

// startTracing({ serviceName: 'router-coprocessor' });
const MAX_DEPTH = Number(process.env.MAX_DEPTH ?? 15);
const MAX_COMPLEXITY = Number(process.env.MAX_COMPLEXITY ?? 1000);

const port = Number(process.env.PORT ?? 4001);
const jwtSecret = process.env.JWT_SECRET || 'router-coprocessor-local-secret-not-used-min-32-chars';

const app = await createService({
  name: 'router-coprocessor',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
  publicPrefixes: ['/coprocessor', '/health'],
});

interface CoprocessorRequest {
  version: number;
  stage: string;
  control: Record<string, unknown>;
  id: string;
  body?: string;
  headers?: Record<string, string>;
}

interface CoprocessorResponse {
  version: number;
  stage: string;
  control: { break?: number; body?: string };
  id: string;
  headers?: Record<string, string>;
}

function calculateDepth(node: DocumentNode): number {
  let maxDepth = 0;

  function walk(selections: readonly SelectionNode[] | undefined, depth: number): void {
    if (!selections || selections.length === 0) return;
    maxDepth = Math.max(maxDepth, depth);
    for (const sel of selections) {
      if (sel.kind === 'Field') {
        walk((sel as FieldNode).selectionSet?.selections, depth + 1);
      } else if (sel.kind === 'InlineFragment') {
        walk((sel as InlineFragmentNode).selectionSet?.selections, depth + 1);
      } else if (sel.kind === 'FragmentSpread') {
        const spread = sel as FragmentSpreadNode;
        const fragment = node.definitions.find(
          (d): d is typeof d & { name: { value: string }; selectionSet: { selections: readonly SelectionNode[] } } =>
            d.kind === 'FragmentDefinition' && d.name.value === spread.name.value
        );
        if (fragment) {
          walk(fragment.selectionSet?.selections, depth + 1);
        }
      }
    }
  }

  for (const def of node.definitions) {
    if (def.kind === 'OperationDefinition' || def.kind === 'FragmentDefinition') {
      walk(def.selectionSet?.selections, 1);
    }
  }

  return maxDepth;
}

function calculateComplexity(node: DocumentNode): number {
  let complexity = 0;

  function walk(selections: readonly SelectionNode[] | undefined): void {
    if (!selections) return;
    for (const sel of selections) {
      complexity += 1;
      if (sel.kind === 'Field') {
        walk((sel as FieldNode).selectionSet?.selections);
      } else if (sel.kind === 'InlineFragment') {
        walk((sel as InlineFragmentNode).selectionSet?.selections);
      } else if (sel.kind === 'FragmentSpread') {
        const spread = sel as FragmentSpreadNode;
        const fragment = node.definitions.find(
          (d): d is typeof d & { name: { value: string }; selectionSet: { selections: readonly SelectionNode[] } } =>
            d.kind === 'FragmentDefinition' && d.name.value === spread.name.value
        );
        if (fragment) {
          walk(fragment.selectionSet?.selections);
        }
      }
    }
  }

  for (const def of node.definitions) {
    if (def.kind === 'OperationDefinition' || def.kind === 'FragmentDefinition') {
      walk(def.selectionSet?.selections);
    }
  }

  return complexity;
}

app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
  reply.status(200).send({ status: 'ok', service: 'router-coprocessor' });
});

app.post('/coprocessor', async (request: FastifyRequest, reply: FastifyReply): Promise<CoprocessorResponse> => {
  // Verify service-to-service token
  const expectedToken = process.env.ROUTER_COPROCESSOR_TOKEN;
  const receivedToken = String(request.headers['x-service-token'] ?? '');
  if (expectedToken && receivedToken) {
    const valid =
      expectedToken.length === receivedToken.length &&
      Buffer.from(expectedToken).equals(Buffer.from(receivedToken));
    if (!valid) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  }

  const req = request.body as CoprocessorRequest;

  // Only process RouterRequest stage
  if (req.stage !== 'RouterRequest') {
    return {
      version: req.version,
      stage: req.stage,
      control: req.control,
      id: req.id,
      headers: req.headers,
    };
  }

  const bodyText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  if (!bodyText || bodyText === '{}') {
    return {
      version: req.version,
      stage: req.stage,
      control: req.control,
      id: req.id,
      headers: req.headers,
    };
  }

  let query: string;
  try {
    const parsedBody = JSON.parse(bodyText);
    query = parsedBody.query ?? '';
  } catch {
    return {
      version: req.version,
      stage: req.stage,
      control: req.control,
      id: req.id,
      headers: req.headers,
    };
  }

  if (!query) {
    return {
      version: req.version,
      stage: req.stage,
      control: req.control,
      id: req.id,
      headers: req.headers,
    };
  }

  let document: DocumentNode;
  try {
    document = parse(query);
  } catch (err) {
    return {
      version: req.version,
      stage: req.stage,
      control: { break: 400, body: JSON.stringify({ error: 'Invalid GraphQL query' }) },
      id: req.id,
      headers: req.headers,
    };
  }

  const depth = calculateDepth(document);
  if (depth > MAX_DEPTH) {
    return {
      version: req.version,
      stage: req.stage,
      control: {
        break: 400,
        body: JSON.stringify({ error: `Query depth ${depth} exceeds maximum ${MAX_DEPTH}` }),
      },
      id: req.id,
      headers: req.headers,
    };
  }

  const complexity = calculateComplexity(document);
  if (complexity > MAX_COMPLEXITY) {
    return {
      version: req.version,
      stage: req.stage,
      control: {
        break: 400,
        body: JSON.stringify({ error: `Query complexity ${complexity} exceeds maximum ${MAX_COMPLEXITY}` }),
      },
      id: req.id,
      headers: req.headers,
    };
  }

  // Query passes validation — allow it through
  return {
    version: req.version,
    stage: req.stage,
    control: req.control,
    id: req.id,
    headers: req.headers,
  };
});

await startService(app, port, async () => {});
