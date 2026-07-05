import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

/**
 * React Query hooks for integration-service (reached via `apiClients.integration`,
 * base `NEXT_PUBLIC_INTEGRATION_URL` → http://localhost:3012/api/v1).
 *
 * Covers the connector catalog, OAuth connections, sync jobs, and the webhook
 * subscription lifecycle (CRUD + delivery log + replay + secret rotation).
 * All responses arrive through the `{ success, data }` envelope which the
 * typed client already unwraps.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectorAuthType = 'oauth' | 'apikey' | 'none';
export type ConnectorStatus = 'available' | 'beta' | 'planned';

export interface CatalogConnector {
  id: string;
  name: string;
  description: string;
  category: string;
  authType: ConnectorAuthType;
  provider: string;
  oauthProvider?: string;
  scopes?: string[];
  supportedEvents?: string[];
  docsUrl?: string;
  status: ConnectorStatus;
  connected: boolean;
}

export interface OAuthConnection {
  id: string;
  provider: string;
  email?: string;
  scope?: string;
  scopes?: string[];
  expiresAt?: string | null;
  lastSyncAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
  connectedAt?: string;
}

export type SyncJobType =
  | 'contacts_import'
  | 'deals_import'
  | 'contacts_export'
  | string;
export type SyncJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface SyncJob {
  id: string;
  connectionId: string;
  jobType: SyncJobType;
  status: SyncJobStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt?: string;
}

export interface WebhookSubscription {
  id: string;
  name: string;
  targetUrl: string;
  events: string[];
  isActive: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Returned once on create / rotate — the plaintext signing secret. */
export interface WebhookWithSecret extends WebhookSubscription {
  signingSecret: string;
}

export type WebhookDeliveryStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'RETRYING'
  | string;

export interface WebhookDelivery {
  id: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  httpStatus: number | null;
  attemptCount: number;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface WebhookDeliveryDetail extends WebhookDelivery {
  payload?: unknown;
  responseBody?: string | null;
  targetUrl?: string;
}

interface Paginated<T> {
  data?: T[];
  items?: T[];
  total?: number;
}

/** Normalizes list responses that may be a bare array or a paginated envelope. */
function toArray<T>(res: T[] | Paginated<T> | undefined | null): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.data ?? res.items ?? [];
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const integrationKeys = {
  all: ['integrations'] as const,
  catalog: () => [...integrationKeys.all, 'catalog'] as const,
  connections: () => [...integrationKeys.all, 'connections'] as const,
  jobs: () => [...integrationKeys.all, 'sync-jobs'] as const,
  connectionState: (id: string) =>
    [...integrationKeys.all, 'connection-state', id] as const,
  webhooks: () => [...integrationKeys.all, 'webhooks'] as const,
  deliveries: (subscriptionId: string) =>
    [...integrationKeys.all, 'webhooks', subscriptionId, 'deliveries'] as const,
  deliveryDetail: (id: string) =>
    [...integrationKeys.all, 'webhooks', 'delivery', id] as const,
};

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export function useConnectorCatalog() {
  return useQuery<CatalogConnector[]>({
    queryKey: integrationKeys.catalog(),
    queryFn: async () => {
      const res = await apiClients.integration.get<
        CatalogConnector[] | Paginated<CatalogConnector>
      >('/integrations/catalog');
      return toArray(res);
    },
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// OAuth connections
// ---------------------------------------------------------------------------

export function useOAuthConnections() {
  return useQuery<OAuthConnection[]>({
    queryKey: integrationKeys.connections(),
    queryFn: async () => {
      const res = await apiClients.integration.get<
        OAuthConnection[] | Paginated<OAuthConnection>
      >('/integrations/oauth/connections');
      return toArray(res);
    },
    staleTime: 30_000,
  });
}

/** Full-page redirect to the provider connect endpoint (302s to the IdP). */
export function connectOAuthUrl(provider: string): string {
  const base = (
    process.env.NEXT_PUBLIC_INTEGRATION_URL ?? 'http://localhost:3012/api/v1'
  ).replace(/\/$/, '');
  return `${base}/integrations/oauth/${provider}/connect`;
}

export function useDisconnectOAuth() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (provider) =>
      apiClients.integration.delete(`/integrations/oauth/${provider}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.connections() });
      qc.invalidateQueries({ queryKey: integrationKeys.catalog() });
      notify.success('Integration disconnected');
    },
    onError: (err) => notify.error('Failed to disconnect', err.message),
  });
}

// ---------------------------------------------------------------------------
// Sync jobs
// ---------------------------------------------------------------------------

export function useSyncJobs() {
  return useQuery<SyncJob[]>({
    queryKey: integrationKeys.jobs(),
    queryFn: async () => {
      const res = await apiClients.integration.get<
        SyncJob[] | Paginated<SyncJob>
      >('/integrations/sync/jobs');
      return toArray(res);
    },
    staleTime: 15_000,
  });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation<
    SyncJob,
    Error,
    { connectionId: string; jobType: SyncJobType }
  >({
    mutationFn: (body) =>
      apiClients.integration.post<SyncJob>('/integrations/sync/jobs', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.jobs() });
      notify.success('Sync job started');
    },
    onError: (err) => notify.error('Failed to start sync', err.message),
  });
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export function useWebhooks() {
  return useQuery<WebhookSubscription[]>({
    queryKey: integrationKeys.webhooks(),
    queryFn: async () => {
      const res = await apiClients.integration.get<
        WebhookSubscription[] | Paginated<WebhookSubscription>
      >('/integrations/webhooks');
      return toArray(res);
    },
    staleTime: 30_000,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation<
    WebhookWithSecret,
    Error,
    { name: string; targetUrl: string; events: string[] }
  >({
    mutationFn: (body) =>
      apiClients.integration.post<WebhookWithSecret>(
        '/integrations/webhooks',
        body
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.webhooks() });
      notify.success('Webhook created');
    },
    onError: (err) => notify.error('Failed to create webhook', err.message),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation<
    WebhookSubscription,
    Error,
    {
      id: string;
      name?: string;
      targetUrl?: string;
      events?: string[];
      isActive?: boolean;
    }
  >({
    mutationFn: ({ id, ...patch }) =>
      apiClients.integration.patch<WebhookSubscription>(
        `/integrations/webhooks/${id}`,
        patch
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.webhooks() });
      notify.success('Webhook updated');
    },
    onError: (err) => notify.error('Failed to update webhook', err.message),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) =>
      apiClients.integration.delete(`/integrations/webhooks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.webhooks() });
      notify.success('Webhook deleted');
    },
    onError: (err) => notify.error('Failed to delete webhook', err.message),
  });
}

