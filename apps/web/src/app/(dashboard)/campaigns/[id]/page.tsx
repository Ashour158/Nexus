'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  FileText,
  Megaphone,
  Plus,
  Send,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { notify } from '@/lib/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  useAddCampaignMembers,
  useCampaign,
  useCampaignMembers,
  useCampaignMetrics,
  useChangeCampaignStatus,
  useDeleteCampaign,
  useRemoveCampaignMember,
  useSendCampaign,
  type CampaignStatus,
  type MemberEntity,
  type MemberInput,
  type MemberStatus,
} from '@/hooks/use-campaigns';
import {
  formatPct,
  memberStatusTone,
  statusTone,
  STATUS_TRANSITIONS,
  typeTone,
} from '@/components/campaigns/campaign-ui';
import {
  CRMCard,
  CRMEmptyState,
  CRMErrorState,
  CRMMetricCard,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMSegmentedControl,
  CRMStatusBadge,
  CRMTableShell,
} from '@/components/ui/crm';

type Tab = 'overview' | 'members' | 'metrics';

const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100';

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const [tab, setTab] = useState<Tab>('overview');

  const { data: campaign, isLoading, isError, refetch } = useCampaign(id);
  const changeStatus = useChangeCampaignStatus();
  const send = useSendCampaign();
  const remove = useDeleteCampaign();
  const { confirm, ConfirmDialog } = useConfirm();

  if (isLoading) {
    return (
      <CRMModuleShell>
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </CRMModuleShell>
    );
  }

  if (isError || !campaign) {
    return (
      <CRMModuleShell>
        <CRMErrorState
          title="Campaign not found"
          description="This campaign may have been deleted or you may not have access."
          action={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void refetch()}
                className="inline-flex h-10 items-center rounded-lg border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50"
              >
                Retry
              </button>
              <Link
                href="/campaigns"
                className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Back to campaigns
              </Link>
            </div>
          }
        />
      </CRMModuleShell>
    );
  }

  const nextStates = STATUS_TRANSITIONS[campaign.status] ?? [];
  const canSend =
    campaign.status === 'DRAFT' ||
    campaign.status === 'SCHEDULED' ||
    campaign.status === 'PAUSED' ||
    campaign.status === 'RUNNING';

  return (
    <CRMModuleShell>
      <CRMPageHeader
        eyebrow="Campaign"
        icon={Megaphone}
        title={campaign.name}
        description={campaign.subject ?? 'No subject set.'}
        badges={
          <div className="flex flex-wrap items-center gap-2">
            <CRMStatusBadge tone={typeTone(campaign.type)}>{campaign.type}</CRMStatusBadge>
            <CRMStatusBadge tone={statusTone(campaign.status)}>{campaign.status}</CRMStatusBadge>
            <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              {campaign.memberCount ?? 0} members
            </span>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/campaigns"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            {nextStates.map((to) => (
              <button
                key={to}
                type="button"
                disabled={changeStatus.isPending}
                onClick={() => changeStatus.mutate({ id, status: to as CampaignStatus })}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {to}
              </button>
            ))}
            {canSend ? (
              <button
                type="button"
                disabled={send.isPending}
                onClick={() => send.mutate(id)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#137fec] px-4 text-sm font-bold text-white hover:bg-[#005baf] disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {send.isPending ? 'Sending…' : 'Send'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={remove.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Delete campaign',
                  description: 'Delete this campaign? It can be restored via the API.',
                  confirmLabel: 'Delete',
                  danger: true,
                });
                if (ok) remove.mutate(id, { onSuccess: () => router.push('/campaigns') });
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        }
      />

      <CRMSegmentedControl<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview', icon: FileText },
          { value: 'members', label: 'Members', icon: Users },
          { value: 'metrics', label: 'Metrics', icon: BarChart3 },
        ]}
      />

      {tab === 'overview' ? <OverviewTab campaign={campaign} /> : null}
      {tab === 'members' ? <MembersTab campaignId={id} /> : null}
      {tab === 'metrics' ? <MetricsTab campaignId={id} /> : null}
      {ConfirmDialog}
    </CRMModuleShell>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────

