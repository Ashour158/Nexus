'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BadgeDollarSign, Ruler } from 'lucide-react';
import {
  CRMCard,
  CRMEmptyState,
  CRMModuleShell,
  CRMPageHeader,
  CRMSegmentedControl,
  CRMStatusBadge,
  CRMTableShell,
  CRMToolbar,
} from '@/components/ui/crm';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import {
  useCommissionPlans,
  useCreateCommissionPlan,
  useDeleteCommissionPlan,
  useAddCommissionRule,
  useDeleteCommissionRule,
  useCommissionStatements,
  useApproveStatement,
  usePayStatement,
  type CommissionBasis,
  type CommissionStatementStatus,
  type CreateRuleInput,
} from '@/hooks/use-commission';

type Tab = 'plans' | 'statements';

const STATUS_TONES: Record<CommissionStatementStatus, 'amber' | 'blue' | 'emerald'> = {
  PENDING: 'amber',
  APPROVED: 'blue',
  PAID: 'emerald',
};

export default function CommissionPage() {
  const roles = useAuthStore((s) => s.roles);
  const userId = useAuthStore((s) => s.userId);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');
  const canManage = isAdmin || hasPermission('commission:manage') || hasPermission('admin:*');
  const canApprove = isAdmin || hasPermission('commission:approve');

  const [tab, setTab] = useState<Tab>('statements');

  return (
    <CRMModuleShell>
      <CRMPageHeader
        icon={BadgeDollarSign}
        title="Commission"
        description="Commission plans, rules, and rep statements"
      />
      <CRMToolbar>
        <CRMSegmentedControl
          value={tab}
          onChange={setTab}
          options={
            canManage
              ? [
                  { value: 'statements' as Tab, label: 'Statements' },
                  { value: 'plans' as Tab, label: 'Plans & Rules' },
                ]
              : [{ value: 'statements' as Tab, label: 'Statements' }]
          }
        />
      </CRMToolbar>

      {tab === 'plans' && canManage ? <PlansView /> : null}
      {tab === 'statements' ? (
        <StatementsView isAdmin={canManage} canApprove={canApprove} currentUserId={userId ?? ''} />
      ) : null}
    </CRMModuleShell>
  );
}

