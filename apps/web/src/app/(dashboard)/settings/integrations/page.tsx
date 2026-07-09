'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Plug, Webhook } from 'lucide-react';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import {
  useConnectorCatalog,
  useDisconnectOAuth,
  connectOAuthUrl,
  type CatalogConnector,
  type ConnectorStatus,
} from '@/hooks/use-integrations';

/**
 * Integration Hub — dynamically rendered from `GET /integrations/catalog`.
 *
 * Each connector card reflects live `connected` state. OAuth connectors connect
 * via a full-page redirect to the provider connect endpoint (which 302s to the
 * IdP) and disconnect via `DELETE /integrations/oauth/:provider`. `planned`
 * connectors are disabled ("Coming soon"). The real Slack / Teams / ZATCA
 * subpages remain reachable via their manage links.
 */

const STATUS_VARIANT: Record<ConnectorStatus, StatusVariant> = {
  available: 'success',
  beta: 'warning',
  planned: 'neutral',
};

const STATUS_LABEL: Record<ConnectorStatus, string> = {
  available: 'Available',
  beta: 'Beta',
  planned: 'Coming soon',
};

/** Connectors that have a dedicated managed subpage. */
const MANAGE_SUBPAGES: Record<string, string> = {
  slack: '/settings/integrations/slack',
  teams: '/settings/integrations/teams',
  zatca: '/settings/integrations/zatca',
};

function connectorInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function ConnectorCard({
  connector,
  canManage,
}: {
  connector: CatalogConnector;
  canManage: boolean;
}) {
  const disconnect = useDisconnectOAuth();
  const managePath =
    MANAGE_SUBPAGES[connector.id] ?? MANAGE_SUBPAGES[connector.provider];
  const isPlanned = connector.status === 'planned';

  const handleConnect = () => {
    const provider = connector.oauthProvider ?? connector.provider;
    window.location.href = connectOAuthUrl(provider);
  };

  return (
    <div
      className="flex flex-col justify-between rounded-xl border p-4 transition hover:shadow-sm"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
            style={{ backgroundColor: '#eef6ff', color: '#005baf' }}
            aria-hidden="true"
          >
            {connectorInitial(connector.name)}
          </span>
          <div>
            <p
              className="font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {connector.name}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {connector.description}
            </p>
          </div>
        </div>
        <StatusBadge
          status={STATUS_LABEL[connector.status]}
          variant={STATUS_VARIANT[connector.status]}
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: 'var(--muted, #f1f5f9)', color: 'var(--text-muted)' }}
        >
          {connector.category}
        </span>

        <div className="flex items-center gap-2">
          {connector.docsUrl ? (
            <a
              href={connector.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-[#005baf] hover:underline"
            >
              Docs
            </a>
          ) : null}

          {isPlanned ? (
            <Button size="sm" variant="secondary" disabled>
              Coming soon
            </Button>
          ) : connector.connected ? (
            <div className="flex items-center gap-2">
              {managePath ? (
                <Link
                  href={managePath}
                  className="text-xs font-medium text-[#005baf] hover:underline"
                >
                  Manage
                </Link>
              ) : null}
              {canManage && connector.authType === 'oauth' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  isLoading={disconnect.isPending}
                  onClick={() =>
                    disconnect.mutate(
                      connector.oauthProvider ?? connector.provider
                    )
                  }
                >
                  Disconnect
                </Button>
              ) : (
                <StatusBadge status="Connected" variant="success" />
              )}
            </div>
          ) : connector.authType === 'oauth' ? (
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={!canManage}
              title={canManage ? undefined : 'Requires integrations:manage'}
            >
              Connect
            </Button>
          ) : managePath ? (
            <Link href={managePath}>
              <Button size="sm" disabled={!canManage}>
                Set up
              </Button>
            </Link>
          ) : (
            <Button size="sm" variant="secondary" disabled>
              Configure
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsHubPage() {
  const catalog = useConnectorCatalog();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('integrations:manage');

  const connectors = useMemo(() => catalog.data ?? [], [catalog.data]);
  const categories = useMemo(
    () => Array.from(new Set(connectors.map((c) => c.category))),
    [connectors]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            Integration Hub
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Connect NEXUS to the tools your team already uses.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/integrations">
            <Button variant="secondary" size="sm">
              <Plug className="h-4 w-4" />
              Connections &amp; Sync
            </Button>
          </Link>
          <Link href="/settings/integrations/webhooks">
            <Button variant="secondary" size="sm">
              <Webhook className="h-4 w-4" />
              Webhooks
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {catalog.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : catalog.isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load the connector catalog"
          description="The integration service didn't respond. Check your connection and try again."
          cta={{ label: 'Retry', onClick: () => catalog.refetch() }}
        />
      ) : connectors.length === 0 ? (
        <EmptyState
          icon="🔌"
          title="No connectors available"
          description="No integration connectors are configured for your workspace yet."
        />
      ) : (
        categories.map((category) => (
          <section key={category}>
            <h2
              className="mb-3 text-sm font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              {category}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {connectors
                .filter((c) => c.category === category)
                .map((connector) => (
                  <ConnectorCard
                    key={connector.id}
                    connector={connector}
                    canManage={canManage}
                  />
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