function OverviewTab({
  campaign,
}: {
  campaign: NonNullable<ReturnType<typeof useCampaign>['data']>;
}) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Type', value: campaign.type },
    { label: 'Status', value: campaign.status },
    { label: 'Subject', value: campaign.subject || '—' },
    { label: 'From name', value: campaign.fromName || '—' },
    { label: 'From email', value: campaign.fromEmail || '—' },
    {
      label: 'Scheduled at',
      value: campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : '—',
    },
    {
      label: 'Started at',
      value: campaign.startedAt ? new Date(campaign.startedAt).toLocaleString() : '—',
    },
    {
      label: 'Completed at',
      value: campaign.completedAt ? new Date(campaign.completedAt).toLocaleString() : '—',
    },
    { label: 'Owner', value: campaign.ownerId },
    { label: 'Created', value: new Date(campaign.createdAt).toLocaleString() },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <CRMCard title="Content preview">
        {campaign.contentHtml ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div
              className="prose prose-sm max-w-none text-slate-800"
              // Content is authored by campaign owners inside the tenant.
              dangerouslySetInnerHTML={{ __html: campaign.contentHtml }}
            />
          </div>
        ) : (
          <CRMEmptyState
            icon={FileText}
            title="No content yet"
            description="This campaign has no HTML content configured."
          />
        )}
      </CRMCard>

      <CRMCard title="Details">
        <dl className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-4 py-2.5">
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {r.label}
              </dt>
              <dd className="max-w-[60%] break-words text-right text-sm text-slate-700">
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </CRMCard>
    </div>
  );
}

// ─── Members ──────────────────────────────────────────────────────────────

function MembersTab({ campaignId }: { campaignId: string }) {
  const { data: members, isLoading, isError, refetch } = useCampaignMembers(campaignId);
  const add = useAddCampaignMembers();
  const removeMember = useRemoveCampaignMember();

  // single add
  const [entityType, setEntityType] = useState<MemberEntity>('CONTACT');
  const [entityId, setEntityId] = useState('');
  const [email, setEmail] = useState('');

  // bulk import
  const [bulkType, setBulkType] = useState<MemberEntity>('CONTACT');
  const [bulkText, setBulkText] = useState('');

  function handleAddOne() {
    if (!entityId.trim() || !email.trim()) {
      notify.error('Both an entity id and email are required');
      return;
    }
    add.mutate(
      { id: campaignId, members: [{ entityType, entityId: entityId.trim(), email: email.trim() }] },
      {
        onSuccess: () => {
          setEntityId('');
          setEmail('');
        },
      }
    );
  }

  function handleBulkImport() {
    const emails = bulkText
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      notify.error('Paste at least one email address');
      return;
    }
    // Emails pasted in bulk carry no CRM id, so the email doubles as the
    // dedup key (composite unique is tenant+campaign+entityType+entityId).
    const payload: MemberInput[] = emails.map((e) => ({
      entityType: bulkType,
      entityId: e.toLowerCase(),
      email: e,
    }));
    add.mutate(
      { id: campaignId, members: payload, bulk: true },
      { onSuccess: () => setBulkText('') }
    );
  }

  const rows = members ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <CRMCard title="Members" description={`${rows.length} loaded`} padded={false}>
        {isError ? (
          <div className="p-5">
            <CRMErrorState
              title="Unable to load members"
              action={
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="inline-flex h-10 items-center rounded-lg border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50"
                >
                  Retry
                </button>
              }
            />
          </div>
        ) : (
          <CRMTableShell className="rounded-none border-0 shadow-none">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Entity</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{m.email}</td>
                    <td className="px-5 py-3">
                      <CRMStatusBadge tone={m.entityType === 'LEAD' ? 'amber' : 'blue'}>
                        {m.entityType}
                      </CRMStatusBadge>
                    </td>
                    <td className="px-5 py-3">
                      <CRMStatusBadge tone={memberStatusTone(m.status as MemberStatus)}>
                        {m.status}
                      </CRMStatusBadge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={removeMember.isPending}
                        onClick={() =>
                          removeMember.mutate({ id: campaignId, memberId: m.id })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <CRMEmptyState
                        icon={Users}
                        title={isLoading ? 'Loading members…' : 'No members yet'}
                        description="Add contacts or leads, or bulk-import a list of emails."
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CRMTableShell>
        )}
      </CRMCard>

      <div className="space-y-6">
        <CRMCard title="Add member">
          <div className="space-y-3">
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as MemberEntity)}
              className={inputClass}
            >
              <option value="CONTACT">Contact</option>
              <option value="LEAD">Lead</option>
            </select>
            <input
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder={`${entityType === 'LEAD' ? 'Lead' : 'Contact'} id`}
              className={inputClass}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@company.com"
              className={inputClass}
            />
            <button
              type="button"
              disabled={add.isPending || !entityId.trim() || !email.trim()}
              onClick={handleAddOne}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#137fec] px-4 text-sm font-bold text-white hover:bg-[#005baf] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add member
            </button>
          </div>
        </CRMCard>

        <CRMCard title="Bulk import" description="Paste emails separated by commas, spaces, or new lines.">
          <div className="space-y-3">
            <select
              value={bulkType}
              onChange={(e) => setBulkType(e.target.value as MemberEntity)}
              className={inputClass}
            >
              <option value="CONTACT">As contacts</option>
              <option value="LEAD">As leads</option>
            </select>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={5}
              placeholder="a@x.com, b@y.com&#10;c@z.com"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="button"
              disabled={add.isPending || !bulkText.trim()}
              onClick={handleBulkImport}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Import members
            </button>
          </div>
        </CRMCard>
      </div>
    </div>
  );
}

