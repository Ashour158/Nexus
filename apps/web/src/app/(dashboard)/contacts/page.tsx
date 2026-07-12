'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useConfirm } from '@/hooks/use-confirm';
import type { Contact } from '@nexus/shared-types';
import {
  Building2,
  Clock,
  Globe2,
  History,
  Image as ImageIcon,
  Mail,
  MapPin,
  MessageSquareText,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Tag,
  TrendingUp,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { contactSchema } from '@/lib/schemas';
import {
  contactKeys,
  useContacts,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
  type ContactListFilters,
} from '@/hooks/use-contacts';
import { useUsers } from '@/hooks/use-users';
import { useAccounts } from '@/hooks/use-accounts';
import { ExportButton } from '@/components/export/ExportButton';
import { BulkActionBar } from '@/components/crm/BulkActionBar';
import { SavedViewsControl } from '@/components/crm/SavedViewsControl';
import { CsvImportDialog } from '@/components/import/csv-import-dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { CRMModuleShell } from '@/components/ui/crm';

interface ContactDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobile: string;
  whatsapp: string;
  secondPhone: string;
  accountId: string;
  ownerId: string;
  jobTitle: string;
  department: string;
  photoUrl: string;
  linkedInUrl: string;
  twitterHandle: string;
  country: string;
  city: string;
  address: string;
  timezone: string;
  preferredChannel: string;
  lifecycleStage: string;
  tags: string;
  productTags: string;
  industryTags: string;
  gdprConsent: boolean;
  doNotEmail: boolean;
  doNotCall: boolean;
}

const EMPTY_DRAFT: ContactDraft = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  mobile: '',
  whatsapp: '',
  secondPhone: '',
  accountId: '',
  ownerId: '',
  jobTitle: '',
  department: '',
  photoUrl: '',
  linkedInUrl: '',
  twitterHandle: '',
  country: '',
  city: '',
  address: '',
  timezone: 'Africa/Cairo',
  preferredChannel: 'email',
  lifecycleStage: 'New relationship',
  tags: '',
  productTags: '',
  industryTags: '',
  gdprConsent: true,
  doNotEmail: false,
  doNotCall: false,
};

type ValidationRule = {
  id: string;
  field: string;
  label: string;
  enabled: boolean;
  message: string;
};

const ownerColors = ['bg-primary-container text-primary', 'bg-tertiary-container text-tertiary', 'bg-warning-container text-warning'];

