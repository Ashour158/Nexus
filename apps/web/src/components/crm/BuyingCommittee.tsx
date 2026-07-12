'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Plus, Trash2, X, Users, Crown, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';
import { useContacts } from '@/hooks/use-contacts';
import {
  useRelatedContacts,
  useCreateRelatedContact,
  useUpdateRelatedContact,
  useDeleteRelatedContact,
  type RelatedContact,
} from '@/hooks/use-account-relations';

const ROLES = [
  'Champion',
  'EconomicBuyer',
  'DecisionMaker',
  'Influencer',
  'TechnicalBuyer',
  'User',
  'Blocker',
  'Coach',
  'Stakeholder',
];
const SENTIMENTS = ['Positive', 'Neutral', 'Negative', 'Unknown'];

const ROLE_COLORS: Record<string, string> = {
  Champion: 'bg-success-container text-success',
  EconomicBuyer: 'bg-primary-container text-primary',
  DecisionMaker: 'bg-primary-container text-primary',
  Influencer: 'bg-tertiary-container text-tertiary',
  TechnicalBuyer: 'bg-info-container text-info',
  User: 'bg-surface-container-high text-on-surface-variant',
  Blocker: 'bg-error-container text-error',
  Coach: 'bg-warning-container text-warning',
  Stakeholder: 'bg-surface-container-high text-on-surface-variant',
};

const SENTIMENT_TONE: Record<string, string> = {
  Positive: 'bg-success-container text-success',
  Neutral: 'bg-surface-container-high text-on-surface-variant',
  Negative: 'bg-error-container text-error',
  Unknown: 'bg-surface-container-high text-on-surface-variant',
};

export function BuyingCommittee({
  accountId,
  canUpdate,
}: {
  accountId: string;
  canUpdate: boolean;
}) {
  const relatedQuery = useRelatedContacts(accountId);
  const createRelation = useCreateRelatedContact(accountId);
  const updateRelation = useUpdateRelatedContact(accountId);
  const deleteRelation = useDeleteRelatedContact(accountId);
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState<'table' | 'org'>('table');

  const relations = relatedQuery.data ?? [];

  if (relatedQuery.isLoading) return <Skeleton className="h-48" />;
  if (relatedQuery.isError) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning-container p-4 text-sm text-on-warning-container">
        The buying committee could not be loaded right now.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-on-surface">
            <Users className="h-4 w-4 text-primary" />
            Buying committee ({relations.length})
          </h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Every contact influencing this account, with role, influence, sentiment, and reporting lines.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-outline-variant p-0.5">
            <button
              type="button"
              onClick={() => setView('table')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                view === 'table' ? 'bg-primary-container text-primary' : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              Table
            </button>
            <button
              type="button"
              onClick={() => setView('org')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition',
                view === 'org' ? 'bg-primary-container text-primary' : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              <Network className="h-3.5 w-3.5" />
              Org chart
            </button>
          </div>
          {canUpdate ? (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Add related contact
            </Button>
          ) : null}
        </div>
      </div>

      {relations.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No related contacts"
          description="Map the buying committee by adding the contacts who influence this account."
        />
      ) : view === 'table' ? (
        <RelationsTable
          relations={relations}
          canUpdate={canUpdate}
          onUpdate={(relationId, data) => updateRelation.mutate({ relationId, data })}
          onDelete={(relationId) => deleteRelation.mutate(relationId)}
          isDeleting={deleteRelation.isPending}
        />
      ) : (
        <RelationsOrgChart relations={relations} />
      )}

      {showAdd ? (
        <AddRelatedContactModal
          existing={relations}
          isSaving={createRelation.isPending}
          onClose={() => setShowAdd(false)}
          onSave={(data) =>
            createRelation.mutate(data, { onSuccess: () => setShowAdd(false) })
          }
        />
      ) : null}
    </div>
  );
}

function fullName(r: RelatedContact) {
  return `${r.contact.firstName} ${r.contact.lastName}`.trim();
}

