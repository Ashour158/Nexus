/**
 * API Versioning helpers for NEXUS services.
 *
 * Adds version headers, deprecation notices, and a /versions discovery endpoint.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

export interface VersionInfo {
  version: string;
  status: 'active' | 'deprecated' | 'sunset';
  sunsetDate?: string;
  docsUrl?: string;
}

export interface VersionedRouteOptions {
  version: string;
  /** If set, the route will include a Sunset header */
  sunsetDate?: Date;
  /** Include Deprecation header */
  deprecated?: boolean;
}

const registeredVersions = new Map<string, VersionInfo>();

export function registerVersion(info: VersionInfo): void {
  registeredVersions.set(info.version, info);
}

export function getRegisteredVersions(): VersionInfo[] {
  return Array.from(registeredVersions.values());
}

/** Fastify plugin that decorates replies with versioning headers. */
export async function apiVersionPlugin(
  app: FastifyInstance,
  opts: { version: string; sunsetDate?: Date; deprecated?: boolean } & FastifyPluginOptions
): Promise<void> {
  app.addHook('onSend', async (_request, reply, _payload) => {
    reply.header('X-API-Version', opts.version);
    if (opts.deprecated) {
      reply.header('Deprecation', `version="${opts.version}"`);
    }
    if (opts.sunsetDate) {
      reply.header('Sunset', opts.sunsetDate.toUTCString());
    }
    return _payload;
  });
}

/** Attach a /api/versions discovery route to a service. */
export function addVersionsRoute(app: FastifyInstance, versions: VersionInfo[]): void {
  app.get('/api/versions', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return {
      success: true,
      data: {
        current: versions.find((v) => v.status === 'active')?.version ?? 'v1',
        versions,
      },
    };
  });
}