export function useRotateWebhookSecret() {
  const qc = useQueryClient();
  return useMutation<{ signingSecret: string }, Error, string>({
    mutationFn: (id) =>
      apiClients.integration.post<{ signingSecret: string }>(
        `/integrations/webhooks/${id}/rotate-secret`
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.webhooks() });
      notify.success('Signing secret rotated');
    },
    onError: (err) => notify.error('Failed to rotate secret', err.message),
  });
}

// ---------------------------------------------------------------------------
// Webhook deliveries
// ---------------------------------------------------------------------------

export function useWebhookDeliveries(
  subscriptionId: string | null,
  enabled = true
) {
  return useQuery<WebhookDelivery[]>({
    queryKey: integrationKeys.deliveries(subscriptionId ?? ''),
    enabled: Boolean(subscriptionId) && enabled,
    queryFn: async () => {
      const res = await apiClients.integration.get<
        WebhookDelivery[] | Paginated<WebhookDelivery>
      >(`/integrations/webhooks/${subscriptionId}/deliveries`, {
        params: { limit: 50 },
      });
      return toArray(res);
    },
    staleTime: 10_000,
  });
}

export function useWebhookDeliveryDetail(id: string | null) {
  return useQuery<WebhookDeliveryDetail>({
    queryKey: integrationKeys.deliveryDetail(id ?? ''),
    enabled: Boolean(id),
    queryFn: () =>
      apiClients.integration.get<WebhookDeliveryDetail>(
        `/integrations/webhooks/deliveries/${id}`
      ),
  });
}

export function useReplayDelivery(subscriptionId: string | null) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (deliveryId) =>
      apiClients.integration.post(
        `/integrations/webhooks/deliveries/${deliveryId}/replay`
      ),
    onSuccess: () => {
      if (subscriptionId) {
        qc.invalidateQueries({
          queryKey: integrationKeys.deliveries(subscriptionId),
        });
      }
      notify.success('Delivery replay queued');
    },
    onError: (err) => notify.error('Failed to replay delivery', err.message),
  });
}
