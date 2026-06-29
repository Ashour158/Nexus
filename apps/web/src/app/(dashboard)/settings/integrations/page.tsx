'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface IntegrationCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
  href: string;
  category: 'Communication' | 'Productivity' | 'Finance' | 'Compliance';
}

const INTEGRATIONS: IntegrationCard[] = [
  { id: 'slack', name: 'Slack', description: 'Get deal alerts in your channels', icon: '💬', connected: false, href: '/settings/integrations/slack', category: 'Communication' },
  { id: 'teams', name: 'Microsoft Teams', description: 'Notifications and deal updates', icon: '🔵', connected: false, href: '/settings/integrations/teams', category: 'Communication' },
  { id: 'google', name: 'Google Workspace', description: 'Email and calendar sync', icon: '🔴', connected: false, href: '#', category: 'Productivity' },
  { id: 'outlook', name: 'Microsoft 365', description: 'Email and calendar sync', icon: '📨', connected: false, href: '#', category: 'Productivity' },
  { id: 'zatca', name: 'ZATCA', description: 'Saudi e-invoicing compliance', icon: '🇸🇦', connected: false, href: '/settings/integrations/zatca', category: 'Compliance' },
  { id: 'docusign', name: 'DocuSign', description: 'Send contracts for e-signature', icon: '📝', connected: false, href: '#', category: 'Productivity' },
  { id: 'zapier', name: 'Zapier', description: 'Connect to 5,000+ apps', icon: '⚡', connected: false, href: '#', category: 'Productivity' },
];

type OAuthConnection = { id: string; provider: string; scope?: string; connectedAt?: string };

export default function IntegrationsHubPage() {
  const connections = useQuery({
    queryKey: ['oauth-connections'],
    queryFn: () => apiClients.integration.get<OAuthConnection[]>('/integrations/oauth/connections'),
  });

  const connectedProviders = useMemo(
    () => new Set((connections.data ?? []).map((c) => c.provider)),
    [connections.data]
  );

  const cards = useMemo(
    () =>
      INTEGRATIONS.map((i) => ({
        ...i,
        connected: connectedProviders.has(i.id) || i.connected,
      })),
    [connectedProviders]
  );

  const categories = Array.from(new Set(cards.map((c) => c.category)));

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Integration Hub</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Connect NEXUS to the tools your team already uses.
        </p>
      </div>

      {connections.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        categories.map((category) => (
          <section key={category}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {category}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards
                .filter((c) => c.category === category)
                .map((card) => (
                  <div
                    key={card.id}
                    className="flex items-start justify-between rounded-xl border p-4 transition hover:shadow-sm"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-color)' }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{card.icon}</span>
                      <div>
                        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{card.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{card.description}</p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {card.connected ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                          Connected
                        </span>
                      ) : (
                        <Link
                          href={card.href}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark transition"
                          style={{ backgroundColor: '#4F6CF7' }}
                        >
                          Connect
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))
      )}

      {!connections.isLoading && cards.every((c) => !c.connected) && (
        <EmptyState
          icon="🔌"
          title="No integrations connected"
          description="Connect your first integration to start syncing data between NEXUS and your favorite tools."
        />
      )}
    </div>
  );
}
