'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Account, AccountHealthInsight, Contact, Deal, PaginatedResult, TimelineEvent } from '@nexus/shared-types';
import type { UpdateAccountInput } from '@nexus/validation';
import {
  ArrowLeft,
  BadgeDollarSign,
  Building2,
  Edit3,
  FileText,
  Globe2,
  Landmark,
  MapPin,
  PackageCheck,
  Phone,
  ShieldCheck,
  Tag,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useAccount,
  useAccountContacts,
  useAccountDeals,
  useAccountHealth,
  useAccountOrders,
  useAccountQuotes,
  useUpdateAccount,
} from '@/hooks/use-accounts';
import { useUsers } from '@/hooks/use-users';
import { DetailQuickActions } from '@/components/crm/DetailQuickActions';
import { FollowButton } from '@/components/crm/FollowButton';
import { EnrichmentPanel } from '@/components/crm/EnrichmentPanel';
import { CustomFieldsSection } from '@/components/crm/CustomFieldsSection';
import { FieldHistory } from '@/components/crm/FieldHistory';
import { BuyingCommittee } from '@/components/crm/BuyingCommittee';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { useRealtimeAccount } from '@/hooks/use-realtime';
import { ComposeEmailButton } from '@/components/communications/ComposeEmailButton';

type AccountTab =
  | 'overview'
  | 'enrichment'
  | 'customFields'
  | 'timeline'
  | 'contacts'
  | 'committee'
  | 'deals'
  | 'quotes'
  | 'orders'
  | 'documents'
  | 'hierarchy'
  | 'governance'
  | 'history'
  | 'fieldHistory'
  | 'audit'
  | 'outbox'
  | 'duplicates';

interface HierarchyNode {
  id: string;
  name: string;
  children?: HierarchyNode[];
}

interface HierarchyRollup {
  totalRevenue?: number;
  totalEmployees?: number;
  contactCount?: number;
  avgHealth?: number;
  totalDealValue?: number;
  openDealCount?: number;
  wonDealValue?: number;
}

