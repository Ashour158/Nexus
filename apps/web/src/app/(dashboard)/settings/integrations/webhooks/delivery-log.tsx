'use client';

import { useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/format';
import {
  useWebhookDeliveries,
  useWebhookDeliveryDetail,
  useReplayDelivery,
  type WebhookDeliveryStatus,
} from '@/hooks/use-integrations';

function deliveryVariant(status: WebhookDeliveryStatus): StatusVariant {
  const s = status.toUpperCase();
  if (s === 'SUCCESS' || s === 'DELIVERED') return 'success';
  if (s === 'FAILED') return 'danger';
  if (s === 'RETRYING') return 'warning';
  if (s === 'PENDING') return 'info';
  return 'neutral';
}

function isFailed(status: WebhookDeliveryStatus): boolean {
  const s = status.toUpperCase();
  return s === 'FAILED' || s === 'RETRYING';
}

function DeliveryDetailDialog({
  deliveryId,
  onClose,
}: {
  deliveryId: string;
  onClose: () => void;
}) {
  const detail = useWebhookDeliveryDetail(deliveryId);

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delivery detail</DialogTitle>
          <DialogDescription>
            Request payload and provider response for this delivery attempt.
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : detail.isError || !detail.data ? (
          <EmptyState icon="⚠️" compact title="Couldn't load delivery detail" />
        ) : (
          <div className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-on-surface-variant">Event</span>
                <p className="font-medium">{detail.data.eventType}</p>
              </div>
              <div>
                <span className="text-on-surface-variant">HTTP status</span>
                <p className="font-medium">{detail.data.httpStatus ?? '—'}</p>
              </div>
              <div>
                <span className="text-on-surface-variant">Attempts</span>
                <p className="font-medium">{detail.data.attemptCount}</p>
              </div>
              <div>
                <span className="text-on-surface-variant">Delivered</span>
                <p className="font-medium">
                  {detail.data.deliveredAt
                    ? formatDateTime(detail.data.deliveredAt)
                    : '—'}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-on-surface-variant">Payload</p>
              <pre className="max-h-52 overflow-auto rounded-md border border-outline-variant bg-surface-container-low p-3 text-xs">
                {JSON.stringify(detail.data.payload ?? {}, null, 2)}
              </pre>
            </div>

            {detail.data.responseBody != null ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-on-surface-variant">
                  Response body
                </p>
                <pre className="max-h-52 overflow-auto rounded-md border border-outline-variant bg-surface-container-low p-3 text-xs">
                  {detail.data.responseBody}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeliveryLog({
  subscriptionId,
  canManage,
}: {
  subscriptionId: string;
  canManage: boolean;
}) {
  const deliveries = useWebhookDeliveries(subscriptionId);
  const replay = useReplayDelivery(subscriptionId);
  const [detailId, setDetailId] = useState<string | null>(null);

  const rows = deliveries.data ?? [];

  return (
    <div className="border-t border-outline-variant bg-surface-container-low/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Delivery log
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => deliveries.refetch()}
          aria-label="Refresh deliveries"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {deliveries.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : deliveries.isError ? (
        <EmptyState
          icon="⚠️"
          compact
          title="Couldn't load deliveries"
          cta={{ label: 'Retry', onClick: () => deliveries.refetch() }}
        />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-on-surface-variant">
          No deliveries recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left uppercase text-on-surface-variant">
              <tr>
                <th className="px-2 py-1.5">Event</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">HTTP</th>
                <th className="px-2 py-1.5">Attempts</th>
                <th className="px-2 py-1.5">Next retry</th>
                <th className="px-2 py-1.5">Created</th>
                <th className="px-2 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="px-2 py-1.5 font-medium text-on-surface">
                    {d.eventType}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={d.status} variant={deliveryVariant(d.status)} />
                  </td>
                  <td className="px-2 py-1.5">{d.httpStatus ?? '—'}</td>
                  <td className="px-2 py-1.5">{d.attemptCount}</td>
                  <td className="px-2 py-1.5">
                    {d.nextRetryAt ? formatDateTime(d.nextRetryAt) : '—'}
                  </td>
                  <td className="px-2 py-1.5">{formatDateTime(d.createdAt)}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailId(d.id)}
                      >
                        View
                      </Button>
                      {canManage && isFailed(d.status) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          isLoading={replay.isPending && replay.variables === d.id}
                          onClick={() => replay.mutate(d.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Retry
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailId ? (
        <DeliveryDetailDialog
          deliveryId={detailId}
          onClose={() => setDetailId(null)}
        />
      ) : null}
    </div>
  );
}