function RelationsTable({
  relations,
  canUpdate,
  onUpdate,
  onDelete,
  isDeleting,
}: {
  relations: RelatedContact[];
  canUpdate: boolean;
  onUpdate: (relationId: string, data: { sentiment?: string; influence?: number }) => void;
  onDelete: (relationId: string) => void;
  isDeleting: boolean;
}) {
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of relations) map.set(r.contactId, fullName(r));
    return map;
  }, [relations]);

  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant">
      <table className="min-w-full divide-y divide-outline-variant text-sm">
        <thead className="bg-surface-container-low">
          <tr className="text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <th className="px-4 py-3">Contact</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Influence</th>
            <th className="px-4 py-3">Sentiment</th>
            <th className="px-4 py-3">Reports to</th>
            {canUpdate ? <th className="px-4 py-3" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant bg-surface">
          {relations.map((r) => (
            <tr key={r.id} className="hover:bg-surface-container-low/60">
              <td className="px-4 py-3">
                <Link
                  href={`/contacts/${r.contactId}`}
                  className="font-semibold text-on-surface hover:text-primary hover:underline"
                >
                  {fullName(r)}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-on-surface-variant">{r.contact.jobTitle ?? 'Stakeholder'}</span>
                  {r.isChampion ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-success-container px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">
                      <Crown className="h-3 w-3" /> Champion
                    </span>
                  ) : null}
                  {r.isPrimary ? (
                    <span className="rounded-full bg-primary-container px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      Primary
                    </span>
                  ) : null}
                  {!r.isDirect ? (
                    <span className="rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      Indirect
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    ROLE_COLORS[r.role] ?? 'bg-surface-container-high text-on-surface-variant'
                  )}
                >
                  {r.role}
                </span>
              </td>
              <td className="px-4 py-3">
                {canUpdate ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      defaultValue={r.influence ?? 0}
                      onMouseUp={(e) =>
                        onUpdate(r.id, { influence: Number((e.target as HTMLInputElement).value) })
                      }
                      onTouchEnd={(e) =>
                        onUpdate(r.id, { influence: Number((e.target as HTMLInputElement).value) })
                      }
                      className="w-24 accent-primary"
                    />
                    <span className="w-9 text-xs font-semibold text-on-surface">{r.influence ?? 0}%</span>
                  </div>
                ) : (
                  <span className="text-on-surface">{r.influence ?? 0}%</span>
                )}
              </td>
              <td className="px-4 py-3">
                {canUpdate ? (
                  <select
                    value={r.sentiment ?? 'Unknown'}
                    onChange={(e) => onUpdate(r.id, { sentiment: e.target.value })}
                    className={cn(
                      'rounded-full border-0 px-2 py-1 text-xs font-semibold',
                      SENTIMENT_TONE[r.sentiment ?? 'Unknown'] ?? 'bg-surface-container-high text-on-surface-variant'
                    )}
                  >
                    {SENTIMENTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold',
                      SENTIMENT_TONE[r.sentiment ?? 'Unknown'] ?? 'bg-surface-container-high text-on-surface-variant'
                    )}
                  >
                    {r.sentiment ?? 'Unknown'}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-on-surface-variant">
                {r.reportsToContactId ? nameById.get(r.reportsToContactId) ?? '—' : '—'}
              </td>
              {canUpdate ? (
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(r.id)}
                    disabled={isDeleting}
                    className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error disabled:opacity-50"
                    aria-label={`Remove ${fullName(r)}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lightweight org chart rendered from the reportsToContactId tree. */
function RelationsOrgChart({ relations }: { relations: RelatedContact[] }) {
  const byContactId = useMemo(() => {
    const map = new Map<string, RelatedContact>();
    for (const r of relations) map.set(r.contactId, r);
    return map;
  }, [relations]);

  const childrenOf = (contactId: string) =>
    relations.filter((r) => r.reportsToContactId === contactId);

  // Roots: no reportsTo, or reportsTo points outside this committee.
  const roots = relations.filter(
    (r) => !r.reportsToContactId || !byContactId.has(r.reportsToContactId)
  );

  const renderNode = (r: RelatedContact, depth: number): ReactNode => (
    <div
      key={r.id}
      className={cn(depth > 0 && 'ml-6 border-l-2 border-outline-variant pl-4', 'mt-3')}
    >
      <div className="rounded-xl border border-outline-variant bg-surface p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-xs font-bold text-primary">
            {(r.contact.firstName[0] ?? '') + (r.contact.lastName[0] ?? '')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={`/contacts/${r.contactId}`}
                className="text-sm font-semibold text-on-surface hover:text-primary hover:underline"
              >
                {fullName(r)}
              </Link>
              {r.isChampion ? <Crown className="h-3.5 w-3.5 text-success" /> : null}
            </div>
            <p className="text-xs text-on-surface-variant">{r.contact.jobTitle ?? 'Stakeholder'}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  ROLE_COLORS[r.role] ?? 'bg-surface-container-high text-on-surface-variant'
                )}
              >
                {r.role}
              </span>
              <span className="text-[11px] text-on-surface-variant">{r.influence ?? 0}% influence</span>
            </div>
          </div>
        </div>
      </div>
      {childrenOf(r.contactId).map((child) => renderNode(child, depth + 1))}
    </div>
  );

  return <div>{roots.map((r) => renderNode(r, 0))}</div>;
}

function AddRelatedContactModal({
  existing,
  isSaving,
  onClose,
  onSave,
}: {
  existing: RelatedContact[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: {
    contactId: string;
    role: string;
    isPrimary?: boolean;
    influence?: number;
    sentiment?: string;
    reportsToContactId?: string;
    isChampion?: boolean;
    notes?: string;
  }) => void;
}) {
  const [search, setSearch] = useState('');
  const [contactId, setContactId] = useState('');
  const [role, setRole] = useState('Influencer');
  const [influence, setInfluence] = useState(50);
  const [sentiment, setSentiment] = useState('Neutral');
  const [isPrimary, setIsPrimary] = useState(false);
  const [isChampion, setIsChampion] = useState(false);
  const [reportsToContactId, setReportsToContactId] = useState('');
  const [notes, setNotes] = useState('');

  const contactsQuery = useContacts({ search: search.trim() || undefined, limit: 20 });
  const contacts = contactsQuery.data?.data ?? [];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!contactId) return;
    onSave({
      contactId,
      role,
      influence,
      sentiment,
      isPrimary: isPrimary || undefined,
      isChampion: isChampion || undefined,
      reportsToContactId: reportsToContactId || undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 p-4">
      <form onSubmit={submit} className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Add related contact</h2>
            <p className="text-sm text-on-surface-variant">Link a contact to this account&apos;s buying committee.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Contact</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts by name or email…"
              className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-outline-variant p-1">
              {contactsQuery.isLoading ? (
                <p className="px-2 py-3 text-xs text-on-surface-variant">Loading contacts…</p>
              ) : contacts.length === 0 ? (
                <p className="px-2 py-3 text-xs text-on-surface-variant">No contacts found.</p>
              ) : (
                contacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setContactId(c.id)}
                    className={cn(
                      'flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm',
                      contactId === c.id ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-container-low'
                    )}
                  >
                    <span className="font-semibold">
                      {c.firstName} {c.lastName}
                    </span>
                    <span className="text-xs text-on-surface-variant">{c.email ?? c.jobTitle ?? 'Contact'}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm outline-none focus:border-primary"
              >
                {ROLES.map((rl) => (
                  <option key={rl} value={rl}>
                    {rl}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sentiment">
              <select
                value={sentiment}
                onChange={(e) => setSentiment(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm outline-none focus:border-primary"
              >
                {SENTIMENTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={`Influence — ${influence}%`}>
            <input
              type="range"
              min={0}
              max={100}
              value={influence}
              onChange={(e) => setInfluence(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </Field>

          <Field label="Reports to (optional)">
            <select
              value={reportsToContactId}
              onChange={(e) => setReportsToContactId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">None (top level)</option>
              {existing.map((r) => (
                <option key={r.contactId} value={r.contactId}>
                  {fullName(r)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="rounded border-outline-variant text-primary focus:ring-primary"
              />
              Primary contact
            </label>
            <label className="flex items-center gap-2 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={isChampion}
                onChange={(e) => setIsChampion(e.target.checked)}
                className="rounded border-outline-variant text-primary focus:ring-primary"
              />
              Champion
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-outline-variant p-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving} disabled={!contactId}>
            <Plus className="h-4 w-4" />
            Add contact
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}