export default function ContactsPage(): ReactElement {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { confirm, ConfirmDialog } = useConfirm();

  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [sortBy, setSortBy] = useState<ContactListFilters['sortBy']>('createdAt');
  const [page, setPage] = useState(1);
  const [drawerMode, setDrawerMode] = useState<'new' | 'edit' | null>(null);
  const [active, setActive] = useState<Contact | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [importOpen, setImportOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const contactsQuery = useContacts({
    search,
    ownerId: ownerId || undefined,
    sortBy,
    page,
    limit: 25,
  });
  const usersQuery = useUsers({ limit: 200 });
  const accountsQuery = useAccounts({ limit: 200 });
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const contacts = useMemo(() => contactsQuery.data?.data ?? [], [contactsQuery.data?.data]);
  const users = useMemo(() => usersQuery.data?.data ?? [], [usersQuery.data?.data]);
  const accounts = useMemo(() => accountsQuery.data?.data ?? [], [accountsQuery.data?.data]);
  const [validationRules, setValidationRules] = useState<ValidationRule[]>([]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/crm/validation-rules?objectType=contact', { cache: 'no-store' })
      .then((res) => res.json())
      .then((body) => {
        if (mounted) setValidationRules(Array.isArray(body.data) ? body.data : []);
      })
      .catch(() => setValidationRules([]));
    return () => {
      mounted = false;
    };
  }, []);

  const ownerMap = useMemo(() => {
    const owners = new Map<string, string>();
    for (const user of users) owners.set(user.id, `${user.firstName} ${user.lastName}`);
    return owners;
  }, [users]);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) map.set(account.id, account.name);
    return map;
  }, [accounts]);

  const requiredFields = useMemo(
    () => new Set(validationRules.filter((rule) => rule.enabled).map((rule) => rule.field)),
    [validationRules]
  );

  const stats = useMemo(() => {
    const consented = contacts.filter((contact) => contact.gdprConsent).length;
    const withEmail = contacts.filter((contact) => contact.email).length;
    const newThisWeek = contacts.filter(
      (contact) => Date.now() - new Date(contact.createdAt).getTime() < 7 * 86400000
    ).length;
    const activeContacts = contacts.filter((contact) => contact.isActive).length;
    return {
      total: contactsQuery.data?.total ?? contacts.length,
      active: activeContacts,
      withEmail,
      consentRate: contacts.length > 0 ? Math.round((consented / contacts.length) * 100) : 0,
      newThisWeek,
    };
  }, [contacts, contactsQuery.data?.total]);

  const countryBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const contact of contacts) {
      const country = contact.country || 'Unknown';
      counts.set(country, (counts.get(country) ?? 0) + 1);
    }
    const total = Math.max(contacts.length, 1);
    return Array.from(counts.entries()).map(([label, value]) => ({
      label,
      value,
      pct: Math.round((value / total) * 100),
    }));
  }, [contacts]);

  const canCreate = hasPermission('contacts:create');
  const canUpdate = hasPermission('contacts:update');
  const canDelete = hasPermission('contacts:delete');

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setActive(null);
    setFieldErrors({});
    setDrawerMode('new');
  }

  function openEdit(contact: Contact) {
    setDraft({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      mobile: contact.mobile ?? '',
      whatsapp: customString(contact, 'whatsapp'),
      secondPhone: customString(contact, 'secondPhone'),
      accountId: contact.accountId ?? '',
      ownerId: contact.ownerId,
      jobTitle: contact.jobTitle ?? '',
      department: contact.department ?? '',
      photoUrl: customString(contact, 'photoUrl'),
      linkedInUrl: contact.linkedInUrl ?? '',
      twitterHandle: contact.twitterHandle ?? '',
      country: contact.country ?? '',
      city: contact.city ?? '',
      address: contact.address ?? '',
      timezone: contact.timezone ?? 'Africa/Cairo',
      preferredChannel: contact.preferredChannel ?? 'email',
      lifecycleStage: customString(contact, 'lifecycleStage') || 'New relationship',
      tags: contact.tags.join(', '),
      productTags: customStringArray(contact, 'productTags').join(', '),
      industryTags: customStringArray(contact, 'industryTags').join(', '),
      gdprConsent: contact.gdprConsent,
      doNotEmail: contact.doNotEmail,
      doNotCall: contact.doNotCall,
    });
    setActive(contact);
    setFieldErrors({});
    setDrawerMode('edit');
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      email: draft.email.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      mobile: draft.mobile.trim() || undefined,
      whatsapp: draft.whatsapp.trim() || undefined,
      secondPhone: draft.secondPhone.trim() || undefined,
      jobTitle: draft.jobTitle.trim() || undefined,
      department: draft.department.trim() || undefined,
      accountId: draft.accountId.trim() || undefined,
      ownerId: draft.ownerId.trim() || undefined,
      photoUrl: draft.photoUrl.trim() || undefined,
      linkedInUrl: draft.linkedInUrl.trim() || undefined,
      twitterHandle: draft.twitterHandle.trim() || undefined,
      country: draft.country.trim() || undefined,
      city: draft.city.trim() || undefined,
      address: draft.address.trim() || undefined,
      timezone: draft.timezone.trim() || undefined,
      preferredChannel: draft.preferredChannel.trim() || undefined,
      lifecycleStage: draft.lifecycleStage.trim() || undefined,
      gdprConsent: draft.gdprConsent,
      doNotEmail: draft.doNotEmail,
      doNotCall: draft.doNotCall,
      tags: splitTags(draft.tags),
      productTags: splitTags(draft.productTags),
      industryTags: splitTags(draft.industryTags),
    };
    const result = contactSchema.safeParse(payload);
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.errors) {
        const key = String(issue.path[0] ?? 'form');
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      notify.error('Validation error', result.error.errors[0]?.message);
      return;
    }
    const lowCodeErrors: Record<string, string> = {};
    for (const rule of validationRules.filter((item) => item.enabled)) {
      const value = payload[rule.field as keyof typeof payload];
      if (value === undefined || value === '' || value === false) lowCodeErrors[rule.field] = rule.message;
    }
    if (Object.keys(lowCodeErrors).length > 0) {
      setFieldErrors((current) => ({ ...current, ...lowCodeErrors }));
      notify.error('Validation policy', Object.values(lowCodeErrors)[0]);
      return;
    }

    // Map blank optional IDs to undefined so we never send '' back over the
    // wire (which would overwrite the schema-normalized values / fail cuid).
    const accountId = draft.accountId.trim() || undefined;
    const ownerId = draft.ownerId.trim() || undefined;
    const mutationPayload = {
      ...result.data,
      accountId,
      ownerId,
      tags: splitTags(draft.tags),
      customFields: {
        photoUrl: payload.photoUrl,
        whatsapp: payload.whatsapp,
        secondPhone: payload.secondPhone,
        lifecycleStage: payload.lifecycleStage,
        productTags: payload.productTags,
        industryTags: payload.industryTags,
      },
    };

    if (drawerMode === 'edit' && active) {
      updateContact.mutate(
        { id: active.id, data: mutationPayload },
        { onSuccess: () => setDrawerMode(null) }
      );
    } else {
      if (!accountId || !ownerId) {
        const missing: Record<string, string> = {};
        if (!accountId) missing.accountId = 'An account is required.';
        if (!ownerId) missing.ownerId = 'An owner is required.';
        setFieldErrors((current) => ({ ...current, ...missing }));
        notify.error('Validation error', Object.values(missing)[0]);
        return;
      }
      createContact.mutate(
        { ...mutationPayload, accountId, ownerId },
        {
          onSuccess: () => {
            setDrawerMode(null);
            setDraft(EMPTY_DRAFT);
          },
        }
      );
    }
  }

  return (
    <CRMModuleShell>
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Contacts"
          value={stats.total.toLocaleString()}
          note={`${stats.newThisWeek} added this week`}
          icon={<Users className="h-5 w-5 text-primary" />}
        />
        <KpiCard
          label="Active Contacts"
          value={stats.active.toLocaleString()}
          note="Ready for sales engagement"
          icon={<TrendingUp className="h-5 w-5 text-success" />}
        />
        <KpiCard
          label="Email Coverage"
          value={`${stats.withEmail}`}
          note="Reachable contact records"
          icon={<Mail className="h-5 w-5 text-warning" />}
        />
        <KpiCard
          label="Consent Rate"
          value={`${stats.consentRate}%`}
          note="GDPR consent captured"
          icon={<ShieldCheck className="h-5 w-5 text-tertiary" />}
        />
      </section>

      <section className="grid grid-cols-12 gap-6">
        <div className="col-span-12 rounded-xl border border-[#e7edf3] bg-surface p-6 lg:col-span-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-on-surface">Contacts Command Center</h1>
              <p className="text-sm text-on-surface-variant">Clean customer relationships, owners, consent, and outreach readiness.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-4 py-2 text-sm font-bold text-on-surface transition hover:bg-surface-container-low"
              >
                <Upload className="h-4 w-4" />
                Import
              </button>
              <ExportButton module="contacts" />
              <SavedViewsControl
                entityType="contact"
                currentFilters={{ search, ownerId, sortBy }}
                onApply={(filters) => {
                  setPage(1);
                  setSearch(typeof filters.search === 'string' ? filters.search : '');
                  setOwnerId(typeof filters.ownerId === 'string' ? filters.ownerId : '');
                  if (typeof filters.sortBy === 'string') {
                    setSortBy(filters.sortBy as ContactListFilters['sortBy']);
                  }
                }}
              />
              {canCreate ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-bold text-white transition active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  Create New Contact
                </button>
              ) : null}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center px-4">
              <div className="absolute top-1/4 w-full border-b border-outline-variant" />
              <div className="absolute top-2/4 w-full border-b border-outline-variant" />
              <div className="absolute top-3/4 w-full border-b border-outline-variant" />
            </div>
            <div className="relative z-10 flex h-64 items-end justify-between gap-4 px-4">
              {[
                { label: 'Jan', value: 44, tone: 'bg-primary-container' },
                { label: 'Feb', value: 58, tone: 'bg-primary-container' },
                { label: 'Mar', value: 72, tone: 'bg-primary-container' },
                { label: 'Apr', value: 88, tone: 'bg-[#4f46e5]' },
                { label: 'May', value: 69, tone: 'bg-primary-container' },
                { label: 'Jun', value: 80, tone: 'bg-primary' },
              ].map((bar) => (
                <div key={bar.label} className="group flex flex-1 flex-col items-center gap-2">
                  <div
                    className={cn('w-12 rounded-t-lg transition-all group-hover:brightness-95', bar.tone)}
                    style={{ height: `${Math.round(bar.value * 2.3)}px` }}
                  />
                  <span className="text-xs font-medium text-on-surface-variant">{bar.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-12 rounded-xl border border-[#e7edf3] bg-surface p-6 lg:col-span-4">
          <h2 className="mb-6 text-lg font-bold text-on-surface">Regional Breakdown</h2>
          <div className="space-y-6">
            {(countryBreakdown.length > 0 ? countryBreakdown : [{ label: 'No data', value: 0, pct: 0 }]).map((row, index) => (
              <div key={row.label} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-on-surface">{row.label}</span>
                  <span className="text-on-surface-variant">{row.pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                  <div
                    className={cn('h-full', ['bg-primary', 'bg-primary', 'bg-primary-container', 'bg-primary-container'][index % 4])}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 border-t border-outline-variant pt-6">
            <Link href="/accounts/map" className="block text-center text-sm font-bold text-[#4f46e5] hover:underline">
              View Detailed Map
            </Link>
          </div>
        </div>

        <div className="col-span-12 overflow-hidden rounded-xl border border-[#e7edf3] bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-on-surface">Recent High-Value Contacts</h2>
              <p className="text-sm text-on-surface-variant">Decision makers and active stakeholders across open accounts.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  className="h-10 w-64 rounded-lg border-0 bg-surface-container-high pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary"
                  placeholder="Search contacts..."
                />
              </div>
              <select
                value={ownerId}
                aria-label="Filter by owner"
                onChange={(event) => {
                  setPage(1);
                  setOwnerId(event.target.value);
                }}
                className="h-10 rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary"
              >
                <option value="">All owners</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                ))}
              </select>
              <select
                value={sortBy}
                aria-label="Sort contacts"
                onChange={(event) => setSortBy(event.target.value as ContactListFilters['sortBy'])}
                className="h-10 rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary"
              >
                <option value="createdAt">Newest</option>
                <option value="firstName">First name</option>
                <option value="lastName">Last name</option>
                <option value="email">Email</option>
              </select>
            </div>
          </div>

          {contactsQuery.isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : contactsQuery.isError ? (
            <div className="p-8 text-sm text-error">
              Failed to load contacts.
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-10 text-center">
              <Users className="mx-auto h-8 w-8 text-outline" />
              <h3 className="mt-3 text-sm font-bold text-on-surface">No contacts found</h3>
              <p className="mt-1 text-sm text-on-surface-variant">Adjust the filters or create a new contact.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="border-b border-outline-variant bg-surface-container-low">
                <tr>
                  <th className="px-6 py-3 text-left w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="rounded border-outline-variant"
                      checked={contacts.length > 0 && selectedIds.length === contacts.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < contacts.length;
                      }}
                      onChange={(e) => setSelectedIds(e.target.checked ? contacts.map((c) => c.id) : [])}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Owner</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Contact</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {contacts.map((contact, index) => (
                  <tr key={contact.id} className="transition-colors hover:bg-surface-container-low">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${contact.firstName} ${contact.lastName}`}
                        className="rounded border-outline-variant"
                        checked={selectedIds.includes(contact.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, contact.id] : prev.filter((id) => id !== contact.id)
                          )
                        }
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn('flex h-8 w-8 items-center justify-center rounded text-xs font-bold', ownerColors[index % ownerColors.length])}>
                          {initials(contact)}
                        </div>
                        <div>
                          <Link href={`/contacts/${contact.id}`} className="text-sm font-semibold text-on-surface hover:text-[#4f46e5]">
                            {contact.firstName} {contact.lastName}
                          </Link>
                          <p className="text-xs text-on-surface-variant">{contact.accountId ? accountMap.get(contact.accountId) ?? contact.accountId : 'Unassigned account'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded bg-primary-container px-2 py-1 text-[10px] font-bold uppercase text-primary">
                        {contact.jobTitle ?? 'Stakeholder'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-inverse-surface text-[10px] font-bold text-white">
                          {(ownerMap.get(contact.ownerId) ?? 'NX').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm text-on-surface-variant">{ownerMap.get(contact.ownerId) ?? contact.ownerId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1 text-sm text-on-surface-variant">
                        <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-on-surface-variant" />{contact.email ?? 'No email'}</p>
                        <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-on-surface-variant" />{contact.phone ?? 'No phone'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-on-surface-variant">{formatDate(contact.createdAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setActive(contact)}
                        className="rounded-lg p-1.5 text-on-surface-variant transition hover:bg-surface-container-high hover:text-[#4f46e5]"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {contactsQuery.data ? (
            <div className="flex items-center justify-between border-t border-outline-variant px-6 py-3 text-xs text-on-surface-variant">
              <span>Page {contactsQuery.data.page} of {contactsQuery.data.totalPages} - {contactsQuery.data.total} total</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded border border-outline-variant px-3 py-1.5 font-semibold disabled:opacity-40"
                  disabled={!contactsQuery.data.hasPrevPage}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="rounded border border-outline-variant px-3 py-1.5 font-semibold disabled:opacity-40"
                  disabled={!contactsQuery.data.hasNextPage}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {active ? (
        <ContactPanel
          contact={active}
          owner={ownerMap.get(active.ownerId) ?? active.ownerId}
          account={active.accountId ? accountMap.get(active.accountId) ?? active.accountId : 'Unassigned'}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onClose={() => setActive(null)}
          onEdit={() => openEdit(active)}
          onDelete={async () => {
            if (!await confirm(`Delete ${active.firstName} ${active.lastName}?`, 'Delete Contact')) return;
            deleteContact.mutate(active.id, { onSuccess: () => setActive(null) });
          }}
        />
      ) : null}

      {drawerMode ? (
        <ContactFormPanel
          mode={drawerMode}
          draft={draft}
          users={users}
          accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
          requiredFields={requiredFields}
          fieldErrors={fieldErrors}
          isSaving={createContact.isPending || updateContact.isPending}
          onDraftChange={setDraft}
          onSubmit={onSubmit}
          onClose={() => setDrawerMode(null)}
        />
      ) : null}

      {importOpen ? <CsvImportDialog onClose={() => setImportOpen(false)} /> : null}
      <BulkActionBar
        entityType="contact"
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        queryKey={[...contactKeys.lists()]}
        ownerOptions={users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))}
      />
      {ConfirmDialog}
    </CRMModuleShell>
  );
}

function KpiCard({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#e7edf3] bg-surface p-6">
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold text-on-surface">{value}</p>
      <p className="text-xs font-medium text-on-surface-variant">{note}</p>
    </div>
  );
}

function ContactPanel({
  contact,
  owner,
  account,
  canUpdate,
  canDelete,
  onClose,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  owner: string;
  account: string;
  canUpdate: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <button type="button" aria-label="Close" className="flex-1 bg-inverse-surface/40" onClick={onClose} />
      <aside className="flex w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-on-surface">{contact.firstName} {contact.lastName}</h2>
            <p className="text-sm text-on-surface-variant">{contact.jobTitle ?? 'Stakeholder'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-sm">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-surface text-lg font-bold text-primary ring-1 ring-outline-variant">
                {customString(contact, 'photoUrl') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={customString(contact, 'photoUrl')} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(contact)
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">{customString(contact, 'lifecycleStage') || 'Relationship'}</p>
                <h3 className="text-base font-bold text-on-surface">{account}</h3>
                <p className="text-xs text-on-surface-variant">{[contact.department, contact.city, contact.country].filter(Boolean).join(' - ') || 'Profile enrichment pending'}</p>
              </div>
            </div>
          </div>
          <DetailRow icon={<Mail className="h-4 w-4" />} label="Email" value={contact.email ?? 'No email'} />
          <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone" value={contact.phone ?? 'No phone'} />
          <DetailRow icon={<MessageSquareText className="h-4 w-4" />} label="WhatsApp" value={customString(contact, 'whatsapp') || 'No WhatsApp'} />
          <DetailRow icon={<Phone className="h-4 w-4" />} label="Second phone" value={customString(contact, 'secondPhone') || 'No secondary phone'} />
          <DetailRow icon={<Building2 className="h-4 w-4" />} label="Account" value={account} />
          <DetailRow icon={<Users className="h-4 w-4" />} label="Owner" value={owner} />
          <DetailRow icon={<Globe2 className="h-4 w-4" />} label="Social" value={[contact.linkedInUrl, contact.twitterHandle].filter(Boolean).join(' - ') || 'No social profile'} />
          <DetailRow icon={<MapPin className="h-4 w-4" />} label="Address" value={[contact.address, contact.city, contact.country].filter(Boolean).join(', ') || 'No address'} />
          <DetailRow icon={<ShieldCheck className="h-4 w-4" />} label="GDPR" value={contact.gdprConsent ? 'Consent captured' : 'No consent'} />
          <DetailRow icon={<Clock className="h-4 w-4" />} label="Created" value={formatDate(contact.createdAt)} />
          <TagList title="Tags" values={contact.tags} />
          <TagList title="Product interests" values={customStringArray(contact, 'productTags')} />
          <TagList title="Industry tags" values={customStringArray(contact, 'industryTags')} />
          <PanelList
            icon={<Mail className="h-4 w-4" />}
            title="Mail Threads"
            empty="No synchronized mail thread yet."
            rows={customRecordArray(contact, 'emailThreads').map((thread) => ({
              id: String(thread.id ?? thread.subject),
              title: String(thread.subject ?? 'Mail thread'),
              meta: `${String(thread.count ?? 1)} messages - ${formatDate(String(thread.lastMessageAt ?? contact.updatedAt))}`,
            }))}
          />
          <PanelList
            icon={<Paperclip className="h-4 w-4" />}
            title="Documents"
            empty="No attached documents yet."
            rows={customRecordArray(contact, 'documents').map((doc) => ({
              id: String(doc.id ?? doc.name),
              title: String(doc.name ?? 'Document'),
              meta: `${String(doc.type ?? 'File')} - ${formatDate(String(doc.updatedAt ?? contact.updatedAt))}`,
            }))}
          />
          <PanelList
            icon={<History className="h-4 w-4" />}
            title="Audit Trail"
            empty="No audit events yet."
            rows={customRecordArray(contact, 'auditTrail').map((event) => ({
              id: String(event.id ?? event.action),
              title: String(event.action ?? 'Audit event'),
              meta: `${String(event.actor ?? 'System')} - ${formatDate(String(event.at ?? contact.updatedAt))}`,
            }))}
          />
        </div>
        <div className="flex gap-2 border-t border-outline-variant p-4">
          {canUpdate ? (
            <button type="button" onClick={onEdit} className="flex-1 rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-bold text-white">
              Edit
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" onClick={onDelete} className="rounded-lg border border-error/30 px-4 py-2 text-sm font-bold text-error hover:bg-error-container">
              Delete
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-outline-variant p-3">
      <span className="mt-0.5 text-on-surface-variant">{icon}</span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{label}</p>
        <p className="text-sm font-medium text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function TagList({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="rounded-lg border border-outline-variant p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={value} className="inline-flex items-center gap-1 rounded bg-primary-container px-2 py-1 text-xs font-bold text-primary">
            <Tag className="h-3 w-3" />
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function PanelList({
  icon,
  title,
  rows,
  empty,
}: {
  icon: ReactNode;
  title: string;
  rows: Array<{ id: string; title: string; meta: string }>;
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-outline-variant p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-xs text-on-surface-variant">{empty}</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-lg bg-surface-container-low px-3 py-2">
              <p className="font-semibold text-on-surface">{row.title}</p>
              <p className="text-xs text-on-surface-variant">{row.meta}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ContactFormPanel({
  mode,
  draft,
  users,
  accounts,
  requiredFields,
  fieldErrors,
  isSaving,
  onDraftChange,
  onSubmit,
  onClose,
}: {
  mode: 'new' | 'edit';
  draft: ContactDraft;
  users: Array<{ id: string; firstName: string; lastName: string }>;
  accounts: Array<{ id: string; name: string }>;
  requiredFields: Set<string>;
  fieldErrors: Record<string, string>;
  isSaving: boolean;
  onDraftChange: (draft: ContactDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <button type="button" aria-label="Close" className="flex-1 bg-inverse-surface/40" onClick={onClose} />
      <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <h2 className="text-lg font-bold text-on-surface">{mode === 'edit' ? 'Edit contact' : 'New contact'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="rounded-lg border border-primary/30 bg-primary-container px-4 py-3 text-xs leading-5 text-primary">
            Account linking is enforced through the low-code validation policy. Admins can change required fields under
            Settings / Validation Rules.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" value={draft.firstName} error={fieldErrors.firstName} onChange={(value) => onDraftChange({ ...draft, firstName: value })} required={requiredFields.has('firstName')} />
            <Field label="Last name" value={draft.lastName} error={fieldErrors.lastName} onChange={(value) => onDraftChange({ ...draft, lastName: value })} required={requiredFields.has('lastName')} />
          </div>
          <SelectField
            label="Linked account"
            value={draft.accountId}
            error={fieldErrors.accountId}
            required={requiredFields.has('accountId')}
            onChange={(value) => onDraftChange({ ...draft, accountId: value })}
            options={accounts.map((account) => ({ value: account.id, label: account.name }))}
          />
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Owner</span>
            <select
              required={requiredFields.has('ownerId')}
              value={draft.ownerId}
              onChange={(event) => onDraftChange({ ...draft, ownerId: event.target.value })}
              className="mt-1 h-10 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary"
            >
              <option value="">Select owner</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
              ))}
            </select>
            {fieldErrors.ownerId ? <p className="mt-1 text-xs text-error">{fieldErrors.ownerId}</p> : null}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" type="email" value={draft.email} error={fieldErrors.email} onChange={(value) => onDraftChange({ ...draft, email: value })} required={requiredFields.has('email')} />
            <Field label="Primary phone" value={draft.phone} error={fieldErrors.phone} onChange={(value) => onDraftChange({ ...draft, phone: value })} required={requiredFields.has('phone')} />
            <Field label="Mobile" value={draft.mobile} error={fieldErrors.mobile} onChange={(value) => onDraftChange({ ...draft, mobile: value })} />
            <Field label="WhatsApp" value={draft.whatsapp} error={fieldErrors.whatsapp} onChange={(value) => onDraftChange({ ...draft, whatsapp: value })} />
            <Field label="Second phone" value={draft.secondPhone} error={fieldErrors.secondPhone} onChange={(value) => onDraftChange({ ...draft, secondPhone: value })} />
            <Field label="Preferred channel" value={draft.preferredChannel} error={fieldErrors.preferredChannel} onChange={(value) => onDraftChange({ ...draft, preferredChannel: value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Job title" value={draft.jobTitle} error={fieldErrors.jobTitle} onChange={(value) => onDraftChange({ ...draft, jobTitle: value })} />
            <Field label="Department" value={draft.department} error={fieldErrors.department} onChange={(value) => onDraftChange({ ...draft, department: value })} />
            <Field label="Lifecycle stage" value={draft.lifecycleStage} error={fieldErrors.lifecycleStage} onChange={(value) => onDraftChange({ ...draft, lifecycleStage: value })} />
            <Field label="Timezone" value={draft.timezone} error={fieldErrors.timezone} onChange={(value) => onDraftChange({ ...draft, timezone: value })} />
          </div>
          <PhotoUpload
            value={draft.photoUrl}
            error={fieldErrors.photoUrl}
            onChange={(value) => onDraftChange({ ...draft, photoUrl: value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="LinkedIn URL" value={draft.linkedInUrl} error={fieldErrors.linkedInUrl} onChange={(value) => onDraftChange({ ...draft, linkedInUrl: value })} />
            <Field label="Twitter / X handle" value={draft.twitterHandle} error={fieldErrors.twitterHandle} onChange={(value) => onDraftChange({ ...draft, twitterHandle: value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country" value={draft.country} error={fieldErrors.country} onChange={(value) => onDraftChange({ ...draft, country: value })} />
            <Field label="City" value={draft.city} error={fieldErrors.city} onChange={(value) => onDraftChange({ ...draft, city: value })} />
          </div>
          <Field label="Address" value={draft.address} error={fieldErrors.address} onChange={(value) => onDraftChange({ ...draft, address: value })} />
          <Field label="General tags" value={draft.tags} error={fieldErrors.tags} onChange={(value) => onDraftChange({ ...draft, tags: value })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product tags" value={draft.productTags} error={fieldErrors.productTags} onChange={(value) => onDraftChange({ ...draft, productTags: value })} />
            <Field label="Industry tags" value={draft.industryTags} error={fieldErrors.industryTags} onChange={(value) => onDraftChange({ ...draft, industryTags: value })} />
          </div>
          <div className="grid gap-2 rounded-lg border border-outline-variant p-3 text-sm">
            <CheckboxField label="Consent captured" checked={draft.gdprConsent} onChange={(value) => onDraftChange({ ...draft, gdprConsent: value })} />
            <CheckboxField label="Do not email" checked={draft.doNotEmail} onChange={(value) => onDraftChange({ ...draft, doNotEmail: value })} />
            <CheckboxField label="Do not call" checked={draft.doNotCall} onChange={(value) => onDraftChange({ ...draft, doNotCall: value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-outline-variant p-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-bold text-on-surface hover:bg-surface-container-low">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            {isSaving ? 'Saving...' : mode === 'edit' ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  error,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  error?: string;
  icon?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        {icon}
        {label}
        {required ? <span className="text-primary">*</span> : null}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'mt-1 h-10 w-full rounded-lg border text-sm focus:border-primary focus:ring-primary',
          error ? 'border-error' : 'border-outline-variant'
        )}
      />
      {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  required = false,
  error,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </span>
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'mt-1 h-10 w-full rounded-lg border text-sm focus:border-primary focus:ring-primary',
          error ? 'border-error' : 'border-outline-variant'
        )}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
    </label>
  );
}

function PhotoUpload({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify.error('Invalid photo', 'Please upload an image file.');
      return;
    }
    if (file.size > 512 * 1024) {
      notify.error('Photo too large', 'Please upload an image smaller than 512 KB for preview.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => notify.error('Photo upload failed', 'Could not read the selected image.');
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-lg border border-outline-variant bg-surface p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container-high text-on-surface-variant ring-1 ring-outline-variant">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Profile photo</p>
          <p className="mt-0.5 text-xs text-on-surface-variant">Upload JPG, PNG, or WebP. Stored with the contact preview.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-[#4f46e5] px-3 text-xs font-bold text-white hover:bg-primary">
              Upload image
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </label>
            {value ? (
              <button
                type="button"
                onClick={() => onChange('')}
                className="h-9 rounded-lg border border-outline-variant px-3 text-xs font-bold text-on-surface-variant hover:bg-surface-container-low"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-error">{error}</p> : null}
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded bg-surface-container-low px-3 py-2">
      <span className="font-medium text-on-surface">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="rounded border-outline-variant text-primary focus:ring-primary"
      />
    </label>
  );
}

function initials(contact: Contact) {
  return `${contact.firstName[0] ?? ''}${contact.lastName[0] ?? ''}`.toUpperCase() || 'CN';
}

function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function customString(contact: Contact, key: string) {
  const value = contact.customFields?.[key];
  return typeof value === 'string' ? value : '';
}

function customStringArray(contact: Contact, key: string) {
  const value = contact.customFields?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function customRecordArray(contact: Contact, key: string) {
  const value = contact.customFields?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}
