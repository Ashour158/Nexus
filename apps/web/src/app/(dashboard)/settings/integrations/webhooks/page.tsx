'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  KeyRound,
  Pencil,
  Plug,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { useAuthStore } from '@/stores/auth.store';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useRotateWebhookSecret,
  useConnectorCatalog,
  type WebhookSubscription,
} from '@/hooks/use-integrations';
import { SecretReveal } from './secret-reveal';
import { DeliveryLog } from './delivery-log';

/**
 * Webhooks management — list subscriptions, create (with one-time signing
 * secret reveal), edit (toggle active / url / events), delete, rotate secret,
 * and per-subscription delivery log with replay. Wired to integration-service
 * via `use-integrations`. Mutating actions gated on `integrations:manage`.
 */

/** Fallback event catalog if no connector advertises `supportedEvents`. */
const FALLBACK_EVENTS = [
  'lead.created',
  'lead.updated',
  'deal.created',
  'deal.updated',
  'deal.won',
  'deal.lost',
  'contact.created',
  'contact.updated',
  'quote.created',
  'quote.sent',
  'invoice.paid',
];

function useEventOptions(): MultiSelectOption[] {
  const catalog = useConnectorCatalog();
  return useMemo(() => {
    const fromCatalog = new Set<string>();
    (catalog.data ?? []).forEach((c) =>
      (c.supportedEvents ?? []).forEach((e) => fromCatalog.add(e))
    );
    const events = fromCatalog.size > 0 ? [...fromCatalog] : FALLBACK_EVENTS;
    return events.sort().map((e) => ({ id: e, label: e }));
  }, [catalog.data]);
}

interface FormState {
  name: string;
  targetUrl: string;
  events: string[];
}

const EMPTY_FORM: FormState = { name: '', targetUrl: '', events: [] };

function WebhookFormDialog({
  mode,
  initial,
  eventOptions,
  saving,
  onSubmit,
  onClose,
}: {
  mode: 'create' | 'edit';
  initial: FormState;
  eventOptions: MultiSelectOption[];
  saving: boolean;
  onSubmit: (form: FormState) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const valid =
    form.name.trim().length > 0 &&
    /^https?:\/\/.+/.test(form.targetUrl.trim()) &&
    form.events.length > 0;

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create webhook' : 'Edit webhook'}
          </DialogTitle>
          <DialogDescription>
            Send signed event notifications to an external endpoint.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">
              Name
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Billing sync"
              className="h-9 w-full rounded-md border border-outline-variant px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">
              Target URL
            </label>
            <input
              value={form.targetUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, targetUrl: e.target.value }))
              }
              placeholder="https://example.com/webhooks/nexus"
              className="h-9 w-full rounded-md border border-outline-variant px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {form.targetUrl && !/^https?:\/\/.+/.test(form.targetUrl.trim()) ? (
              <p className="mt-1 text-xs text-error">
                Enter a valid http(s) URL.
              </p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">
              Events
            </label>
            <MultiSelect
              value={form.events}
              onChange={(events) => setForm((f) => ({ ...f, events }))}
              options={eventOptions}
              placeholder="Select events to subscribe to…"
            />
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || saving}
            isLoading={saving}
            onClick={() => onSubmit(form)}
          >
            {mode === 'create' ? 'Create webhook' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  destructive,
  loading,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            isLoading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebhookRow({
  webhook,
  canManage,
  onEdit,
  onRotate,
  onDelete,
}: {
  webhook: WebhookSubscription;
  canManage: boolean;
  onEdit: () => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const update = useUpdateWebhook();

  return (
    <div
      className="rounded-xl border"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-on-surface-variant" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                {webhook.name}
              </p>
              <StatusBadge
                status={webhook.isActive ? 'Active' : 'Inactive'}
                variant={webhook.isActive ? 'success' : 'neutral'}
              />
              {typeof webhook.version === 'number' ? (
                <span className="text-[10px] text-on-surface-variant">v{webhook.version}</span>
              ) : null}
            </div>
            <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
              {webhook.targetUrl}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {webhook.events.slice(0, 6).map((e) => (
                <span
                  key={e}
                  className="rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] text-on-surface-variant"
                >
                  {e}
                </span>
              ))}
              {webhook.events.length > 6 ? (
                <span className="text-[10px] text-on-surface-variant">
                  +{webhook.events.length - 6} more
                </span>
              ) : null}
            </div>
          </div>
        </button>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <label className="mr-1 flex cursor-pointer items-center gap-1.5 text-xs text-on-surface-variant">
              <input
                type="checkbox"
                checked={webhook.isActive}
                disabled={update.isPending}
                onChange={(e) =>
                  update.mutate({ id: webhook.id, isActive: e.target.checked })
                }
              />
              Active
            </label>
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRotate}
              aria-label="Rotate secret"
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-error hover:bg-error-container"
              onClick={onDelete}
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <DeliveryLog subscriptionId={webhook.id} canManage={canManage} />
      ) : null}
    </div>
  );
}

