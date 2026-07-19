'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRolePermissionsMatrix } from '@/hooks/use-roles';

// Fallbacks used only until the backend permission matrix loads. The live
// catalog (every module + action) is derived from GET /roles/permissions/matrix.
const DEFAULT_RESOURCES = [
  'leads', 'contacts', 'accounts', 'deals', 'quotes', 'activities',
  'reports', 'documents', 'settings', 'users', 'roles', 'integrations',
  'workflows', 'invoices',
] as const;
const DEFAULT_ACTIONS = ['read', 'create', 'update', 'delete'] as const;
// Canonical ordering so common CRUD actions line up left-to-right.
const ACTION_ORDER = ['read', 'create', 'update', 'delete', 'manage', 'export', 'import', 'approve'];

interface Role {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];
  isSystem?: boolean;
}

export default function AdminRolesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const { confirm, ConfirmDialog } = useConfirm();
  const matrixQuery = useRolePermissionsMatrix();

  // Derive the full resource × action grid from the backend permission catalog
  // so every module (not just the legacy 14) is selectable.
  const { resources, actions } = useMemo(() => {
    const perms = matrixQuery.data?.permissions ?? [];
    const resSet = new Set<string>();
    const actSet = new Set<string>();
    for (const p of perms) {
      const [res, act] = p.split(':');
      if (!res || res === '*') continue;
      resSet.add(res);
      if (act && act !== '*') actSet.add(act);
    }
    const sortedActions = Array.from(actSet).sort((a, b) => {
      const ia = ACTION_ORDER.indexOf(a);
      const ib = ACTION_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return {
      resources: resSet.size ? Array.from(resSet).sort() : [...DEFAULT_RESOURCES],
      actions: actSet.size ? sortedActions : [...DEFAULT_ACTIONS],
    };
  }, [matrixQuery.data]);

  const authHeaders = useCallback(
    (): Record<string, string> => ({
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }),
    [accessToken]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/bff/auth/roles?limit=100', { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const raw = json?.data?.data ?? json?.data ?? [];
      const list: Role[] = (Array.isArray(raw) ? raw : []).map((r: Role) => ({
        ...r,
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
      }));
      setRoles(list);
      setSelectedId((cur) => {
        const next = cur && list.some((r) => r.id === cur) ? cur : list[0]?.id ?? null;
        const sel = list.find((r) => r.id === next);
        if (sel) setPerms(new Set(sel.permissions));
        return next;
      });
      setMsg('');
    } catch {
      setMsg('Failed to load roles — check that you have roles:read permission.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = roles.find((r) => r.id === selectedId) ?? null;

  function selectRole(r: Role) {
    setSelectedId(r.id);
    setPerms(new Set(r.permissions));
    setMsg('');
  }

  function has(perm: string): boolean {
    const resource = perm.split(':')[0];
    return perms.has('*') || perms.has(`${resource}:*`) || perms.has(perm);
  }

  function toggle(perm: string, value: boolean) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (value) next.add(perm);
      else next.delete(perm);
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    if (selected.isSystem) {
      setMsg('System roles cannot be modified.');
      return;
    }
    setMsg('Saving…');
    const res = await fetch(`/bff/auth/roles/${selected.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ permissions: [...perms] }),
    });
    setMsg(res.ok ? 'Saved ✓' : 'Save failed');
    if (res.ok) void load();
  }

  async function createRole() {
    if (!newName.trim()) return;
    const res = await fetch('/bff/auth/roles', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        permissions: [],
      }),
    });
    if (res.ok) {
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      void load();
    } else {
      setMsg('Create failed');
    }
  }

  async function remove(r: Role) {
    if (r.isSystem) return;
    const ok = await confirm({
      title: 'Delete role',
      description: `Delete role "${r.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/bff/auth/roles/${r.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok) {
      setSelectedId(null);
      void load();
    } else {
      setMsg('Delete failed');
    }
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Roles &amp; Permissions</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded bg-primary px-3 py-2 text-sm hover:bg-primary"
        >
          Create custom role
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-on-surface-variant">Loading roles…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="space-y-1 rounded-xl border border-outline-variant bg-surface p-2">
            {roles.length === 0 && <div className="p-2 text-sm text-on-surface-variant">No roles found.</div>}
            {roles.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
                  r.id === selectedId ? 'bg-primary/40' : 'hover:bg-surface-container-highest'
                }`}
              >
                <button className="flex-1 text-left" onClick={() => selectRole(r)}>
                  {r.name}
                  {r.isSystem ? <span className="ml-2 text-[10px] text-on-surface-variant">system</span> : null}
                </button>
                {!r.isSystem && (
                  <button
                    onClick={() => remove(r)}
                    className="ml-2 text-on-surface-variant hover:text-error"
                    title="Delete role"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4">
            {selected ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold">{selected.name}</div>
                    <div className="text-sm text-on-surface-variant">
                      {selected.description || 'No description'}
                      {perms.has('*') ? ' · full access (*)' : ''}
                    </div>
                  </div>
                  <button
                    onClick={save}
                    disabled={selected.isSystem}
                    className="rounded bg-success px-3 py-2 text-sm hover:bg-success disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save permissions
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-left uppercase tracking-wide text-on-surface-variant">
                      <tr>
                        <th className="px-3 py-2">Resource</th>
                        {actions.map((a) => (
                          <th key={a} className="px-3 py-2 text-center">{a}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {resources.map((res) => (
                        <tr key={res}>
                          <td className="px-3 py-2 font-medium capitalize">{res}</td>
                          {actions.map((a) => {
                            const perm = `${res}:${a}`;
                            return (
                              <td key={a} className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={has(perm)}
                                  disabled={selected.isSystem || perms.has('*') || perms.has(`${res}:*`)}
                                  onChange={(e) => toggle(perm, e.target.checked)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {msg ? <div className="text-sm text-on-surface-variant">{msg}</div> : null}
              </>
            ) : (
              <div className="text-sm text-on-surface-variant">Select a role to edit its permissions.</div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-outline-variant bg-surface p-4">
            <h3 className="text-lg font-semibold">Create custom role</h3>
            <div className="mt-3 grid gap-2">
              <input
                placeholder="Role name (e.g. REGIONAL_MANAGER)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded border border-outline-variant bg-surface px-3 py-2 text-sm"
              />
              <input
                placeholder="Description"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="rounded border border-outline-variant bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded border border-outline-variant px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={createRole}
                className="rounded bg-primary px-3 py-1.5 text-sm hover:bg-primary"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
