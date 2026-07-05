'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Network, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { useUsers } from '@/hooks/use-users';
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  useLevels,
  useCreateLevel,
  useUpdateLevel,
  useDeleteLevel,
  type Department,
  type DepartmentNode,
  type DepartmentInput,
  type Level,
  type LevelInput,
} from '@/hooks/use-org';

const inputClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#137fec]';

// ===========================================================================
// Departments tab
// ===========================================================================

interface DeptFormState {
  id?: string;
  name: string;
  code: string;
  description: string;
  parentDepartmentId: string;
  headUserId: string;
}

const EMPTY_DEPT: DeptFormState = {
  name: '',
  code: '',
  description: '',
  parentDepartmentId: '',
  headUserId: '',
};

function DepartmentsTab({ canEdit }: { canEdit: boolean }) {
  const { data: tree, isLoading, isError, error } = useDepartments(true);
  const { data: flat } = useDepartments(false);
  const usersQuery = useUsers({ limit: 200 });

  const createDept = useCreateDepartment();
  const updateDept = useUpdateDepartment();
  const deleteDept = useDeleteDepartment();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<DeptFormState | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const nodes = (tree ?? []) as DepartmentNode[];
  const flatList = (flat ?? []) as Department[];
  const users = usersQuery.data?.data ?? [];

  const userName = (id?: string | null) => {
    if (!id) return null;
    const u = users.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}`.trim() : null;
  };

  function openCreate(parentId?: string) {
    setBanner(null);
    setForm({ ...EMPTY_DEPT, parentDepartmentId: parentId ?? '' });
  }

  function openEdit(d: Department) {
    setBanner(null);
    setForm({
      id: d.id,
      name: d.name,
      code: d.code ?? '',
      description: d.description ?? '',
      parentDepartmentId: d.parentDepartmentId ?? '',
      headUserId: d.headUserId ?? '',
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const payload: DepartmentInput = {
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      description: form.description.trim() || undefined,
      parentDepartmentId: form.parentDepartmentId || null,
      headUserId: form.headUserId || null,
    };
    if (!payload.name) {
      setBanner({ kind: 'err', text: 'Department name is required.' });
      return;
    }
    try {
      if (form.id) await updateDept.mutateAsync({ id: form.id, data: payload });
      else await createDept.mutateAsync(payload);
      setForm(null);
      setBanner({ kind: 'ok', text: form.id ? 'Department updated.' : 'Department created.' });
    } catch (err) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    }
  }

  async function remove(d: Department) {
    if (!window.confirm(`Delete department "${d.name}"?`)) return;
    setBanner(null);
    try {
      await deleteDept.mutateAsync(d.id);
      setBanner({ kind: 'ok', text: 'Department deleted.' });
    } catch (err) {
      // Backend returns 409 when the department has children or members.
      const msg =
        (err as { code?: string })?.code === 'CONFLICT' || /409|children|member/i.test(String(err))
          ? 'Cannot delete: this department has sub-departments or members. Reassign them first.'
          : err instanceof Error
            ? err.message
            : 'Delete failed.';
      setBanner({ kind: 'err', text: msg });
    }
  }

  function renderNode(node: DepartmentNode, depth: number): React.ReactNode {
    const kids = node.children ?? [];
    const hasKids = kids.length > 0;
    const isOpen = expanded[node.id] ?? true;
    const head = userName(node.headUserId);
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
          style={{ marginInlineStart: depth * 20 }}
        >
          <button
            type="button"
            onClick={() => setExpanded((p) => ({ ...p, [node.id]: !isOpen }))}
            className={`text-slate-400 hover:text-slate-700 ${hasKids ? '' : 'invisible'}`}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{node.name}</span>
              {node.code ? (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {node.code}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-slate-500">
              {head ? `Head: ${head}` : 'No head assigned'}
              {typeof node.memberCount === 'number' ? ` · ${node.memberCount} members` : ''}
            </div>
          </div>
          {canEdit ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => openCreate(node.id)}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-50 hover:text-[#137fec]"
                title="Add sub-department"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => openEdit(node)}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-50 hover:text-[#137fec]"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(node)}
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
        {hasKids && isOpen ? (
          <div className="mt-1 space-y-1">{kids.map((k) => renderNode(k, depth + 1))}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Model your organization&apos;s reporting departments.</p>
        {canEdit ? (
          <Button onClick={() => openCreate()} className="bg-[#137fec] hover:bg-[#0f6fd4]">
            <Plus className="h-4 w-4" /> New department
          </Button>
        ) : null}
      </div>

      {banner ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            banner.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Failed to load departments: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading departments…
        </div>
      ) : nodes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No departments yet.{canEdit ? ' Create your first department to get started.' : ''}
        </div>
      ) : (
        <div className="space-y-1">{nodes.map((n) => renderNode(n, 0))}</div>
      )}

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submit} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {form.id ? 'Edit department' : 'New department'}
              </h3>
              <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Name *</span>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Code</span>
                <input
                  className={inputClass}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. SALES"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Description</span>
                <textarea
                  className={`${inputClass} min-h-[64px]`}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Parent department</span>
                <select
                  className={inputClass}
                  value={form.parentDepartmentId}
                  onChange={(e) => setForm({ ...form, parentDepartmentId: e.target.value })}
                >
                  <option value="">— None (top level) —</option>
                  {flatList
                    .filter((d) => d.id !== form.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Department head</span>
                <select
                  className={inputClass}
                  value={form.headUserId}
                  onChange={(e) => setForm({ ...form, headUserId: e.target.value })}
                >
                  <option value="">— Unassigned —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.email})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={createDept.isPending || updateDept.isPending}
                className="bg-[#137fec] hover:bg-[#0f6fd4]"
              >
                {form.id ? 'Save' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

// ===========================================================================
// Levels tab
// ===========================================================================

interface LevelFormState {
  id?: string;
  name: string;
  rank: string;
  description: string;
}

const EMPTY_LEVEL: LevelFormState = { name: '', rank: '', description: '' };

function LevelsTab({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading, isError, error } = useLevels();
  const createLevel = useCreateLevel();
  const updateLevel = useUpdateLevel();
  const deleteLevel = useDeleteLevel();

  const [form, setForm] = useState<LevelFormState | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const levels = useMemo(() => [...(data ?? [])].sort((a, b) => a.rank - b.rank), [data]);

  function openCreate() {
    setBanner(null);
    const nextRank = levels.length ? Math.max(...levels.map((l) => l.rank)) + 1 : 1;
    setForm({ ...EMPTY_LEVEL, rank: String(nextRank) });
  }

  function openEdit(l: Level) {
    setBanner(null);
    setForm({ id: l.id, name: l.name, rank: String(l.rank), description: l.description ?? '' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const rankNum = Number.parseInt(form.rank, 10);
    if (!form.name.trim()) {
      setBanner({ kind: 'err', text: 'Level name is required.' });
      return;
    }
    if (Number.isNaN(rankNum)) {
      setBanner({ kind: 'err', text: 'Rank must be a number.' });
      return;
    }
    const payload: LevelInput = {
      name: form.name.trim(),
      rank: rankNum,
      description: form.description.trim() || undefined,
    };
    try {
      if (form.id) await updateLevel.mutateAsync({ id: form.id, data: payload });
      else await createLevel.mutateAsync(payload);
      setForm(null);
      setBanner({ kind: 'ok', text: form.id ? 'Level updated.' : 'Level created.' });
    } catch (err) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    }
  }

  async function remove(l: Level) {
    if (!window.confirm(`Delete level "${l.name}"?`)) return;
    setBanner(null);
    try {
      await deleteLevel.mutateAsync(l.id);
      setBanner({ kind: 'ok', text: 'Level deleted.' });
    } catch (err) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed.' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Seniority levels, ordered by rank (lowest rank = most senior).</p>
        {canEdit ? (
          <Button onClick={openCreate} className="bg-[#137fec] hover:bg-[#0f6fd4]">
            <Plus className="h-4 w-4" /> New level
          </Button>
        ) : null}
      </div>

      {banner ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            banner.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Failed to load levels: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading levels…
        </div>
      ) : levels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No levels yet.{canEdit ? ' Create your first seniority level.' : ''}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="w-16 px-4 py-3 text-start font-medium text-slate-500">Rank</th>
                <th className="px-4 py-3 text-start font-medium text-slate-500">Level</th>
                <th className="px-4 py-3 text-start font-medium text-slate-500">Description</th>
                {canEdit ? <th className="w-24 px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {levels.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-mono text-slate-500">{l.rank}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{l.name}</td>
                  <td className="px-4 py-3 text-slate-600">{l.description || '—'}</td>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(l)}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-50 hover:text-[#137fec]"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(l)}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">{form.id ? 'Edit level' : 'New level'}</h3>
              <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Name *</span>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                  placeholder="e.g. Senior Manager"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Rank *</span>
                <input
                  type="number"
                  className={inputClass}
                  value={form.rank}
                  onChange={(e) => setForm({ ...form, rank: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Description</span>
                <textarea
                  className={`${inputClass} min-h-[64px]`}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={createLevel.isPending || updateLevel.isPending}
                className="bg-[#137fec] hover:bg-[#0f6fd4]"
              >
                {form.id ? 'Save' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function OrgStructurePage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canView = hasPermission('settings:read');
  const canEdit = hasPermission('settings:update');
  const [tab, setTab] = useState<'departments' | 'levels'>('departments');

  if (!canView) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You do not have permission to view org structure (requires settings:read).
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#137fec]">
          <Network className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Org Structure</h1>
          <p className="mt-0.5 text-sm text-slate-500">Departments and seniority levels for your organization.</p>
        </div>
      </div>

      <div className="mb-5 flex gap-2 border-b border-slate-200">
        {(['departments', 'levels'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
              tab === t
                ? 'border-[#137fec] text-[#137fec]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'departments' ? <DepartmentsTab canEdit={canEdit} /> : <LevelsTab canEdit={canEdit} />}
    </div>
  );
}