export default function WebhooksPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('integrations:manage');

  const webhooks = useWebhooks();
  const eventOptions = useEventOptions();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();
  const del = useDeleteWebhook();
  const rotate = useRotateWebhookSecret();

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<WebhookSubscription | null>(null);
  const [deleting, setDeleting] = useState<WebhookSubscription | null>(null);
  const [rotating, setRotating] = useState<WebhookSubscription | null>(null);
  // Secret shown once after create or rotate.
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const rows = webhooks.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Webhooks
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Deliver signed event notifications to your external endpoints.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings/integrations">
            <Button variant="secondary" size="sm">
              <Plug className="h-4 w-4" />
              Integration Hub
            </Button>
          </Link>
          {canManage ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New webhook
            </Button>
          ) : null}
        </div>
      </header>

      {/* One-time secret banner after create / rotate */}
      {revealedSecret ? (
        <div className="space-y-2">
          <SecretReveal secret={revealedSecret} />
          <div className="text-right">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRevealedSecret(null)}
            >
              I&apos;ve saved it — dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {webhooks.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : webhooks.isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load webhooks"
          description="The integration service didn't respond."
          cta={{ label: 'Retry', onClick: () => webhooks.refetch() }}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🪝"
          title="No webhooks yet"
          description="Create a webhook to start receiving signed event notifications at your endpoint."
          cta={
            canManage
              ? { label: 'New webhook', onClick: () => setShowCreate(true) }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((webhook) => (
            <WebhookRow
              key={webhook.id}
              webhook={webhook}
              canManage={canManage}
              onEdit={() => setEditing(webhook)}
              onRotate={() => setRotating(webhook)}
              onDelete={() => setDeleting(webhook)}
            />
          ))}
        </div>
      )}

      {/* Create */}
      {showCreate ? (
        <WebhookFormDialog
          mode="create"
          initial={EMPTY_FORM}
          eventOptions={eventOptions}
          saving={create.isPending}
          onClose={() => setShowCreate(false)}
          onSubmit={(form) =>
            create.mutate(form, {
              onSuccess: (result) => {
                setShowCreate(false);
                if (result?.signingSecret) setRevealedSecret(result.signingSecret);
              },
            })
          }
        />
      ) : null}

      {/* Edit */}
      {editing ? (
        <WebhookFormDialog
          mode="edit"
          initial={{
            name: editing.name,
            targetUrl: editing.targetUrl,
            events: editing.events,
          }}
          eventOptions={eventOptions}
          saving={update.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(form) =>
            update.mutate(
              { id: editing.id, ...form },
              { onSuccess: () => setEditing(null) }
            )
          }
        />
      ) : null}

      {/* Delete */}
      {deleting ? (
        <ConfirmDialog
          title="Delete webhook"
          description={`Delete "${deleting.name}"? This stops all deliveries to ${deleting.targetUrl} and cannot be undone.`}
          confirmLabel="Delete"
          destructive
          loading={del.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
          }
        />
      ) : null}

      {/* Rotate secret */}
      {rotating ? (
        <ConfirmDialog
          title="Rotate signing secret"
          description={`Generate a new signing secret for "${rotating.name}"? The current secret stops working immediately — update your endpoint with the new one.`}
          confirmLabel="Rotate secret"
          loading={rotate.isPending}
          onClose={() => setRotating(null)}
          onConfirm={() =>
            rotate.mutate(rotating.id, {
              onSuccess: (result) => {
                setRotating(null);
                if (result?.signingSecret) setRevealedSecret(result.signingSecret);
              },
            })
          }
        />
      ) : null}
    </div>
  );
}
