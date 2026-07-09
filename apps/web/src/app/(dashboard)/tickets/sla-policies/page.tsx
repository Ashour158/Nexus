'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/hooks/use-confirm';
import { useAuthStore } from '@/stores/auth.store';
import {
  useSlaPolicies,
  useCreateSlaPolicy,
  useUpdateSlaPolicy,
  useDeleteSlaPolicy,
  TICKET_PRIORITIES,
  type SlaPolicy,
  type TicketPriority,
  type CreateSlaPolicyInput,
} from '@/hooks/use-tickets';

const fieldClass = 'h-9 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus:border-primary';
const fieldStyle = { borderColor: 'var(--border-color)', color: 'var(--text-primary)' } as const;
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--text-muted)' } as const;

function formatMins(mins: number): string {
  if (mins % 1440 === 0) return `${mins / 1440}d`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}

export default function SlaPoliciesPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isDevPreview =
    process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== 'false';
  const canManage = isDevPreview || hasPermission('tickets:update') || hasPermission('tickets:*');
  const canDelete = isDevPreview || hasPermission('tickets:delete') || hasPermission('tickets:*');

  const { confirm, ConfirmDialog } = useConfirm();
  const policiesQuery = useSlaPolicies();
  const deletePolicy = useDeleteSlaPolicy();

  const [editing, setEditing] = useState<SlaPolicy | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const policies = policiesQuery.data ?? [];

  if (!canManage) {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <EmptyState
          icon="🔒"
          title="Admins only"
          description="You do not have permission to manage SLA policies."
          cta={{ label: 'Back to tickets', href: '/tickets' }}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <Link
        href="/tickets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm hover:underline"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="h-4 w-4" /> Tickets
      </Link>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            SLA policies
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Define first-response and resolution targets applied to new tickets by priority.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          New policy
        </Button>
      </header>

      {policiesQuery.isError ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          Failed to load SLA policies.
        </div>
      ) : null}

      <DataTable
        data={policies}
        keyExtractor={(row) => row.id}
        loading={policiesQuery.isLoading}
        columns={[
          {
            key: 'name',
            header: 'Name',
            cell: (row) => (
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {row.name}
                {row.isDefault ? (
                  <span className="ms-2 rounded-full bg-primary-light px-2 py-0.5 text-xs text-primary">Default</span>
                ) : null}
              </span>
            ),
          },
          {
            key: 'priority',
            header: 'Priority',
            cell: (row) => (
              <span style={{ color: 'var(--text-secondary)' }}>{row.priority ?? 'Any'}</span>
            ),
          },
          {
            key: 'firstResponseMins',
            header: 'First response',
            cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{formatMins(row.firstResponseMins)}</span>,
          },
          {
            key: 'resolutionMins',
            header: 'Resolution',
            cell: (row) => <span style={{ color: 'var(--text-secondary)' }}>{formatMins(row.resolutionMins)}</span>,
          },
          {
            key: 'active',
            header: 'Active',
            align: 'center',
            cell: (row) => (
              <span
                className={
                  row.active
                    ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                    : 'rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800/50'
                }
              >
                {row.active ? 'Active' : 'Inactive'}
              </span>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (row) => (
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(row);
                    setFormOpen(true);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label="Edit policy"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (await confirm(`Delete SLA policy "${row.name}"?`, 'Delete policy')) {
                        deletePolicy.mutate(row.id);
                      }
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    aria-label="Delete policy"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icon="⏱️"
            title="No SLA policies yet"
            description="Create a policy to start enforcing response and resolution targets."
            cta={{
              label: 'New policy',
              onClick: () => {
                setEditing(null);
                setFormOpen(true);
              },
            }}
          />
        }
      />

      {formOpen ? (
        <SlaPolicyForm
          policy={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      ) : null}

      {ConfirmDialog}
    </main>
  );
}

function SlaPolicyForm({ policy, onClose }: { policy: SlaPolicy | null; onClose: () => void }) {
  const createPolicy = useCreateSlaPolicy();
  const updatePolicy = useUpdateSlaPolicy();
  const isEdit = Boolean(policy);

  const [name, setName] = useState(policy?.name ?? '');
  const [priority, setPriority] = useState<'' | TicketPriority>(policy?.priority ?? '');
  const [firstResponseMins, setFirstResponseMins] = useState(String(policy?.firstResponseMins ?? 60));
  const [resolutionMins, setResolutionMins] = useState(String(policy?.resolutionMins ?? 480));
  const [businessHoursOnly, setBusinessHoursOnly] = useState(policy?.businessHoursOnly ?? false);
  const [isDefault, setIsDefault] = useState(policy?.isDefault ?? false);
  const [active, setActive] = useState(policy?.active ?? true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const fr = Number(firstResponseMins);
    const res = Number(resolutionMins);
    if (!name.trim() || !Number.isFinite(fr) || fr <= 0 || !Number.isFinite(res) || res <= 0) return;

    const payload: CreateSlaPolicyInput = {
      name: name.trim(),
      priority: priority || null,
      firstResponseMins: fr,
      resolutionMins: res,
      businessHoursOnly,
      isDefault,
      active,
    };

    if (isEdit && policy) {
      updatePolicy.mutate({ id: policy.id, data: payload }, { onSuccess: onClose });
    } else {
      createPolicy.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit SLA policy' : 'New SLA policy'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="sla-name">
            Name <span className="text-rose-500">*</span>
          </label>
          <input
            id="sla-name"
            className={fieldClass}
            style={fieldStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Urgent — 1h / 4h"
            required
            autoFocus
          />
        </div>

        <div>
          <label className={labelClass} style={labelStyle} htmlFor="sla-priority">
            Applies to priority
          </label>
          <select
            id="sla-priority"
            className={fieldClass}
            style={fieldStyle}
            value={priority}
            onChange={(e) => setPriority(e.target.value as '' | TicketPriority)}
          >
            <option value="">Any priority (fallback)</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} style={labelStyle} htmlFor="sla-fr">
              First response (mins) <span className="text-rose-500">*</span>
            </label>
            <input
              id="sla-fr"
              type="number"
              min={1}
              className={fieldClass}
              style={fieldStyle}
              value={firstResponseMins}
              onChange={(e) => setFirstResponseMins(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle} htmlFor="sla-res">
              Resolution (mins) <span className="text-rose-500">*</span>
            </label>
            <input
              id="sla-res"
              type="number"
              min={1}
              className={fieldClass}
              style={fieldStyle}
              value={resolutionMins}
              onChange={(e) => setResolutionMins(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={businessHoursOnly}
              onChange={(e) => setBusinessHoursOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Business hours only
          </label>
          <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Default policy (used when no priority-specific policy matches)
          </label>
          <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Active
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={createPolicy.isPending || updatePolicy.isPending} disabled={!name.trim()}>
            {isEdit ? 'Save changes' : 'Create policy'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