// ── Plans & rules (admin) ────────────────────────────────────────────────
function PlansView() {
  const { data: plans, isLoading } = useCommissionPlans();
  const createPlan = useCreateCommissionPlan();
  const deletePlan = useDeleteCommissionPlan();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basis, setBasis] = useState<CommissionBasis>('REVENUE');

  const submit = () => {
    if (!name.trim()) return;
    createPlan.mutate(
      { name: name.trim(), description: description.trim() || undefined, basis },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          setBasis('REVENUE');
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <CRMCard title="New commission plan">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input placeholder="Plan name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="md:col-span-2"
          />
          <Select value={basis} onChange={(e) => setBasis(e.target.value as CommissionBasis)}>
            <option value="REVENUE">Revenue basis</option>
            <option value="MARGIN">Margin basis</option>
          </Select>
        </div>
        <div className="mt-3">
          <Button onClick={submit} disabled={createPlan.isPending || !name.trim()}>
            {createPlan.isPending ? 'Creating…' : 'Create plan'}
          </Button>
        </div>
      </CRMCard>

      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-surface-container-high" />
          ))}
        </div>
      ) : !plans || plans.length === 0 ? (
        <CRMCard padded={false}>
          <CRMEmptyState icon={Ruler} title="No commission plans" description="Create a plan above to start computing commissions" />
        </CRMCard>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-xl border border-outline-variant bg-surface p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-on-surface">{plan.name}</h3>
                    <span className="rounded bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface">{plan.basis}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        plan.isActive ? 'bg-success-container text-on-success-container' : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {plan.description ? <p className="mt-0.5 text-xs text-on-surface-variant">{plan.description}</p> : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Delete plan "${plan.name}" and all its rules?`)) deletePlan.mutate(plan.id);
                  }}
                >
                  Delete
                </Button>
              </div>
              <RulesEditor planId={plan.id} rules={plan.rules} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RulesEditor({ planId, rules }: { planId: string; rules: import('@/hooks/use-commission').CommissionRule[] }) {
  const addRule = useAddCommissionRule();
  const deleteRule = useDeleteCommissionRule();
  const [draft, setDraft] = useState<CreateRuleInput>({ ratePercent: '' });

  const submit = () => {
    if (draft.ratePercent === '' || draft.ratePercent === undefined) return;
    addRule.mutate(
      { planId, data: draft },
      { onSuccess: () => setDraft({ ratePercent: '' }) },
    );
  };

  return (
    <div className="mt-3 border-t border-outline-variant pt-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Rules</h4>
      {rules.length === 0 ? (
        <p className="mb-2 text-xs text-on-surface-variant">No rules yet — add one below.</p>
      ) : (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-on-surface-variant">
                <th className="py-1 pr-3">Rate %</th>
                <th className="py-1 pr-3">Role</th>
                <th className="py-1 pr-3">Owner</th>
                <th className="py-1 pr-3">Product</th>
                <th className="py-1 pr-3">Tier min</th>
                <th className="py-1 pr-3">Tier max</th>
                <th className="py-1 pr-3">Priority</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-outline-variant">
                  <td className="py-1 pr-3 font-medium">{r.ratePercent}%</td>
                  <td className="py-1 pr-3 text-on-surface-variant">{r.appliesToRole ?? '—'}</td>
                  <td className="py-1 pr-3 text-on-surface-variant">{r.ownerId ?? '—'}</td>
                  <td className="py-1 pr-3 text-on-surface-variant">{r.productId ?? '—'}</td>
                  <td className="py-1 pr-3 text-on-surface-variant">{r.tierMinAmount ?? '—'}</td>
                  <td className="py-1 pr-3 text-on-surface-variant">{r.tierMaxAmount ?? '—'}</td>
                  <td className="py-1 pr-3 text-on-surface-variant">{r.priority}</td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      className="text-xs text-error hover:underline"
                      onClick={() => deleteRule.mutate(r.id)}
                    >
                      remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-8">
        <Input
          placeholder="Rate %"
          value={String(draft.ratePercent ?? '')}
          onChange={(e) => setDraft((d) => ({ ...d, ratePercent: e.target.value }))}
        />
        <Input
          placeholder="Role"
          value={draft.appliesToRole ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, appliesToRole: e.target.value || undefined }))}
        />
        <Input
          placeholder="Owner ID"
          value={draft.ownerId ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, ownerId: e.target.value || undefined }))}
        />
        <Input
          placeholder="Product ID"
          value={draft.productId ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, productId: e.target.value || undefined }))}
        />
        <Input
          placeholder="Tier min"
          value={draft.tierMinAmount === undefined ? '' : String(draft.tierMinAmount)}
          onChange={(e) => setDraft((d) => ({ ...d, tierMinAmount: e.target.value || undefined }))}
        />
        <Input
          placeholder="Tier max"
          value={draft.tierMaxAmount === undefined ? '' : String(draft.tierMaxAmount)}
          onChange={(e) => setDraft((d) => ({ ...d, tierMaxAmount: e.target.value || undefined }))}
        />
        <Input
          placeholder="Priority"
          value={draft.priority === undefined ? '' : String(draft.priority)}
          onChange={(e) =>
            setDraft((d) => ({ ...d, priority: e.target.value === '' ? undefined : Number(e.target.value) }))
          }
        />
        <Button size="sm" onClick={submit} disabled={addRule.isPending || draft.ratePercent === ''}>
          Add rule
        </Button>
      </div>
    </div>
  );
}

// ── Statements ────────────────────────────────────────────────────────────
function StatementsView({
  isAdmin,
  canApprove,
  currentUserId,
}: {
  isAdmin: boolean;
  canApprove: boolean;
  currentUserId: string;
}) {
  const [status, setStatus] = useState<CommissionStatementStatus | ''>('');
  const [period, setPeriod] = useState('');

  // Non-admins only ever see their own statements.
  const filters = useMemo(
    () => ({
      ownerId: isAdmin ? undefined : currentUserId,
      status: status || undefined,
      periodMonth: period || undefined,
    }),
    [isAdmin, currentUserId, status, period],
  );

  const { data: statements, isLoading } = useCommissionStatements(filters);
  const approve = useApproveStatement();
  const pay = usePayStatement();

  return (
    <div className="space-y-4">
      <CRMToolbar>
        <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value as CommissionStatementStatus | '')} className="w-44">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="PAID">Paid</option>
        </Select>
        <Input
          placeholder="Period (YYYY-MM)"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-44"
        />
        </div>
      </CRMToolbar>

      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-container-high" />
          ))}
        </div>
      ) : !statements || statements.length === 0 ? (
        <CRMCard padded={false}>
          <CRMEmptyState
            icon={BadgeDollarSign}
            title="No commission statements"
            description={isAdmin ? 'Statements appear here as deals are won' : 'Your commission statements will appear here'}
          />
        </CRMCard>
      ) : (
        <CRMTableShell>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant text-left text-xs text-on-surface-variant">
                <th className="px-4 py-2">Period</th>
                {isAdmin ? <th className="px-4 py-2">Owner</th> : null}
                <th className="px-4 py-2">Deal</th>
                <th className="px-4 py-2">Base</th>
                <th className="px-4 py-2">Rate</th>
                <th className="px-4 py-2">Commission</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.id} className="border-b border-outline-variant last:border-0">
                  <td className="px-4 py-2 text-on-surface">{s.periodMonth}</td>
                  {isAdmin ? <td className="px-4 py-2 text-on-surface-variant">{s.ownerId}</td> : null}
                  <td className="px-4 py-2 text-on-surface-variant">{s.dealId}</td>
                  <td className="px-4 py-2 text-on-surface">{formatCurrency(s.baseAmount, s.currency)}</td>
                  <td className="px-4 py-2 text-on-surface">{s.ratePercent}%</td>
                  <td className="px-4 py-2 font-medium text-on-surface">
                    {formatCurrency(s.commissionAmount, s.currency)}
                  </td>
                  <td className="px-4 py-2">
                    <CRMStatusBadge tone={STATUS_TONES[s.status]}>
                      {s.status}
                    </CRMStatusBadge>
                    {s.approvedAt ? (
                      <span className="ml-1 text-[10px] text-on-surface-variant">{formatDate(s.approvedAt)}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canApprove && s.status === 'PENDING' ? (
                      <Button size="sm" variant="outline" onClick={() => approve.mutate(s.id)} disabled={approve.isPending}>
                        Approve
                      </Button>
                    ) : null}
                    {canApprove && s.status === 'APPROVED' ? (
                      <Button size="sm" onClick={() => pay.mutate(s.id)} disabled={pay.isPending}>
                        Mark paid
                      </Button>
                    ) : null}
                    {s.status === 'PAID' ? <span className="text-xs text-on-surface-variant">—</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CRMTableShell>
      )}
    </div>
  );
}
