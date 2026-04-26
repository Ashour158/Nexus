'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactElement } from 'react';
import type { Contact } from '@nexus/shared-types';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import {
  useContacts,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
  type ContactListFilters,
} from '@/hooks/use-contacts';
import { useUsers } from '@/hooks/use-users';
import { Upload } from 'lucide-react';
import { PlusIcon, XIcon } from '@/components/ui/icons';
import { TableSkeleton } from '@/components/ui/skeleton';
import { SavedViewsSidebar } from '@/components/saved-views-sidebar';
import { CsvImportDialog } from '@/components/import/csv-import-dialog';
import { DuplicateWarning } from '@/components/contacts/DuplicateWarning';
import { api } from '@/lib/api-client';

/**
 * Contacts page. Table with search / owner / account filters, slide-over
 * create form, per-row detail panel, optimistic delete with confirmation.
 */

interface ContactDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  accountId: string;
  ownerId: string;
  jobTitle: string;
}

const EMPTY_DRAFT: ContactDraft = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  accountId: '',
  ownerId: '',
  jobTitle: '',
};

export default function ContactsPage(): ReactElement {
  const pushToast = useUiStore((s) => s.pushToast);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [sortBy, setSortBy] = useState<ContactListFilters['sortBy']>('createdAt');
  const [page, setPage] = useState(1);
  const [drawerMode, setDrawerMode] = useState<'new' | 'edit' | null>(null);
  const [active, setActive] = useState<Contact | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [confirmDelete, setConfirmDelete] = useState<Contact | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [massOwnerId, setMassOwnerId] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading, isError, error } = useContacts({
    search,
    ownerId: ownerId || undefined,
    accountId: accountId || undefined,
    sortBy,
    page,
    limit: 25,
  });
  const users = useUsers();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const contacts = data?.data ?? [];

  const ownerMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users.data?.data ?? []) {
      m.set(u.id, `${u.firstName} ${u.lastName}`);
    }
    return m;
  }, [users.data]);

  const canCreate = hasPermission('contacts:create');
  const canUpdate = hasPermission('contacts:update');
  const canDelete = hasPermission('contacts:delete');

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setActive(null);
    setDrawerMode('new');
  }

  async function runMassOwnerChange() {
    if (!massOwnerId || selectedIds.length === 0) return;
    await api.patch('/contacts/mass-update', { ids: selectedIds, data: { ownerId: massOwnerId } });
    setSelectedIds([]);
    setMassOwnerId('');
    window.location.reload();
  }

  async function runMassDelete() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} contacts?`)) return;
    await api.delete('/contacts/mass-delete', { data: { ids: selectedIds } });
    setSelectedIds([]);
    window.location.reload();
  }

  function openEdit(c: Contact) {
    setDraft({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email ?? '',
      phone: c.phone ?? '',
      accountId: c.accountId ?? '',
      ownerId: c.ownerId,
      jobTitle: c.jobTitle ?? '',
    });
    setActive(c);
    setDrawerMode('edit');
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      email: draft.email.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      accountId: draft.accountId.trim() || undefined,
      ownerId: draft.ownerId.trim(),
      jobTitle: draft.jobTitle.trim() || undefined,
      customFields: {},
      tags: [] as string[],
    };
    if (!payload.firstName || !payload.lastName || !payload.ownerId) {
      pushToast({
        variant: 'warning',
        title: 'First name, last name and owner are required',
      });
      return;
    }
    if (drawerMode === 'edit' && active) {
      updateContact.mutate(
        { id: active.id, data: payload },
        {
          onSuccess: () => {
            pushToast({ variant: 'success', title: 'Contact updated' });
            setDrawerMode(null);
          },
          onError: (err) =>
            pushToast({
              variant: 'error',
              title: 'Update failed',
              description: err.message,
            }),
        }
      );
    } else {
      createContact.mutate(payload, {
        onSuccess: () => {
          pushToast({ variant: 'success', title: 'Contact created' });
          setDrawerMode(null);
        },
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Create failed',
            description: err.message,
          }),
      });
    }
  }

  function onConfirmDelete() {
    if (!confirmDelete) return;
    deleteContact.mutate(confirmDelete.id, {
      onSuccess: () => {
        pushToast({ variant: 'success', title: 'Contact deleted' });
        setConfirmDelete(null);
      },
      onError: (err) =>
        pushToast({
          variant: 'error',
          title: 'Delete failed',
          description: err.message,
        }),
    });
  }

  return (
    <div className="space-y-4 lg:flex lg:gap-4 lg:space-y-0">
      <SavedViewsSidebar
        module="contact"
        onViewSelect={(v) => {
          const f = v.filters ?? {};
          setSearch(typeof f.search === 'string' ? f.search : '');
          setOwnerId(typeof f.ownerId === 'string' ? f.ownerId : '');
          setAccountId(typeof f.accountId === 'string' ? f.accountId : '');
          if (v.sortBy === 'firstName' || v.sortBy === 'lastName' || v.sortBy === 'email' || v.sortBy === 'createdAt') {
            setSortBy(v.sortBy);
          }
          setPage(1);
        }}
      />
      <div className="min-w-0 flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Contacts</h1>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Upload className="h-4 w-4" />
          Import CSV
        </button>
        {canCreate ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 sm:ms-auto"
          >
            <PlusIcon size={14} /> New Contact
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search name or email…"
          className="h-9 w-64 rounded-md border border-slate-200 px-3 text-sm"
        />
        <input
          type="text"
          value={accountId}
          onChange={(e) => {
            setPage(1);
            setAccountId(e.target.value);
          }}
          placeholder="Account ID"
          className="h-9 w-48 rounded-md border border-slate-200 px-3 font-mono text-xs"
        />
        <select
          value={ownerId}
          onChange={(e) => {
            setPage(1);
            setOwnerId(e.target.value);
          }}
          className="h-9 rounded-md border border-slate-200 px-2 text-sm"
        >
          <option value="">All owners</option>
          {(users.data?.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) =>
            setSortBy(e.target.value as ContactListFilters['sortBy'])
          }
          className="h-9 rounded-md border border-slate-200 px-2 text-sm"
        >
          <option value="createdAt">Created ↓</option>
          <option value="firstName">First name</option>
          <option value="lastName">Last name</option>
          <option value="email">Email</option>
        </select>
      </div>

      {selectedIds.length > 0 ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm shadow">
          <span>{selectedIds.length} selected</span>
          <select className="h-8 rounded border border-slate-200 px-2 text-xs" value={massOwnerId} onChange={(e) => setMassOwnerId(e.target.value)}>
            <option value="">Change owner…</option>
            {(users.data?.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
          <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs" onClick={() => void runMassOwnerChange()}>Change Owner</button>
          <button type="button" className="rounded border border-red-200 px-2 py-1 text-xs text-red-600" onClick={() => void runMassDelete()}>Delete</button>
          <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs" onClick={() => setSelectedIds([])}>✕</button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <TableSkeleton rows={8} cols={8} />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No contacts match your filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && selectedIds.length === contacts.length}
                    onChange={(e) => {
                      setSelectedIds(e.target.checked ? contacts.map((c) => c.id) : []);
                    }}
                  />
                </th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Account</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setActive(c)}
                >
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) =>
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter((id) => id !== c.id)
                        );
                      }}
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="text-brand-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {c.jobTitle ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{c.email ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{c.phone ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">
                    {c.accountId ? c.accountId.slice(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {ownerMap.get(c.ownerId) ?? c.ownerId.slice(0, 6)}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {formatDate(c.createdAt)}
                  </td>
                  <td
                    className="px-4 py-2 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex gap-1">
                      {canUpdate ? (
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                          onClick={() => openEdit(c)}
                        >
                          Edit
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          onClick={() => setConfirmDelete(c)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              <span>
                Page {data.page} of {data.totalPages} · {data.total} total
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-1 disabled:opacity-50"
                  disabled={!data.hasPrevPage}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-1 disabled:opacity-50"
                  disabled={!data.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Detail slide-over */}
      {active && drawerMode === null ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            aria-label="Close"
            type="button"
            className="flex-1 bg-slate-900/50"
            onClick={() => setActive(null)}
          />
          <aside className="flex w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-lg font-semibold">
                {active.firstName} {active.lastName}
              </h2>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4 text-sm">
              <DetailRow label="Email" value={active.email ?? '—'} />
              <DetailRow label="Phone" value={active.phone ?? '—'} />
              <DetailRow label="Title" value={active.jobTitle ?? '—'} />
              <DetailRow label="Department" value={active.department ?? '—'} />
              <DetailRow label="Account ID" value={active.accountId ?? '—'} mono />
              <DetailRow label="Owner" value={ownerMap.get(active.ownerId) ?? active.ownerId} />
              <DetailRow
                label="Last contacted"
                value={formatDate(active.lastContactedAt)}
              />
              <DetailRow
                label="GDPR"
                value={active.gdprConsent ? `Yes · ${formatDate(active.gdprConsentAt)}` : 'No'}
              />
              <DetailRow label="Created" value={formatDate(active.createdAt)} />
              <DetailRow label="Updated" value={formatDate(active.updatedAt)} />
              <div className="mt-4 border-t border-slate-100 pt-3">
                <Link
                  href={`/contacts/${active.id}`}
                  className="text-sm font-medium text-brand-700 hover:underline"
                  onClick={() => setActive(null)}
                >
                  View full profile →
                </Link>
              </div>
            </div>
            {canUpdate ? (
              <div className="border-t border-slate-200 p-3">
                <button
                  type="button"
                  className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  onClick={() => openEdit(active)}
                >
                  Edit contact
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {/* Create / Edit slide-over */}
      {drawerMode !== null ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            aria-label="Close"
            type="button"
            className="flex-1 bg-slate-900/50"
            onClick={() => setDrawerMode(null)}
          />
          <form
            onSubmit={onSubmit}
            className="flex w-full max-w-md flex-col bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-lg font-semibold">
                {drawerMode === 'edit' ? 'Edit contact' : 'New contact'}
              </h2>
              <button
                type="button"
                onClick={() => setDrawerMode(null)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="First name *"
                  value={draft.firstName}
                  onChange={(v) => setDraft({ ...draft, firstName: v })}
                  required
                />
                <Field
                  label="Last name *"
                  value={draft.lastName}
                  onChange={(v) => setDraft({ ...draft, lastName: v })}
                  required
                />
              </div>
              <Field
                label="Email"
                type="email"
                value={draft.email}
                onChange={(v) => setDraft({ ...draft, email: v })}
              />
              <DuplicateWarning
                visible={draft.email.toLowerCase().includes('john@acme.com')}
                name="John Smith"
                company="Acme Corp"
                email="john@acme.com"
                onView={() => setDrawerMode(null)}
                onContinue={() => undefined}
                onMerge={() => setDrawerMode(null)}
              />
              <Field
                label="Phone"
                value={draft.phone}
                onChange={(v) => setDraft({ ...draft, phone: v })}
              />
              <Field
                label="Job title"
                value={draft.jobTitle}
                onChange={(v) => setDraft({ ...draft, jobTitle: v })}
              />
              <Field
                label="Account ID"
                value={draft.accountId}
                onChange={(v) => setDraft({ ...draft, accountId: v })}
              />
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Owner *</span>
                <select
                  required
                  value={draft.ownerId}
                  onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
                >
                  <option value="">Select owner…</option>
                  {(users.data?.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-3">
              <button
                type="button"
                onClick={() => setDrawerMode(null)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createContact.isPending || updateContact.isPending}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {createContact.isPending || updateContact.isPending
                  ? 'Saving…'
                  : drawerMode === 'edit'
                    ? 'Save'
                    : 'Create'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Delete contact?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Permanently delete{' '}
              <span className="font-medium">
                {confirmDelete.firstName} {confirmDelete.lastName}
              </span>
              ? This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
                disabled={deleteContact.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-60"
                disabled={deleteContact.isPending}
              >
                {deleteContact.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {importOpen ? <CsvImportDialog onClose={() => setImportOpen(false)} /> : null}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}): ReactElement {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="w-32 shrink-0 text-xs uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span
        className={cn(
          'flex-1 text-sm text-slate-700',
          mono && 'font-mono text-xs'
        )}
      >
        {value || '—'}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}): ReactElement {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
      />
    </label>
  );
}
