'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Activity, Contact, Deal, PaginatedResult } from '@nexus/shared-types';
import {
  ArrowLeft,
  Building2,
  Edit3,
  FileClock,
  History,
  Mail,
  MapPin,
  Network,
  Paperclip,
  Phone,
  Route,
  Save,
  ShieldCheck,
  Tag,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CallButton } from '@/components/crm/call-button';
import { ComposeEmailButton } from '@/components/communications/ComposeEmailButton';
import { DetailQuickActions } from '@/components/crm/DetailQuickActions';
import { timelineMeta } from '@/lib/timeline-icons';
import { useContact, useContactDeals } from '@/hooks/use-contacts';
import { useRelatedAccounts, type RelatedAccount } from '@/hooks/use-account-relations';
import { activityKeys, useActivities } from '@/hooks/use-activities';
import { useUsers } from '@/hooks/use-users';
import { EnrichmentPanel } from '@/components/crm/EnrichmentPanel';
import { CustomFieldsSection } from '@/components/crm/CustomFieldsSection';
import { FieldHistory } from '@/components/crm/FieldHistory';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { useRealtimeContact } from '@/hooks/use-realtime';

type ContactTab =
  | 'overview'
  | 'enrichment'
  | 'customFields'
  | 'deals'
  | 'relatedAccounts'
  | 'activities'
  | 'timeline'
  | 'quotes'
  | 'documents'
  | 'mail'
  | 'history'
  | 'fieldHistory'
  | 'audit'
  | 'outbox'
  | 'consent';

interface ConsentRecord {
  channel: string;
  granted: boolean;
  updatedAt: string;
}