// ─── Metrics ──────────────────────────────────────────────────────────────

function MetricsTab({ campaignId }: { campaignId: string }) {
  const { data: metrics, isLoading, isError, refetch } = useCampaignMetrics(campaignId);

  const funnel = useMemo(() => {
    if (!metrics) return [];
    const order: MemberStatus[] = [
      'PENDING',
      'SENT',
      'OPENED',
      'CLICKED',
      'CONVERTED',
      'BOUNCED',
      'UNSUBSCRIBED',
    ];
    return order.map((s) => ({ status: s, count: metrics.counts[s] ?? 0 }));
  }, [metrics]);

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (isError || !metrics) {
    return (
      <CRMErrorState
        title="Unable to load metrics"
        action={
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex h-10 items-center rounded-lg border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50"
          >
            Retry
          </button>
        }
      />
    );
  }

  const max = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <div className="space-y-6">
      <CRMMetricGrid className="grid-cols-2 lg:grid-cols-3">
        <CRMMetricCard icon={Users} label="Total" value={metrics.total} tone="slate" />
        <CRMMetricCard
          icon={Send}
          label="Delivery rate"
          value={formatPct(metrics.rates.deliveryRate)}
          tone="blue"
        />
        <CRMMetricCard
          icon={BarChart3}
          label="Open rate"
          value={formatPct(metrics.rates.openRate)}
          tone="emerald"
        />
        <CRMMetricCard
          icon={BarChart3}
          label="Click rate"
          value={formatPct(metrics.rates.clickRate)}
          tone="blue"
        />
        <CRMMetricCard
          icon={BarChart3}
          label="Conversion rate"
          value={formatPct(metrics.rates.conversionRate)}
          tone="emerald"
        />
        <CRMMetricCard
          icon={BarChart3}
          label="Bounce rate"
          value={formatPct(metrics.rates.bounceRate)}
          tone="rose"
        />
        <CRMMetricCard
          icon={BarChart3}
          label="Unsubscribe rate"
          value={formatPct(metrics.rates.unsubscribeRate)}
          tone="amber"
        />
      </CRMMetricGrid>

      <CRMCard title="Funnel by member status">
        {metrics.total === 0 ? (
          <CRMEmptyState
            icon={BarChart3}
            title="No engagement yet"
            description="Metrics populate once members are added and the campaign is sent."
          />
        ) : (
          <div className="space-y-3">
            {funnel.map((f) => (
              <div key={f.status} className="flex items-center gap-3">
                <div className="w-32 shrink-0">
                  <CRMStatusBadge tone={memberStatusTone(f.status)}>{f.status}</CRMStatusBadge>
                </div>
                <div className="h-6 flex-1 overflow-hidden rounded-lg bg-slate-100">
                  <div
                    className="h-full rounded-lg bg-[#137fec]"
                    style={{ width: `${(f.count / max) * 100}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-sm font-bold text-slate-700">
                  {f.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </CRMCard>
    </div>
  );
}
