import type { IntegrationPrisma } from '../prisma.js';
import { CONNECTOR_CATALOG, type ConnectorCatalogEntry } from '../lib/connector-catalog.js';
import { alsStore } from '../request-context.js';

export interface CatalogConnector extends ConnectorCatalogEntry {
  /** True if the caller's tenant/user has a live OAuthConnection for this connector's provider. */
  connected: boolean;
}

export function createCatalogService(prisma: IntegrationPrisma) {
  return {
    /**
     * Serve the static connector catalog, annotated with a per-tenant/user
     * `connected` flag derived from live OAuthConnection rows. The prisma
     * extension auto-scopes the query to the current tenant; we additionally
     * scope to the current user so the flag reflects the caller's own connections.
     */
    async listCatalog(): Promise<CatalogConnector[]> {
      const userId = alsStore.get('userId') as string | undefined;
      const connections = await prisma.oAuthConnection.findMany({
        where: userId ? { userId } : {},
        select: { provider: true },
      });
      const connectedProviders = new Set(connections.map((c) => c.provider));
      return CONNECTOR_CATALOG.map((entry) => ({
        ...entry,
        // Only OAuth connectors can be "connected"; others are always false until wired.
        connected: entry.authType === 'oauth' && connectedProviders.has(entry.provider),
      }));
    },
  };
}