interface HierarchyResponse extends HierarchyNode {
  rollup?: HierarchyRollup;
}

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;
  const [tab, setTab] = useState<AccountTab>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isDevPreview = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== 'false';
  const canRead = hasPermission('accounts:read') || isDevPreview;
  const canUpdate = hasPermission('accounts:update') || isDevPreview;
  const accountQuery = useAccount(accountId);
  const contactsQuery = useAccountContacts(accountId);
  const dealsQuery = useAccountDeals(accountId);
  const quotesQuery = useAccountQuotes(accountId);
  const ordersQuery = useAccountOrders(accountId);
  const healthQuery = useAccountHealth(accountId);
  const usersQuery = useUsers({ limit: 100 });
  const updateAccount = useUpdateAccount();
  useRealtimeAccount(accountId);

  const timelineQuery = useQuery<PaginatedResult<TimelineEvent>>({
    queryKey: ['accounts', accountId, 'timeline'],
    queryFn: () => api.get<PaginatedResult<TimelineEvent>>(`/accounts/${accountId}/timeline`),
    enabled: Boolean(accountId) && tab === 'timeline',
  });
  const hierarchyQuery = useQuery<HierarchyResponse>({
    queryKey: ['accounts', accountId, 'hierarchy'],
    queryFn: () => api.get<HierarchyResponse>(`/accounts/${accountId}/hierarchy`),
    enabled: Boolean(accountId) && tab === 'hierarchy',
  });
  const documentsQuery = useQuery<Record<string, unknown>[]>({
    queryKey: ['accounts', accountId, 'attachments'],
    queryFn: () => api.get<Record<string, unknown>[]>(`/accounts/${accountId}/attachments`),
    enabled: Boolean(accountId) && tab === 'documents',
  });
  const fieldHistoryQuery = useQuery<Record<string, unknown>[]>({
    queryKey: ['accounts', accountId, 'field-history'],
    queryFn: () => api.get<Record<string, unknown>[]>(`/accounts/${accountId}/field-history`),
    enabled: Boolean(accountId) && tab === 'fieldHistory',
  });
  const auditQuery = useQuery<Record<string, unknown>[]>({
    queryKey: ['accounts', accountId, 'audit'],
    queryFn: () => api.get<Record<string, unknown>[]>(`/accounts/${accountId}/audit`),
    enabled: Boolean(accountId) && tab === 'audit',
  });
  const outboxQuery = useQuery<Record<string, unknown>[]>({
    queryKey: ['accounts', accountId, 'outbox'],
    queryFn: () => api.get<Record<string, unknown>[]>(`/accounts/${accountId}/outbox`),
    enabled: Boolean(accountId) && tab === 'outbox',
  });
  const duplicatesQuery = useQuery<Record<string, unknown>[]>({
    queryKey: ['accounts', accountId, 'duplicates'],
    queryFn: () => api.get<Record<string, unknown>[]>(`/accounts/${accountId}/duplicates`),
    enabled: Boolean(accountId) && tab === 'duplicates',
  });
  const uploadDocument = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await fileToBase64(file);
      return api.post(`/accounts/${accountId}/attachments`, {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', accountId, 'attachments'] }),
  });

  const account = accountQuery.data;
  const health = healthQuery.data;

  if (!canRead) {
    return (
      <div className="px-6 py-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You do not have permission to view accounts.
        </div>
      </div>
    );
  }

  if (accountQuery.isLoading) {
    return (
      <div className="space-y-4 px-6 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (accountQuery.isError || !account) {
    return (
      <div className="px-6 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load account: {accountQuery.error instanceof Error ? accountQuery.error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  const ownerFromList = (usersQuery.data?.data ?? []).find((u) => u.id === account.ownerId);
  const ownerName = ownerFromList
    ? `${ownerFromList.firstName ?? ''} ${ownerFromList.lastName ?? ''}`.trim() || ownerFromList.email || account.ownerId
    : account.ownerId;

  const tabs: { id: AccountTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'enrichment', label: 'Enrichment' },
    { id: 'customFields', label: 'Custom Fields' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'quotes', label: 'CPQ Quotes' },
    { id: 'orders', label: 'Orders' },
    { id: 'documents', label: 'Documents' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'committee', label: 'Buying Committee' },
    { id: 'deals', label: 'Deals' },
    { id: 'hierarchy', label: 'Hierarchy' },
    { id: 'governance', label: 'Governance' },
    { id: 'history', label: 'History' },
    { id: 'fieldHistory', label: 'Field History' },
    { id: 'audit', label: 'Audit' },
    { id: 'outbox', label: 'Outbox' },
    { id: 'duplicates', label: 'Duplicates' },
  ];

  return (
    <div className="space-y-6 bg-slate-50 px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => router.push('/accounts')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to accounts
            </button>
            <div className="relative flex flex-wrap items-center gap-2">
              <FollowButton entityType="account" entityId={account.id} />
              {canUpdate ? (
                <>
                <Button variant="secondary" onClick={() => setEditOpen((open) => !open)}>
                  <Edit3 className="h-4 w-4" />
                  Edit Account
                </Button>
                <DetailQuickActions
                  accountId={account.id}
                  invalidateKeys={[['accounts', accountId, 'timeline']]}
                />
                <ComposeEmailButton
                  entityType="account"
                  entityId={account.id}
                  to={(account as { email?: string }).email}
                />
                <Button
                  onClick={() =>
                    updateAccount.mutate({
                      id: account.id,
                      data: { customFields: { ...(account.customFields ?? {}), reviewedAt: new Date().toISOString() } },
                    })
                  }
                >
                  <ShieldCheck className="h-4 w-4" />
                  Mark Reviewed
                </Button>
                </>
              ) : (
                <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  Editing is restricted by role permissions.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-100 bg-white p-5">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-indigo-700">{account.code ?? account.id}</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">{account.name}</h1>
              <p className="mt-1 text-sm text-slate-500">{account.legalName ?? account.tradeName ?? 'Legal name not captured'}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge>{account.type}</Badge>
                <Badge>{account.tier}</Badge>
                <Badge tone={account.status === 'AT_RISK' ? 'amber' : account.status === 'CHURNED' ? 'rose' : 'emerald'}>{account.status}</Badge>
              </div>
            </div>

            <InfoCard title="Health" icon={<ShieldCheck className="h-4 w-4" />}>
              <HealthBlock health={health} fallbackScore={account.healthScore} />
            </InfoCard>

            <InfoCard title="Commercial Controls" icon={<BadgeDollarSign className="h-4 w-4" />}>
              <DetailItem label="Payment terms" value={account.paymentTerms ?? 'Not set'} />
              <DetailItem label="Credit limit" value={money(account.creditLimit, account.currency)} />
              <DetailItem label="Currency" value={account.currency ?? 'USD'} />
              <DetailItem label="Price book" value={account.priceBookId ?? 'Default'} />
              <DetailItem label="Territory" value={account.territoryId ?? 'Unassigned'} />
            </InfoCard>

            <InfoCard title="Tags" icon={<Tag className="h-4 w-4" />}>
              <TagCloud values={account.tags} />
            </InfoCard>
          </aside>

          <main className="space-y-6">
            {editOpen && (
              <AccountEditPanel
                account={account}
                isSaving={updateAccount.isPending}
                onCancel={() => setEditOpen(false)}
                onSave={(data) =>
                  updateAccount.mutate(
                    { id: account.id, data },
                    { onSuccess: () => setEditOpen(false) }
                  )
                }
              />
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <InfoCard title="Account Identity" icon={<Building2 className="h-4 w-4" />}>
                <DetailItem label="Account name" value={account.name} />
                <DetailItem label="Code" value={account.code ?? account.id} />
                <DetailItem label="Industry" value={[account.industry, account.subIndustry].filter(Boolean).join(' / ') || 'Not set'} />
                <DetailItem label="Lifecycle" value={account.lifecycleStage ?? 'Not set'} />
                <DetailItem label="Founded" value={account.foundedYear?.toString() ?? 'Not set'} />
                <DetailItem label="Employees" value={account.employeeCount?.toString() ?? 'Not set'} />
              </InfoCard>

              <InfoCard title="Communication" icon={<Phone className="h-4 w-4" />}>
                <DetailItem label="Email" value={account.email ?? 'Not set'} />
                <DetailItem label="Phone" value={account.phone ?? 'Not set'} />
                <DetailItem label="Fax" value={account.fax ?? 'Not set'} />
                <DetailItem label="Website" value={link(account.website)} />
                <DetailItem label="LinkedIn" value={link(account.linkedInUrl)} />
              </InfoCard>

              <InfoCard title="Billing Address" icon={<Landmark className="h-4 w-4" />}>
                <AddressBlock account={account} prefix="billing" />
              </InfoCard>

              <InfoCard title="Shipping Address" icon={<PackageCheck className="h-4 w-4" />}>
                <AddressBlock account={account} prefix="shipping" />
                <DetailItem label="Instructions" value={account.shippingInstructions ?? 'None'} />
              </InfoCard>

              <InfoCard title="Location" icon={<MapPin className="h-4 w-4" />}>
                <DetailItem label="Country" value={account.country ?? 'Not set'} />
                <DetailItem label="City" value={account.city ?? 'Not set'} />
                <DetailItem label="Main address" value={[account.address, account.zipCode].filter(Boolean).join(', ') || 'Not set'} />
                <DetailItem label="Coordinates" value={coordinates(account.lat, account.lng) || coordinates(account.billingLatitude, account.billingLongitude) || 'Not mapped'} />
              </InfoCard>

              <InfoCard title="Compliance" icon={<FileText className="h-4 w-4" />}>
                <DetailItem label="Tax ID" value={account.taxId ?? 'Not set'} />
                <DetailItem label="VAT" value={account.vatNumber ?? 'Not set'} />
                <DetailItem label="Commercial reg." value={account.commercialRegistrationNumber ?? 'Not set'} />
                <DetailItem label="SIC" value={account.sicCode ?? 'Not set'} />
                <DetailItem label="NAICS" value={account.naicsCode ?? 'Not set'} />
              </InfoCard>
            </div>
          </main>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Account Workspace</h2>
            <p className="mt-1 text-sm text-slate-500">Company master data connected to quotes, orders, contacts, and deals.</p>
          </div>
        </div>
        <div className="grid gap-2 border-b border-slate-200 px-6 py-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-semibold transition',
                tab === item.id
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="p-6">
          {tab === 'overview' && <OverviewTab account={account} health={health} ownerName={ownerName} />}
          {tab === 'enrichment' && (
            <EnrichmentPanel entityType="account" entityId={account.id} canEnrich={canUpdate} />
          )}
          {tab === 'customFields' && (
            <CustomFieldsSection
              entityType="account"
              customFields={account.customFields}
              canUpdate={canUpdate}
              isSaving={updateAccount.isPending}
              onSave={(customFields) => updateAccount.mutate({ id: account.id, data: { customFields } })}
            />
          )}
          {tab === 'history' && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-bold text-slate-950">Field change history</h3>
              <FieldHistory objectType="account" objectId={account.id} />
            </div>
          )}
          {tab === 'timeline' && (
            <TimelineTab
              data={timelineQuery.data}
              isLoading={timelineQuery.isLoading}
              isError={timelineQuery.isError}
            />
          )}
          {tab === 'quotes' && <CommercialTab icon="quote" rows={quotesQuery.data?.data ?? []} isLoading={quotesQuery.isLoading} empty="No quotes linked to this account." />}
          {tab === 'orders' && <CommercialTab icon="order" rows={ordersQuery.data?.data ?? []} isLoading={ordersQuery.isLoading} empty="No orders linked to this account." />}
          {tab === 'documents' && (
            <DocumentsTab
              rows={documentsQuery.data ?? []}
              isLoading={documentsQuery.isLoading}
              canUpdate={canUpdate}
              inputRef={documentInputRef}
              onUpload={(file) => uploadDocument.mutate(file)}
              isUploading={uploadDocument.isPending}
            />
          )}
          {tab === 'contacts' && <ContactsTab data={contactsQuery.data} isLoading={contactsQuery.isLoading} />}
          {tab === 'committee' && <BuyingCommittee accountId={account.id} canUpdate={canUpdate} />}
          {tab === 'deals' && <DealsTab data={dealsQuery.data} isLoading={dealsQuery.isLoading} />}
          {tab === 'hierarchy' && <HierarchyTab data={hierarchyQuery.data} isLoading={hierarchyQuery.isLoading} currency={account.currency} />}
          {tab === 'governance' && <GovernanceTab account={account} />}
          {tab === 'fieldHistory' && <RecordsTab rows={fieldHistoryQuery.data ?? []} isLoading={fieldHistoryQuery.isLoading} title="No field changes" icon="HIST" />}
          {tab === 'audit' && <RecordsTab rows={auditQuery.data ?? []} isLoading={auditQuery.isLoading} title="No audit events" icon="AUD" />}
          {tab === 'outbox' && <RecordsTab rows={outboxQuery.data ?? []} isLoading={outboxQuery.isLoading} title="No outbox events" icon="EVT" />}
          {tab === 'duplicates' && <RecordsTab rows={duplicatesQuery.data ?? []} isLoading={duplicatesQuery.isLoading} title="No duplicate accounts found" icon="DUP" />}
        </div>
      </section>
    </div>
  );
}

function OverviewTab({ account, health, ownerName }: { account: Account; health: AccountHealthInsight | undefined; ownerName: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <InfoCard title="Firmographics" icon={<Building2 className="h-4 w-4" />}>
        <DetailItem label="Industry" value={[account.industry, account.subIndustry].filter(Boolean).join(' / ') || 'Not set'} />
        <DetailItem label="Annual revenue" value={money(account.annualRevenue, account.currency)} />
        <DetailItem label="Employees" value={account.employeeCount?.toString() ?? 'Not set'} />
        <DetailItem label="Founded" value={account.foundedYear?.toString() ?? 'Not set'} />
        <DetailItem label="Lifecycle" value={account.lifecycleStage ?? 'Not set'} />
      </InfoCard>

      <InfoCard title="Web presence" icon={<Globe2 className="h-4 w-4" />}>
        <DetailItem label="Website" value={link(account.website)} />
        <DetailItem label="LinkedIn" value={link(account.linkedInUrl)} />
        <DetailItem label="Email" value={account.email ?? 'Not set'} />
        <DetailItem label="Phone" value={account.phone ?? 'Not set'} />
      </InfoCard>

      <InfoCard title="Ownership & risk" icon={<ShieldCheck className="h-4 w-4" />}>
        <DetailItem label="Owner" value={ownerName} />
        <DetailItem label="Health score" value={(health?.score ?? account.healthScore ?? 0).toString()} />
        <DetailItem label="Risk level" value={account.riskLevel ?? 'Not set'} />
        <DetailItem label="Status" value={account.status} />
        <DetailItem label="Tier" value={account.tier} />
        <DetailItem label="Last activity" value={account.lastActivityAt ? formatDate(account.lastActivityAt) : 'Not set'} />
      </InfoCard>

      <InfoCard title="Billing address" icon={<Landmark className="h-4 w-4" />}>
        <AddressBlock account={account} prefix="billing" />
      </InfoCard>

      <InfoCard title="Shipping address" icon={<PackageCheck className="h-4 w-4" />}>
        <AddressBlock account={account} prefix="shipping" />
      </InfoCard>

      <InfoCard title="Compliance" icon={<FileText className="h-4 w-4" />}>
        <DetailItem label="Tax ID" value={account.taxId ?? 'Not set'} />
        <DetailItem label="VAT" value={account.vatNumber ?? 'Not set'} />
        <DetailItem label="Commercial reg." value={account.commercialRegistrationNumber ?? 'Not set'} />
        <DetailItem label="SIC" value={account.sicCode ?? 'Not set'} />
        <DetailItem label="NAICS" value={account.naicsCode ?? 'Not set'} />
      </InfoCard>
    </div>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
        <span className="text-indigo-600">{icon}</span>
        {title}
      </div>
      <dl className="space-y-2 text-sm">{children}</dl>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-3">
      <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-slate-700">{value || 'Not set'}</dd>
    </div>
  );
}

function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'emerald' | 'amber' | 'rose' }) {
  const tones = {
    blue: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return <span className={cn('rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider', tones[tone])}>{children}</span>;
}

function HealthBlock({ health, fallbackScore }: { health: AccountHealthInsight | undefined; fallbackScore: number | null }) {
  const score = health?.score ?? fallbackScore ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold text-slate-950">{score}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{health?.status ?? 'UNKNOWN'}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      {(health?.factors ?? []).slice(0, 2).map((factor) => (
        <p key={factor.code} className="text-xs text-slate-500">
          {factor.label}: <span className="font-semibold text-slate-700">{String(factor.value)}</span>
        </p>
      ))}
    </div>
  );
}

