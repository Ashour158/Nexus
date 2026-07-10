'use client';

import { useState } from 'react';
import { AlertCircle, Layers, Plus, Save, Trash2, X } from 'lucide-react';
import {
  useApprovalPolicies,
  useCreatePolicy,
  useDeletePolicy,
  useUpdatePolicy,
  type ApprovalPolicy,
  type ApproverType,
  type PolicyStep,
  type QuorumMode,
} from '@/hooks/use-approvals';
import { cn } from '@/lib/cn';

interface ApproverDraft {
  approverType: ApproverType;
  approverId: string;
  role: string;
  canDelegate: boolean;
}
interface LevelDraft {
  quorumMode: QuorumMode;
  quorumSize: number;
  approvers: ApproverDraft[];
}
interface PolicyDraft {
  id?: string;
  name: string;
  module: string;
  isActive: boolean;
  levels: LevelDraft[];
}

const EMPTY_APPROVER: ApproverDraft = { approverType: 'USER', approverId: '', role: '', canDelegate: false };
const EMPTY_LEVEL: LevelDraft = { quorumMode: 'ALL', quorumSize: 1, approvers: [{ ...EMPTY_APPROVER }] };
const EMPTY_DRAFT: PolicyDraft = { name: '', module: '', isActive: true, levels: [{ ...EMPTY_LEVEL }] };

function policyToDraft(policy: ApprovalPolicy): PolicyDraft {
  const steps = Array.isArray(policy.steps) ? policy.steps : [];
  const orders = Array.from(new Set(steps.map((s) => s.order))).sort((a, b) => a - b);
  const levels: LevelDraft[] = orders.map((order) => {
    const levelSteps = steps.filter((s) => s.order === order);
    const first = levelSteps[0];
    return {
      quorumMode: first?.quorumMode ?? 'ALL',
      quorumSize: first?.quorumSize ?? levelSteps.length,
      approvers: levelSteps.map((s) => ({
        approverType: s.approverType ?? 'USER',
        approverId: s.approverId ?? '',
        role: s.role ?? '',
        canDelegate: Boolean(s.canDelegate),
      })),
    };
  });
  return {
    id: policy.id,
    name: policy.name,
    module: policy.module,
    isActive: policy.isActive,
    levels: levels.length > 0 ? levels : [{ ...EMPTY_LEVEL }],
  };
}

function draftToSteps(draft: PolicyDraft): PolicyStep[] {
  return draft.levels.flatMap((level, i) =>
    level.approvers.map<PolicyStep>((a) => ({
      order: i + 1,
      approverType: a.approverType,
      approverId: a.approverType === 'USER' ? a.approverId.trim() || undefined : undefined,
      role: a.approverType === 'ROLE' ? a.role.trim() || undefined : undefined,
      canDelegate: a.canDelegate,
      quorumMode: level.quorumMode,
      quorumSize: level.quorumMode === 'N_OF_M' ? level.quorumSize : undefined,
    }))
  );
}