interface TimelineResponse {
  events: Array<Record<string, unknown>>;
  nextCursor: string | null;
}

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const contactId = params.id as string;
  const [tab, setTab] = useState<ContactTab>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isDevPreview =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== 'false';
  const canRead = hasPermission('contacts:read') || isDevPreview;
  const canUpdate = hasPermission('contacts:update') || isDevPreview;
  const contactQuery = useContact(contactId);
  useRealtimeContact(contactId);
  const dealsQuery = useContactDeals(contactId);
  const relatedAccountsQuery = useRelatedAccounts(contactId);
  const activitiesQuery = useActivities({ contactId, limit: 50 });
  const usersQuery = useUsers({ limit: 100 });
  const quotesQuery = useQuery<Record<string, unknown>>({
    queryKey: ['contacts', contactId, 'quotes'],
    queryFn: () => api.get<Record<string, unknown>>(`/contacts/${contactId}/quotes`, { params: { limit: 50 } }),
    enabled: Boolean(contactId) && tab === 'quotes',
  });
  const documentsQuery = useQuery<Record<string, unknown>[]>({
    queryKey: ['contacts', contactId, 'documents'],
    queryFn: () => api.get<Record<string, unknown>[]>(`/contacts/${contactId}/documents`),
    enabled: Boolean(contactId) && tab === 'documents',
  });
  const mailQuery = useQuery<Record<string, unknown>[]>({
    queryKey: ['contacts', contactId, 'mail'],
    queryFn: () => api.get<Record<string, unknown>[]>(`/contacts/${contactId}/mail`),
    enabled: Boolean(contactId) && tab === 'mail',
  });
  const timelineQuery = useQuery<TimelineResponse>({
    queryKey: ['contacts', contactId, 'timeline'],
    queryFn: () => api.get<TimelineResponse>(`/contacts/${contactId}/timeline`),
    enabled: Boolean(contactId) && tab === 'timeline',
  });
  const fieldHistoryQuery = useQuery<Record<string, unknown>[]>({
    queryKey: ['contacts', contactId, 'field-history'],
    queryFn: () => api.get<Record<string, unknown>[]>(`/contacts/${contactId}/field-history`),
    enabled: Boolean(contactId) && tab === 'fieldHistory',
  });
  const auditQuery = useQuery<Record<string, unknown>[]>({
    queryKey: ['contacts', contactId, 'audit'],
    queryFn: () => api.get<Record<string, unknown>[]>(`/contacts/${contactId}/audit`),
    enabled: Boolean(contactId) && tab === 'audit',
  });
  const outboxQuery = useQuery<Record<string, unknown>[]>({
    queryKey: ['contacts', contactId, 'outbox'],
    queryFn: () => api.get<Record<string, unknown>[]>(`/contacts/${contactId}/outbox`),
    enabled: Boolean(contactId) && tab === 'outbox',
  });

  const updateContact = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<Contact>(`/contacts/${contactId}`, payload),
    onSuccess: async () => {
      notify.success('Contact updated');
      setEditOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contacts', 'detail', contactId] }),
        queryClient.invalidateQueries({ queryKey: ['contacts', contactId] }),
      ]);
    },
    onError: (error) => notify.error('Update failed', error instanceof Error ? error.message : 'Could not update contact'),
  });

  const uploadDocument = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<Record<string, unknown>[]>(`/contacts/${contactId}/documents`, payload),
    onSuccess: async () => {
      notify.success('Document attached');
      setDocumentOpen(false);
      setTab('documents');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contacts', 'detail', contactId] }),
        queryClient.invalidateQueries({ queryKey: ['contacts', contactId, 'documents'] }),
        queryClient.invalidateQueries({ queryKey: ['contacts', contactId, 'timeline'] }),
      ]);
    },
    onError: (error) => notify.error('Upload failed', error instanceof Error ? error.message : 'Could not attach document'),
  });

  const consentsQuery = useQuery<{ data: ConsentRecord[] }>({
    queryKey: ['contacts', contactId, 'consents'],
    queryFn: () => api.get<{ data: ConsentRecord[] }>(`/contacts/${contactId}/consents`),
    enabled: Boolean(contactId) && tab === 'consent',
  });

  const contact = contactQuery.data;

  if (!canRead) {
    return (
      <div className="px-6 py-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You do not have permission to view contacts.
        </div>
      </div>
    );
  }

  if (contactQuery.isLoading) {
    return (
      <div className="space-y-4 px-6 py-8">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (contactQuery.isError || !contact) {
    return (
      <div className="px-6 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load contact: {contactQuery.error instanceof Error ? contactQuery.error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  const photo = customString(contact, 'photoUrl');
  const lifecycle = customString(contact, 'lifecycleStage') || 'Relationship';
  const whatsapp = customString(contact, 'whatsapp');
  const secondPhone = customString(contact, 'secondPhone');
  const productTags = customStringArray(contact, 'productTags');
  const industryTags = customStringArray(contact, 'industryTags');
  const documents = customRecordArray(contact, 'documents');
  const emailThreads = customRecordArray(contact, 'emailThreads');
  const auditTrail = customRecordArray(contact, 'auditTrail');
  const fieldHistory = customRecordArray(contact, 'fieldHistory');
  const outboxEvents = customRecordArray(contact, 'outboxEvents');
  const relationshipScore = customNumber(contact, 'relationshipScore');
  const slaStatus = customString(contact, 'slaStatus') || 'unknown';
  const buyingCommitteeRole = customString(contact, 'buyingCommitteeRole') || 'Stakeholder';
  const influenceLevel = customString(contact, 'influenceLevel') || 'Standard';
  const archive = customRecord(contact, 'archive');

  const ownerFromList = (usersQuery.data?.data ?? []).find((u) => u.id === contact.ownerId);
  const ownerName = ownerFromList
    ? `${ownerFromList.firstName ?? ''} ${ownerFromList.lastName ?? ''}`.trim() || ownerFromList.email || contact.ownerId
    : contact.ownerId;

  const tabs: { id: ContactTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'enrichment', label: 'Enrichment' },
    { id: 'customFields', label: 'Custom Fields' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'quotes', label: 'CPQ Quotes' },
    { id: 'deals', label: 'Deals' },
    { id: 'relatedAccounts', label: 'Related Accounts' },
    { id: 'activities', label: 'Activities' },
    { id: 'documents', label: 'Documents' },
    { id: 'mail', label: 'Mail' },
    { id: 'history', label: 'History' },
    { id: 'fieldHistory', label: 'Field History' },
    { id: 'audit', label: 'Audit' },
    { id: 'outbox', label: 'Outbox' },
    { id: 'consent', label: 'Consent' },
  ];

  return (
    <div className="space-y-6 bg-slate-50 px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-white px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => router.push('/contacts')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to contacts
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {canUpdate ? (
                <>
                  <Button variant="secondary" onClick={() => setDocumentOpen(true)}>
                    <Upload className="h-4 w-4" />
                    Upload Document
                  </Button>
                  <Button onClick={() => setEditOpen(true)}>
                    <Edit3 className="h-4 w-4" />
                    Edit Contact
                  </Button>
                </>
              ) : null}
              <CallButton
                contactId={contactId}
                accountId={contact.accountId ?? undefined}
                defaultNumber={contact.phone ?? contact.mobile}
                disabled={contact.doNotCall}
                disabledReason="Contact has opted out of calls"
              />
              <span className="relative inline-flex items-center gap-2">
                <DetailQuickActions
                  contactId={contactId}
                  accountId={contact.accountId ?? undefined}
                  invalidateKeys={[
                    ['contacts', contactId, 'timeline'],
                    [...activityKeys.all],
                  ]}
                />
              </span>
              <ComposeEmailButton
                entityType="contact"
                entityId={contactId}
                to={contact.email}
                disabled={contact.doNotEmail}
                disabledReason="Contact has opted out of email"
              />
              <Link href={`/contacts/${contactId}/portal`}>
                <Button variant="secondary">Portal</Button>
              </Link>
            </div>
          </div>
          {!canUpdate ? (
            <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Editing and document uploads are restricted by role permissions.
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex flex-col items-center rounded-xl border border-slate-100 bg-white p-5 text-center">
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl bg-blue-50 text-3xl font-bold text-blue-700 ring-1 ring-blue-100">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt={`${contact.firstName} ${contact.lastName}`} className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-12 w-12" />
                )}
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-950">
                {contact.firstName} {contact.lastName}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{contact.jobTitle ?? 'Stakeholder'}</p>
              <span className="mt-3 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-700">
                {lifecycle}
              </span>
              <span className={cn('mt-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider', slaTone(slaStatus))}>
                SLA {slaStatus}
              </span>
            </div>

            <InfoCard title="Consent and controls" icon={<ShieldCheck className="h-4 w-4" />}>
              <DetailItem label="GDPR consent" value={contact.gdprConsent ? 'Captured' : 'Missing'} />
              <DetailItem label="Do not email" value={contact.doNotEmail ? 'Yes' : 'No'} />
              <DetailItem label="Do not call" value={contact.doNotCall ? 'Yes' : 'No'} />
              <DetailItem label="Created" value={formatDate(contact.createdAt)} />
              <DetailItem label="Updated" value={formatDate(contact.updatedAt)} />
            </InfoCard>

            <InfoCard title="Governance" icon={<Route className="h-4 w-4" />}>
              <DetailItem label="Relationship score" value={`${relationshipScore}/100`} />
              <DetailItem label="Buying role" value={buyingCommitteeRole} />
              <DetailItem label="Influence" value={influenceLevel} />
              <DetailItem label="Archive status" value={archive ? String(archive.status ?? 'archived') : 'Active'} />
              <DetailItem label="Merge policy" value={customString(contact, 'mergePolicy') || 'Newest non-empty fields'} />
            </InfoCard>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-2">
              <InfoCard title="Relationship" icon={<Building2 className="h-4 w-4" />}>
                <DetailItem
                  label="Account"
                  value={
                    contact.accountId ? (
                      <Link href={`/accounts/${contact.accountId}`} className="font-semibold text-blue-700 hover:underline">
                        {contact.accountId}
                      </Link>
                    ) : (
                      'Unassigned'
                    )
                  }
                />
                <DetailItem label="Owner" value={contact.ownerId} />
                <DetailItem label="Department" value={contact.department ?? 'None'} />
                <DetailItem label="Preferred channel" value={contact.preferredChannel ?? 'Email'} />
              </InfoCard>

              <InfoCard title="Communication" icon={<Phone className="h-4 w-4" />}>
                <DetailItem label="Email" value={contact.email ?? 'No email'} />
                <DetailItem label="Primary phone" value={contact.phone ?? 'No phone'} />
                <DetailItem label="Mobile" value={contact.mobile ?? 'No mobile'} />
                <DetailItem label="WhatsApp" value={whatsapp || 'No WhatsApp'} />
                <DetailItem label="Second phone" value={secondPhone || 'No secondary phone'} />
              </InfoCard>

              <InfoCard title="Address and social" icon={<MapPin className="h-4 w-4" />}>
                <DetailItem label="Address" value={[contact.address, contact.city, contact.country].filter(Boolean).join(', ') || 'No address'} />
                <DetailItem label="Timezone" value={contact.timezone ?? 'No timezone'} />
                <DetailItem label="LinkedIn" value={contact.linkedInUrl ?? 'No LinkedIn'} />
                <DetailItem label="Twitter / X" value={contact.twitterHandle ?? 'No handle'} />
              </InfoCard>

              <InfoCard title="Tags" icon={<Tag className="h-4 w-4" />}>
                <TagCloud label="Contact tags" values={contact.tags} />
                <TagCloud label="Product tags" values={productTags} />
                <TagCloud label="Industry tags" values={industryTags} />
              </InfoCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <MiniFeed title="Mail Threads" icon={<Mail className="h-4 w-4" />} rows={emailThreads} empty="No synchronized mail threads yet." />
              <MiniFeed title="Documents" icon={<Paperclip className="h-4 w-4" />} rows={documents} empty="No attached documents yet." />
              <MiniFeed title="Audit Trail" icon={<History className="h-4 w-4" />} rows={auditTrail} empty="No audit events yet." />
              <MiniFeed title="Field History" icon={<FileClock className="h-4 w-4" />} rows={fieldHistory} empty="No field changes recorded yet." />
              <MiniFeed title="Outbox Events" icon={<Network className="h-4 w-4" />} rows={outboxEvents} empty="No pending events." />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Contact Workspace</h2>
            <p className="mt-1 text-sm text-slate-500">Timeline, documents, communication, auditability, and controlled actions.</p>
          </div>
          {tab === 'documents' && canUpdate ? (
            <Button variant="secondary" onClick={() => setDocumentOpen(true)}>
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          ) : null}
        </div>
        <div className="grid gap-2 border-b border-slate-200 px-6 py-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-semibold transition',
                tab === t.id
                  ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'overview' && (
            <ContactOverviewTab
              contact={contact}
              ownerName={ownerName}
              whatsapp={whatsapp}
              secondPhone={secondPhone}
              lifecycle={lifecycle}
              buyingCommitteeRole={buyingCommitteeRole}
              influenceLevel={influenceLevel}
            />
          )}
          {tab === 'enrichment' && (
            <EnrichmentPanel entityType="contact" entityId={contact.id} canEnrich={canUpdate} />
          )}
          {tab === 'customFields' && (
            <CustomFieldsSection
              entityType="contact"
              customFields={contact.customFields}
              canUpdate={canUpdate}
              isSaving={updateContact.isPending}
              onSave={(customFields) => updateContact.mutate({ customFields })}
            />
          )}
          {tab === 'history' && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-bold text-slate-950">Field change history</h3>
              <FieldHistory objectType="contact" objectId={contact.id} />
            </div>
          )}
          {tab === 'deals' && <DealsTab data={dealsQuery.data} isLoading={dealsQuery.isLoading} />}
          {tab === 'relatedAccounts' && (
            <RelatedAccountsTab data={relatedAccountsQuery.data} isLoading={relatedAccountsQuery.isLoading} isError={relatedAccountsQuery.isError} />
          )}
          {tab === 'quotes' && (
            <RecordsTab
              rows={paginatedRows(quotesQuery.data)}
              isLoading={quotesQuery.isLoading}
              emptyTitle="No CPQ quotes"
              emptyDescription="RFQ conversions and CPQ quotes linked to this contact will appear here."
            />
          )}
          {tab === 'activities' && <ActivitiesTab data={activitiesQuery.data} isLoading={activitiesQuery.isLoading} />}
          {tab === 'timeline' && (
            <RecordsTab
              showTypeIcon
              rows={timelineQuery.data?.events ?? []}
              isLoading={timelineQuery.isLoading}
              emptyTitle="No timeline events"
              emptyDescription="Audit, mail, documents, activities, and field changes will appear here."
            />
          )}
          {tab === 'documents' && (
            <RecordsTab rows={documentsQuery.data ?? []} isLoading={documentsQuery.isLoading} emptyTitle="No documents" emptyDescription="Attach documents to this contact to build the complete customer record." />
          )}
          {tab === 'mail' && (
            <RecordsTab rows={mailQuery.data ?? []} isLoading={mailQuery.isLoading} emptyTitle="No mail threads" emptyDescription="Connected email conversations will appear here." />
          )}
          {tab === 'fieldHistory' && (
            <RecordsTab rows={fieldHistoryQuery.data ?? []} isLoading={fieldHistoryQuery.isLoading} emptyTitle="No field history" emptyDescription="Every governed field change is tracked here." />
          )}
          {tab === 'audit' && (
            <RecordsTab rows={auditQuery.data ?? []} isLoading={auditQuery.isLoading} emptyTitle="No audit events" emptyDescription="Audit events will appear here." />
          )}
          {tab === 'outbox' && (
            <RecordsTab rows={outboxQuery.data ?? []} isLoading={outboxQuery.isLoading} emptyTitle="No outbox events" emptyDescription="Integration and webhook events will appear here." />
          )}
          {tab === 'consent' && <ConsentTab data={consentsQuery.data} isLoading={consentsQuery.isLoading} />}
        </div>
      </section>

      {editOpen ? (
        <EditContactModal
          contact={contact}
          whatsapp={whatsapp}
          secondPhone={secondPhone}
          lifecycle={lifecycle}
          productTags={productTags}
          industryTags={industryTags}
          isSaving={updateContact.isPending}
          onClose={() => setEditOpen(false)}
          onSave={(payload) => updateContact.mutate(payload)}
        />
      ) : null}

      {documentOpen ? (
        <DocumentUploadModal
          isSaving={uploadDocument.isPending}
          onClose={() => setDocumentOpen(false)}
          onUpload={(payload) => uploadDocument.mutate(payload)}
        />
      ) : null}
    </div>
  );
}