function AddressBlock({ account, prefix }: { account: Account; prefix: 'billing' | 'shipping' }) {
  const capital = prefix === 'billing' ? 'Billing' : 'Shipping';
  return (
    <>
      <DetailItem label="Line 1" value={account[`${prefix}AddressLine1` as keyof Account] as string | null} />
      <DetailItem label="Line 2" value={account[`${prefix}AddressLine2` as keyof Account] as string | null} />
      <DetailItem label={`${capital} city`} value={account[`${prefix}City` as keyof Account] as string | null} />
      <DetailItem label="State" value={account[`${prefix}State` as keyof Account] as string | null} />
      <DetailItem label="Postal code" value={account[`${prefix}PostalCode` as keyof Account] as string | null} />
      <DetailItem label="Country" value={account[`${prefix}Country` as keyof Account] as string | null} />
    </>
  );
}

function CommercialTab({ rows, isLoading, empty, icon }: { rows: Record<string, unknown>[]; isLoading: boolean; empty: string; icon: 'quote' | 'order' }) {
  if (isLoading) return <Skeleton className="h-48" />;
  if (rows.length === 0) return <EmptyState icon={icon === 'quote' ? '📄' : '📦'} title={icon === 'quote' ? 'No quotes' : 'No orders'} description={empty} />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {rows.map((row) => (
        <div key={String(row.id)} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-bold text-indigo-700">{String(row.quoteNumber ?? row.orderNumber ?? row.id)}</p>
              <h3 className="mt-1 text-sm font-bold text-slate-950">{String(row.name ?? 'Commercial record')}</h3>
            </div>
            <Badge tone={String(row.status).includes('PENDING') ? 'amber' : 'blue'}>{String(row.status ?? 'OPEN')}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <DetailMini label="Total" value={money(row.total, row.currency)} />
            <DetailMini label="Currency" value={String(row.currency ?? 'USD')} />
            <DetailMini label="Deal" value={String(row.dealId ?? 'None')} />
            <DetailMini label="Updated" value={formatDate(String(row.updatedAt ?? row.createdAt ?? new Date().toISOString()))} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactsTab({ data, isLoading }: { data: PaginatedResult<Contact> | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-48" />;
  const contacts = data?.data ?? [];
  if (contacts.length === 0) return <EmptyState icon="👥" title="No contacts" description="No contacts linked to this account." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {contacts.map((contact) => (
        <Link key={contact.id} href={`/contacts/${contact.id}`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-200 hover:bg-indigo-50/30">
          <p className="text-sm font-bold text-slate-950">{contact.firstName} {contact.lastName}</p>
          <p className="mt-1 text-xs text-slate-500">{contact.jobTitle ?? 'Stakeholder'} · {contact.email ?? 'No email'}</p>
        </Link>
      ))}
    </div>
  );
}

function DealsTab({ data, isLoading }: { data: PaginatedResult<Deal> | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-48" />;
  const deals = data?.data ?? [];
  if (deals.length === 0) return <EmptyState icon="🤝" title="No deals" description="No deals linked to this account." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {deals.map((deal) => (
        <Link key={deal.id} href={`/deals/${deal.id}`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-200 hover:bg-indigo-50/30">
          <p className="text-sm font-bold text-slate-950">{deal.name}</p>
          <p className="mt-1 text-xs text-slate-500">{formatCurrency(deal.amount, deal.currency)} · {deal.probability}% · {deal.status}</p>
        </Link>
      ))}
    </div>
  );
}

function TimelineTab({
  data,
  isLoading,
  isError,
}: {
  data: PaginatedResult<TimelineEvent> | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Skeleton className="h-48" />;
  if (isError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        The account timeline could not be loaded right now.
      </div>
    );
  }
  const events = data?.data ?? [];
  if (events.length === 0) {
    return <EmptyState icon="🕑" title="No timeline events" description="Activities and notes for this account will appear here." />;
  }
  return (
    <div className="space-y-3">
      {events.map((evt) => (
        <div key={evt.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-bold text-slate-950">{evt.title}</p>
            <span className="text-xs text-slate-400">{formatDateTime(evt.at)}</span>
          </div>
          {evt.description ? <p className="mt-1 text-xs text-slate-500">{evt.description}</p> : null}
          <span className="mt-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{evt.type}</span>
        </div>
      ))}
    </div>
  );
}

function HierarchyTab({ data, isLoading, currency }: { data: HierarchyResponse | undefined; isLoading: boolean; currency?: string | null }) {
  if (isLoading) return <Skeleton className="h-48" />;
  const root = data;
  if (!root) return <EmptyState icon="🏢" title="No hierarchy" description="This account has no parent or child accounts." />;
  const rollup = root.rollup;
  return (
    <div className="space-y-6">
      {rollup ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RollupCard label="Total revenue" value={money(rollup.totalRevenue, currency)} />
          <RollupCard label="Total employees" value={rollup.totalEmployees != null ? rollup.totalEmployees.toLocaleString() : 'Not set'} />
          <RollupCard label="Contacts" value={rollup.contactCount != null ? rollup.contactCount.toLocaleString() : 'Not set'} />
          <RollupCard label="Avg. health" value={rollup.avgHealth != null ? `${Math.round(rollup.avgHealth)}` : 'Not set'} />
        </div>
      ) : null}
      <div>
        <h3 className="mb-3 text-sm font-bold text-slate-950">Account tree</h3>
        <HierarchyNodeItem node={root} depth={0} />
      </div>
    </div>
  );
}

function RollupCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function HierarchyNodeItem({ node, depth }: { node: HierarchyNode; depth: number }) {
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-slate-200 bg-white p-3" style={{ marginLeft: depth * 18 }}>
        <Link href={`/accounts/${node.id}`} className="text-sm font-bold text-slate-900 hover:underline">{node.name}</Link>
      </div>
      {node.children?.map((child) => <HierarchyNodeItem key={child.id} node={child} depth={depth + 1} />)}
    </div>
  );
}

function GovernanceTab({ account }: { account: Account }) {
  const fields = account.customFields ?? {};
  const rows = [
    ['Owner', account.ownerId],
    ['Risk level', account.riskLevel ?? 'Not set'],
    ['Last activity', account.lastActivityAt ? formatDate(account.lastActivityAt) : 'Not set'],
    ['Data source', String(fields.source ?? 'CRM')],
    ['Buying center', String(fields.buyingCenter ?? 'Not set')],
    ['Compliance profile', String(fields.complianceProfile ?? 'Not set')],
    ['Reviewed at', String(fields.reviewedAt ?? 'Not reviewed')],
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({
  rows,
  isLoading,
  canUpdate,
  inputRef,
  onUpload,
  isUploading,
}: {
  rows: Record<string, unknown>[];
  isLoading: boolean;
  canUpdate: boolean;
  inputRef: RefObject<HTMLInputElement>;
  onUpload: (file: File) => void;
  isUploading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-48" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">Account documents</h3>
          <p className="mt-1 text-xs text-slate-500">Contracts, tax records, commercial registration, shipping files, and account evidence.</p>
        </div>
        {canUpdate && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.currentTarget.value = '';
              }}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={isUploading}>
              <UploadCloud className="h-4 w-4" />
              {isUploading ? 'Uploading' : 'Upload Document'}
            </Button>
          </>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="DOC" title="No account documents" description="Upload account documents to keep the company record complete." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <div key={String(row.id ?? row.fileName)} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-950">{String(row.fileName ?? row.name ?? 'Document')}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {String(row.mimeType ?? row.type ?? 'file')} · {formatFileSize(row.fileSize ?? row.size)}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">Uploaded {formatDate(String(row.createdAt ?? row.updatedAt ?? new Date().toISOString()))}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordsTab({ rows, isLoading, title, icon }: { rows: Record<string, unknown>[]; isLoading: boolean; title: string; icon: string }) {
  if (isLoading) return <Skeleton className="h-48" />;
  if (rows.length === 0) return <EmptyState icon={icon} title={title} description="No records were found for this account." />;
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={String(row.id ?? index)} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-950">{String(row.description ?? row.type ?? row.eventType ?? row.fieldName ?? row.name ?? 'Record')}</p>
              <p className="mt-1 text-xs text-slate-500">
                {String(row.actorName ?? row.changedByName ?? row.status ?? row.score ?? 'System')} · {formatDate(String(row.createdAt ?? row.changedAt ?? row.updatedAt ?? new Date().toISOString()))}
              </p>
            </div>
            {row.score ? <Badge tone={Number(row.score) >= 70 ? 'amber' : 'blue'}>{String(row.score)}%</Badge> : null}
          </div>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {JSON.stringify(row.metadata ?? row.payload ?? row.duplicateSignals ?? row, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

function AccountEditPanel({
  account,
  isSaving,
  onCancel,
  onSave,
}: {
  account: Account;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (data: UpdateAccountInput) => void;
}) {
  return (
    <form
      className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const data: UpdateAccountInput = {
          name: text(form, 'name'),
          legalName: text(form, 'legalName'),
          tradeName: text(form, 'tradeName'),
          code: text(form, 'code'),
          industry: text(form, 'industry'),
          subIndustry: text(form, 'subIndustry'),
          lifecycleStage: text(form, 'lifecycleStage'),
          email: text(form, 'email'),
          phone: text(form, 'phone'),
          fax: text(form, 'fax'),
          website: text(form, 'website'),
          linkedInUrl: text(form, 'linkedInUrl'),
          taxId: text(form, 'taxId'),
          vatNumber: text(form, 'vatNumber'),
          commercialRegistrationNumber: text(form, 'commercialRegistrationNumber'),
          paymentTerms: text(form, 'paymentTerms'),
          currency: text(form, 'currency'),
          priceBookId: text(form, 'priceBookId'),
          territoryId: text(form, 'territoryId'),
          riskLevel: riskValue(form, 'riskLevel'),
          creditLimit: numberValue(form, 'creditLimit'),
          annualRevenue: numberValue(form, 'annualRevenue'),
          employeeCount: numberValue(form, 'employeeCount'),
          foundedYear: numberValue(form, 'foundedYear'),
          billingAddressLine1: text(form, 'billingAddressLine1'),
          billingAddressLine2: text(form, 'billingAddressLine2'),
          billingCity: text(form, 'billingCity'),
          billingState: text(form, 'billingState'),
          billingPostalCode: text(form, 'billingPostalCode'),
          billingCountry: text(form, 'billingCountry'),
          shippingAddressLine1: text(form, 'shippingAddressLine1'),
          shippingAddressLine2: text(form, 'shippingAddressLine2'),
          shippingCity: text(form, 'shippingCity'),
          shippingState: text(form, 'shippingState'),
          shippingPostalCode: text(form, 'shippingPostalCode'),
          shippingCountry: text(form, 'shippingCountry'),
          shippingInstructions: text(form, 'shippingInstructions'),
          tags: text(form, 'tags')?.split(',').map((tag) => tag.trim()).filter(Boolean),
        };
        onSave(data);
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-950">Edit account master data</h2>
          <p className="mt-1 text-xs text-slate-500">Role-controlled changes are audited and feed duplicate checks, account health, quotes, and orders.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving' : 'Save Changes'}</Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <EditField label="Account name" name="name" value={account.name} required />
        <EditField label="Account code" name="code" value={account.code} />
        <EditField label="Legal name" name="legalName" value={account.legalName} />
        <EditField label="Trade name" name="tradeName" value={account.tradeName} />
        <EditField label="Industry" name="industry" value={account.industry} />
        <EditField label="Sub industry" name="subIndustry" value={account.subIndustry} />
        <EditField label="Lifecycle" name="lifecycleStage" value={account.lifecycleStage} />
        <EditField label="Email" name="email" value={account.email} />
        <EditField label="Phone" name="phone" value={account.phone} />
        <EditField label="Fax" name="fax" value={account.fax} />
        <EditField label="Website" name="website" value={account.website} />
        <EditField label="LinkedIn" name="linkedInUrl" value={account.linkedInUrl} />
        <EditField label="Tax ID" name="taxId" value={account.taxId} />
        <EditField label="VAT number" name="vatNumber" value={account.vatNumber} />
        <EditField label="Commercial reg." name="commercialRegistrationNumber" value={account.commercialRegistrationNumber} />
        <EditField label="Payment terms" name="paymentTerms" value={account.paymentTerms} />
        <EditField label="Credit limit" name="creditLimit" value={account.creditLimit} type="number" />
        <EditField label="Currency" name="currency" value={account.currency ?? 'USD'} />
        <EditField label="Price book" name="priceBookId" value={account.priceBookId} />
        <EditField label="Territory" name="territoryId" value={account.territoryId} />
        <EditField label="Risk level" name="riskLevel" value={account.riskLevel} />
        <EditField label="Annual revenue" name="annualRevenue" value={account.annualRevenue} type="number" />
        <EditField label="Employees" name="employeeCount" value={account.employeeCount} type="number" />
        <EditField label="Founded year" name="foundedYear" value={account.foundedYear} type="number" />
        <EditField label="Billing line 1" name="billingAddressLine1" value={account.billingAddressLine1} />
        <EditField label="Billing line 2" name="billingAddressLine2" value={account.billingAddressLine2} />
        <EditField label="Billing city" name="billingCity" value={account.billingCity} />
        <EditField label="Billing state" name="billingState" value={account.billingState} />
        <EditField label="Billing postal" name="billingPostalCode" value={account.billingPostalCode} />
        <EditField label="Billing country" name="billingCountry" value={account.billingCountry} />
        <EditField label="Shipping line 1" name="shippingAddressLine1" value={account.shippingAddressLine1} />
        <EditField label="Shipping line 2" name="shippingAddressLine2" value={account.shippingAddressLine2} />
        <EditField label="Shipping city" name="shippingCity" value={account.shippingCity} />
        <EditField label="Shipping state" name="shippingState" value={account.shippingState} />
        <EditField label="Shipping postal" name="shippingPostalCode" value={account.shippingPostalCode} />
        <EditField label="Shipping country" name="shippingCountry" value={account.shippingCountry} />
        <EditField label="Shipping instructions" name="shippingInstructions" value={account.shippingInstructions} />
        <EditField label="Tags" name="tags" value={account.tags.join(', ')} />
      </div>
    </form>
  );
}

function EditField({ label, name, value, type = 'text', required = false }: { label: string; name: string; value: unknown; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={value === null || value === undefined ? '' : String(value)}
        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function DetailMini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 min-w-0 break-words font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function TagCloud({ values }: { values: string[] }) {
  if (!values.length) return <p className="text-sm text-slate-500">No tags</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => <span key={value} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{value}</span>)}
    </div>
  );
}

function link(value: string | null | undefined) {
  if (!value) return 'Not set';
  return (
    <a href={value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline">
      <Globe2 className="h-3.5 w-3.5" />
      {value}
    </a>
  );
}

function money(value: unknown, currency: unknown = 'USD') {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 'Not set';
  return formatCurrency(n, String(currency ?? 'USD'));
}

function formatFileSize(value: unknown) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'size unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function text(form: FormData, name: string) {
  const value = String(form.get(name) ?? '').trim();
  return value || undefined;
}

function numberValue(form: FormData, name: string) {
  const raw = text(form, name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function riskValue(form: FormData, name: string) {
  const raw = text(form, name)?.toUpperCase();
  if (raw === 'LOW' || raw === 'MEDIUM' || raw === 'HIGH' || raw === 'CRITICAL') return raw;
  return undefined;
}

function coordinates(lat: unknown, lng: unknown) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '';
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