export function PolicyAdmin() {
  const policies = useApprovalPolicies();
  const createPolicy = useCreatePolicy();
  const updatePolicy = useUpdatePolicy();
  const deletePolicy = useDeletePolicy();

  const [draft, setDraft] = useState<PolicyDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const saving = createPolicy.isPending || updatePolicy.isPending;

  const editLevel = (idx: number, patch: Partial<LevelDraft>) =>
    setDraft((d) => ({ ...d, levels: d.levels.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  const editApprover = (li: number, ai: number, patch: Partial<ApproverDraft>) =>
    setDraft((d) => ({
      ...d,
      levels: d.levels.map((l, i) =>
        i === li ? { ...l, approvers: l.approvers.map((a, j) => (j === ai ? { ...a, ...patch } : a)) } : l
      ),
    }));

  const submit = () => {
    if (!draft.name.trim() || !draft.module.trim()) {
      setError('Name and module are required.');
      return;
    }
    setError(null);
    const input = {
      name: draft.name.trim(),
      module: draft.module.trim(),
      steps: draftToSteps(draft),
      isActive: draft.isActive,
    };
    if (draft.id) {
      updatePolicy.mutate({ id: draft.id, input }, { onSuccess: () => setDraft(EMPTY_DRAFT) });
    } else {
      createPolicy.mutate(input, { onSuccess: () => setDraft(EMPTY_DRAFT) });
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_1fr]">
      {/* Existing policies */}
      <section className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Approval policies</h2>
            <p className="text-sm text-slate-500">Routing rules that generate approval requests.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4f46e5] px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> New policy
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {policies.isLoading ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Loading policies…</p>
          ) : policies.isError ? (
            <p className="flex items-center justify-center gap-2 px-5 py-8 text-center text-sm text-rose-600">
              <AlertCircle className="h-4 w-4" /> Policy service unavailable.
            </p>
          ) : (policies.data ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No policies yet — create one.</p>
          ) : (
            (policies.data ?? []).map((policy) => {
              const levelCount = new Set((policy.steps ?? []).map((s) => s.order)).size;
              return (
                <div key={policy.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(policyToDraft(policy));
                      setError(null);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate font-bold text-slate-900">{policy.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono">{policy.module}</span>
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3 w-3" /> {levelCount} level{levelCount === 1 ? '' : 's'}
                      </span>
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePolicy.mutate({ id: policy.id })}
                    disabled={deletePolicy.isPending}
                    className="rounded-lg border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                    aria-label={`Deactivate ${policy.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Editor */}
      <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">{draft.id ? 'Edit policy' : 'Create policy'}</h2>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Name
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium normal-case text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="High-value discount"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Module
              <input
                value={draft.module}
                onChange={(e) => setDraft((d) => ({ ...d, module: e.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium normal-case text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="Quote"
              />
            </label>
          </div>

          <div className="space-y-3">
            {draft.levels.map((level, li) => (
              <div key={li} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">Level {li + 1}</span>
                  {draft.levels.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({ ...d, levels: d.levels.filter((_, i) => i !== li) }))
                      }
                      className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                      aria-label={`Remove level ${li + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <select
                    value={level.quorumMode}
                    onChange={(e) => editLevel(li, { quorumMode: e.target.value as QuorumMode })}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                  >
                    <option value="ALL">All must approve</option>
                    <option value="ANY">Any one</option>
                    <option value="N_OF_M">N of M</option>
                  </select>
                  {level.quorumMode === 'N_OF_M' ? (
                    <input
                      type="number"
                      min={1}
                      max={level.approvers.length}
                      value={level.quorumSize}
                      onChange={(e) => editLevel(li, { quorumSize: Number(e.target.value) })}
                      className="h-9 w-16 rounded-lg border border-slate-200 px-2 text-sm"
                      aria-label="Quorum size"
                    />
                  ) : null}
                </div>
                <div className="space-y-2">
                  {level.approvers.map((approver, ai) => (
                    <div key={ai} className="flex flex-wrap items-center gap-2">
                      <select
                        value={approver.approverType}
                        onChange={(e) =>
                          editApprover(li, ai, { approverType: e.target.value as ApproverType })
                        }
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                      >
                        <option value="USER">User</option>
                        <option value="ROLE">Role</option>
                        <option value="MANAGER">Manager</option>
                      </select>
                      {approver.approverType === 'USER' ? (
                        <input
                          value={approver.approverId}
                          onChange={(e) => editApprover(li, ai, { approverId: e.target.value })}
                          placeholder="User id / email"
                          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm"
                        />
                      ) : approver.approverType === 'ROLE' ? (
                        <input
                          value={approver.role}
                          onChange={(e) => editApprover(li, ai, { role: e.target.value })}
                          placeholder="Role (e.g. FINANCE_MANAGER)"
                          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm"
                        />
                      ) : (
                        <span className="flex-1 text-xs italic text-slate-400">Requester’s manager</span>
                      )}
                      <label className="flex items-center gap-1 text-xs font-medium text-slate-500">
                        <input
                          type="checkbox"
                          checked={approver.canDelegate}
                          onChange={(e) => editApprover(li, ai, { canDelegate: e.target.checked })}
                        />
                        Delegable
                      </label>
                      {level.approvers.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            editLevel(li, {
                              approvers: level.approvers.filter((_, j) => j !== ai),
                              quorumSize: Math.min(level.quorumSize, level.approvers.length - 1),
                            })
                          }
                          className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                          aria-label="Remove approver"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      editLevel(li, { approvers: [...level.approvers, { ...EMPTY_APPROVER }] })
                    }
                    className="text-xs font-bold text-[#4f46e5] hover:underline"
                  >
                    + Add approver
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, levels: [...d.levels, { ...EMPTY_LEVEL }] }))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" /> Add level
            </button>
          </div>

          {error ? <p className="text-xs font-semibold text-rose-600">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#4f46e5] px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60'
              )}
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Create policy'}
            </button>
            {draft.id ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(EMPTY_DRAFT);
                  setError(null);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