function ContactOverviewTab({
  contact,
  ownerName,
  whatsapp,
  secondPhone,
  lifecycle,
  buyingCommitteeRole,
  influenceLevel,
}: {
  contact: Contact;
  ownerName: string;
  whatsapp: string;
  secondPhone: string;
  lifecycle: string;
  buyingCommitteeRole: string;
  influenceLevel: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <InfoCard title="Identity" icon={<UserRound className="h-4 w-4" />}>
        <DetailItem label="Name" value={`${contact.firstName} ${contact.lastName}`} />
        <DetailItem label="Job title" value={contact.jobTitle ?? 'Not set'} />
        <DetailItem label="Department" value={contact.department ?? 'Not set'} />
        <DetailItem label="Lifecycle" value={lifecycle} />
        <DetailItem label="Owner" value={ownerName} />
      </InfoCard>

      <InfoCard title="Communication" icon={<Phone className="h-4 w-4" />}>
        <DetailItem label="Email" value={contact.email ?? 'Not set'} />
        <DetailItem label="Phone" value={contact.phone ?? 'Not set'} />
        <DetailItem label="Mobile" value={contact.mobile ?? 'Not set'} />
        <DetailItem label="WhatsApp" value={whatsapp || 'Not set'} />
        <DetailItem label="Second phone" value={secondPhone || 'Not set'} />
        <DetailItem label="Preferred channel" value={contact.preferredChannel ?? 'Email'} />
      </InfoCard>

      <InfoCard title="Social & location" icon={<MapPin className="h-4 w-4" />}>
        <DetailItem
          label="LinkedIn"
          value={
            contact.linkedInUrl ? (
              <a href={contact.linkedInUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">
                {contact.linkedInUrl}
              </a>
            ) : (
              'Not set'
            )
          }
        />
        <DetailItem label="Twitter / X" value={contact.twitterHandle ?? 'Not set'} />
        <DetailItem label="Address" value={[contact.address, contact.city, contact.country].filter(Boolean).join(', ') || 'Not set'} />
        <DetailItem label="Timezone" value={contact.timezone ?? 'Not set'} />
        <DetailItem label="Account" value={contact.accountId ? <Link href={`/accounts/${contact.accountId}`} className="font-semibold text-blue-700 hover:underline">{contact.accountId}</Link> : 'Unassigned'} />
      </InfoCard>

      <InfoCard title="Consent & controls" icon={<ShieldCheck className="h-4 w-4" />}>
        <DetailItem label="GDPR consent" value={contact.gdprConsent ? 'Captured' : 'Missing'} />
        <DetailItem label="Do not email" value={contact.doNotEmail ? 'Yes' : 'No'} />
        <DetailItem label="Do not call" value={contact.doNotCall ? 'Yes' : 'No'} />
        <DetailItem label="Created" value={formatDate(contact.createdAt)} />
        <DetailItem label="Updated" value={formatDate(contact.updatedAt)} />
      </InfoCard>

      <InfoCard title="Relationship" icon={<Route className="h-4 w-4" />}>
        <DetailItem label="Buying role" value={buyingCommitteeRole} />
        <DetailItem label="Influence" value={influenceLevel} />
        <DetailItem label="Tags" value={contact.tags.length ? contact.tags.join(', ') : 'None'} />
      </InfoCard>
    </div>
  );
}

function EditContactModal({
  contact,
  whatsapp,
  secondPhone,
  lifecycle,
  productTags,
  industryTags,
  isSaving,
  onClose,
  onSave,
}: {
  contact: Contact;
  whatsapp: string;
  secondPhone: string;
  lifecycle: string;
  productTags: string[];
  industryTags: string[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    mobile: contact.mobile ?? '',
    whatsapp,
    secondPhone,
    jobTitle: contact.jobTitle ?? '',
    department: contact.department ?? '',
    lifecycleStage: lifecycle,
    preferredChannel: contact.preferredChannel ?? 'email',
    linkedInUrl: contact.linkedInUrl ?? '',
    twitterHandle: contact.twitterHandle ?? '',
    country: contact.country ?? '',
    city: contact.city ?? '',
    address: contact.address ?? '',
    productTags: productTags.join(', '),
    industryTags: industryTags.join(', '),
    tags: contact.tags.join(', '),
    gdprConsent: contact.gdprConsent,
    doNotEmail: contact.doNotEmail,
    doNotCall: contact.doNotCall,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      mobile: form.mobile.trim() || undefined,
      jobTitle: form.jobTitle.trim() || undefined,
      department: form.department.trim() || undefined,
      preferredChannel: form.preferredChannel.trim() || undefined,
      linkedInUrl: form.linkedInUrl.trim() || undefined,
      twitterHandle: form.twitterHandle.trim() || undefined,
      country: form.country.trim() || undefined,
      city: form.city.trim() || undefined,
      address: form.address.trim() || undefined,
      gdprConsent: form.gdprConsent,
      doNotEmail: form.doNotEmail,
      doNotCall: form.doNotCall,
      tags: splitCsv(form.tags),
      customFields: {
        ...contact.customFields,
        whatsapp: form.whatsapp.trim(),
        secondPhone: form.secondPhone.trim(),
        lifecycleStage: form.lifecycleStage.trim(),
        productTags: splitCsv(form.productTags),
        industryTags: splitCsv(form.industryTags),
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
      <button type="button" aria-label="Close edit panel" className="flex-1" onClick={onClose} />
      <form onSubmit={submit} className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Edit contact</h2>
            <p className="text-sm text-slate-500">Role-controlled changes are tracked in field history and audit.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <FormSection title="Identity">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="First name" value={form.firstName} onChange={(value) => setForm({ ...form, firstName: value })} required />
              <Input label="Last name" value={form.lastName} onChange={(value) => setForm({ ...form, lastName: value })} required />
              <Input label="Job title" value={form.jobTitle} onChange={(value) => setForm({ ...form, jobTitle: value })} />
              <Input label="Department" value={form.department} onChange={(value) => setForm({ ...form, department: value })} />
            </div>
          </FormSection>
          <FormSection title="Communication">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
              <Input label="Primary phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              <Input label="Mobile" value={form.mobile} onChange={(value) => setForm({ ...form, mobile: value })} />
              <Input label="WhatsApp" value={form.whatsapp} onChange={(value) => setForm({ ...form, whatsapp: value })} />
              <Input label="Second phone" value={form.secondPhone} onChange={(value) => setForm({ ...form, secondPhone: value })} />
              <Input label="Preferred channel" value={form.preferredChannel} onChange={(value) => setForm({ ...form, preferredChannel: value })} />
            </div>
          </FormSection>
          <FormSection title="Lifecycle and tags">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lifecycle stage</span>
                <select
                  value={form.lifecycleStage}
                  onChange={(event) => setForm({ ...form, lifecycleStage: event.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border-slate-200 text-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  {['New relationship', 'Business champion', 'Technical evaluator', 'Executive sponsor', 'Dormant', 'Archived'].map((stage) => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </label>
              <Input label="General tags" value={form.tags} onChange={(value) => setForm({ ...form, tags: value })} />
              <Input label="Product tags" value={form.productTags} onChange={(value) => setForm({ ...form, productTags: value })} />
              <Input label="Industry tags" value={form.industryTags} onChange={(value) => setForm({ ...form, industryTags: value })} />
            </div>
          </FormSection>
          <FormSection title="Address and social">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="LinkedIn URL" value={form.linkedInUrl} onChange={(value) => setForm({ ...form, linkedInUrl: value })} />
              <Input label="Twitter / X handle" value={form.twitterHandle} onChange={(value) => setForm({ ...form, twitterHandle: value })} />
              <Input label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} />
              <Input label="City" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
            </div>
            <Input label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
          </FormSection>
          <FormSection title="Consent controls">
            <div className="grid gap-2">
              <Checkbox label="GDPR consent captured" checked={form.gdprConsent} onChange={(value) => setForm({ ...form, gdprConsent: value })} />
              <Checkbox label="Do not email" checked={form.doNotEmail} onChange={(value) => setForm({ ...form, doNotEmail: value })} />
              <Checkbox label="Do not call" checked={form.doNotCall} onChange={(value) => setForm({ ...form, doNotCall: value })} />
            </div>
          </FormSection>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSaving}>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}

function DocumentUploadModal({
  isSaving,
  onClose,
  onUpload,
}: {
  isSaving: boolean;
  onClose: () => void;
  onUpload: (payload: Record<string, unknown>) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('General');
  const [retentionCategory, setRetentionCategory] = useState('customer-record');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      notify.error('Select a document', 'Choose a file before uploading.');
      return;
    }
    onUpload({
      name: file.name,
      type,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      storageKey: `contacts/${Date.now()}-${file.name.replace(/\s+/g, '-')}`,
      retentionCategory,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Upload contact document</h2>
            <p className="text-sm text-slate-500">The attachment is added to the contact record and audit trail.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center hover:border-blue-300 hover:bg-blue-50">
            <Upload className="h-8 w-8 text-blue-600" />
            <span className="mt-3 text-sm font-bold text-slate-900">{file ? file.name : 'Choose document'}</span>
            <span className="mt-1 text-xs text-slate-500">{file ? `${Math.round(file.size / 1024)} KB` : 'PDF, DOCX, XLSX, image, or archive'}</span>
            <input type="file" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Document type" value={type} onChange={setType} />
            <Input label="Retention category" value={retentionCategory} onChange={setRetentionCategory} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSaving}>
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        </div>
      </form>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-100 p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-950">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border-slate-200 text-sm focus:border-blue-500 focus:ring-blue-500"
      />
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
    </label>
  );
}

function splitCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 text-sm">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="min-w-0 text-slate-700">{value}</dd>
    </div>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
        <span className="text-blue-600">{icon}</span>
        {title}
      </div>
      <dl className="space-y-3">{children}</dl>
    </div>
  );
}

function TagCloud({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      {values.length === 0 ? (
        <p className="text-sm text-slate-500">None</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span key={value} className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniFeed({
  title,
  icon,
  rows,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Record<string, unknown>[];
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
        <span className="text-blue-600">{icon}</span>
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 4).map((row) => (
            <div key={String(row.id ?? row.name ?? row.subject ?? row.action)} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-800">
                {String(row.subject ?? row.name ?? row.action ?? 'Record')}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {String(row.type ?? row.actor ?? row.from ?? 'System')} - {formatDate(String(row.updatedAt ?? row.lastMessageAt ?? row.at ?? new Date().toISOString()))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

function customRecord(contact: Contact, key: string) {
  const value = contact.customFields?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function paginatedRows(value: Record<string, unknown> | undefined) {
  const data = value?.data;
  return Array.isArray(data)
    ? data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function customNumber(contact: Contact, key: string) {
  const value = contact.customFields?.[key];
  return typeof value === 'number' ? value : 0;
}

function slaTone(status: string) {
  if (status === 'healthy') return 'bg-emerald-50 text-emerald-700';
  if (status === 'watch') return 'bg-amber-50 text-amber-700';
  if (status === 'breached') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

function DealsTab({ data, isLoading }: { data: { data: Deal[]; total: number } | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
  const deals = data?.data ?? [];
  if (deals.length === 0) {
    return <EmptyState icon="Deals" title="No deals" description="This contact is not associated with any deals." />;
  }
  return (
    <div className="space-y-3">
      {deals.map((d) => (
        <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <Link href={`/deals/${d.id}`} className="text-sm font-medium text-slate-900 hover:underline">
              {d.name}
            </Link>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{d.status}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {d.amount} {d.currency}
          </p>
        </div>
      ))}
    </div>
  );
}

function RelatedAccountsTab({
  data,
  isLoading,
  isError,
}: {
  data: RelatedAccount[] | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Related accounts could not be loaded right now.
      </div>
    );
  }
  const relations = data ?? [];
  if (relations.length === 0) {
    return (
      <EmptyState
        icon="🏢"
        title="No related accounts"
        description="This contact is not linked to any account through the buying-committee layer."
      />
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        This contact influences {relations.length} account{relations.length === 1 ? '' : 's'} across the buying-committee layer — they are not bound to a single account.
      </p>
      {relations.map((r) => (
        <Link
          key={r.id}
          href={`/accounts/${r.accountId}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-200 hover:bg-blue-50/30"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{r.account.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">{r.account.industry ?? 'Industry not set'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {r.isPrimary ? (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                Primary
              </span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{r.role}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ActivitiesTab({ data, isLoading }: { data: PaginatedResult<Activity> | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
  const items = data?.data ?? [];
  if (items.length === 0) {
    return <EmptyState icon="Activities" title="No activities" description="No activities linked to this contact." />;
  }
  return (
    <div className="space-y-3">
      {items.map((a) => (
        <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{a.subject}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{a.status}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {a.type} - {a.dueDate ? formatDate(a.dueDate) : 'No due date'}
          </p>
        </div>
      ))}
    </div>
  );
}

function RecordsTab({
  rows,
  isLoading,
  emptyTitle,
  emptyDescription,
  showTypeIcon,
}: {
  rows: Array<Record<string, unknown>>;
  isLoading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  showTypeIcon?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState icon="Records" title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={String(row.id ?? row.title ?? row.name ?? row.subject ?? row.action)} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
              {showTypeIcon ? timelineMeta(row).icon : null}
              {String(row.title ?? row.subject ?? row.name ?? row.action ?? row.topic ?? row.field ?? (showTypeIcon ? timelineMeta(row).label : 'Record'))}
            </p>
            {row.status ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {String(row.status)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {String(row.type ?? row.actor ?? row.from ?? row.aggregateType ?? row.channel ?? 'Contact record')} -{' '}
            {formatDate(String(row.at ?? row.updatedAt ?? row.lastMessageAt ?? row.createdAt ?? new Date().toISOString()))}
          </p>
          {row.description || row.meta || row.payload ? (
            <p className="mt-2 text-sm text-slate-600">
              {String(row.description ?? row.meta ?? JSON.stringify(row.payload))}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ConsentTab({ data, isLoading }: { data: { data: ConsentRecord[] } | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
  const records = data?.data ?? [];
  if (records.length === 0) {
    return <EmptyState icon="Consent" title="No consent records" description="Consent preferences will appear here." />;
  }
  return (
    <div className="space-y-3">
      {records.map((r) => (
        <div key={r.channel} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{r.channel}</p>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                r.granted ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              )}
            >
              {r.granted ? 'Granted' : 'Denied'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Updated {formatDate(r.updatedAt)}</p>
        </div>
      ))}
    </div>
  );
}
