import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

/**
 * RR-H17 — shared OpenAPI mount.
 *
 * Every service historically shipped a per-service `registerSwagger()` that was
 * never called, so no service actually served docs. This helper is invoked
 * automatically from `createService`, mounting `@fastify/swagger` +
 * swagger-ui at `/docs` and serving the generated document at `/openapi.json`.
 *
 * Env-gated: set `ENABLE_SWAGGER=false` to skip (e.g. locked-down production).
 * Safe-default: needs no per-service config — title/version derive from the
 * service name so a service that never configured swagger still gets valid docs.
 *
 * FOLLOW-UP (documented, not done here): routes currently declare no
 * route-level JSON schema, so the generated document lists paths without
 * request/response bodies. To enrich it, attach zod→json-schema (e.g. via
 * `fastify-type-provider-zod`'s `jsonSchemaTransform`) per route; the zod
 * validator compiler wired in `createService` already makes zod route schemas
 * first-class.
 */
export interface SwaggerOptions {
  /** Service name, used for the document title. */
  name: string;
  /** OpenAPI document version. Defaults to the package version or 1.0.0. */
  version?: string;
  /** UI + JSON route prefix. Defaults to `/docs`. */
  routePrefix?: string;
}

/**
 * Opt-IN: swagger mounts only when `ENABLE_SWAGGER=true`.
 * Default OFF because the installed `@fastify/swagger` targets Fastify 5 while
 * services run Fastify 4 — mounting it throws `FST_ERR_PLUGIN_VERSION_MISMATCH`
 * during avvio's async boot (the error escapes the try/catch → process crash).
 * Re-enable once a Fastify-4-compatible `@fastify/swagger` (v8.x) is pinned.
 */
export function isSwaggerEnabled(): boolean {
  return (process.env.ENABLE_SWAGGER ?? 'false').toLowerCase() === 'true';
}

export async function registerSwagger(
  app: FastifyInstance,
  opts: SwaggerOptions
): Promise<void> {
  if (!isSwaggerEnabled()) return;

  const routePrefix = opts.routePrefix ?? '/docs';
  const version = opts.version ?? process.env.npm_package_version ?? '1.0.0';

  try {
    await app.register(fastifySwagger, {
      openapi: {
        info: {
          title: `Nexus ${opts.name} API`,
          description: `OpenAPI document for the Nexus ${opts.name}.`,
          version,
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
      },
    });

    // Serve the raw document at `/openapi.json` (stable, tooling-friendly path).
    app.get('/openapi.json', async (_req, reply) => {
      reply.header('Content-Type', 'application/json');
      return (app as unknown as { swagger: () => unknown }).swagger();
    });

    await app.register(fastifySwaggerUi, {
      routePrefix,
      uiConfig: { docExpansion: 'list', deepLinking: true },
    });
  } catch (err) {
    // Never let docs wiring take down a service.
    app.log.warn({ err }, 'Failed to register swagger; continuing without docs');
  }
}
