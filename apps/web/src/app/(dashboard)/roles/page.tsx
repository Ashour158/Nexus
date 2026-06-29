'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCreateRole,
  useDeleteRole,
  useRolePermissionsMatrix,
  useRoles,
  useUpdateRole,
} from '@/hooks/use-roles';
import { useUiStore } from '@/stores/ui.store';

export default function RolesPage(): JSX.Element {
  const toast = useUiStore((s) => s.pushToast);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  const rolesQuery = useRoles();
  const matrixQuery = useRolePermissionsMatrix();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const allPermissions = matrixQuery.data?.permissions ?? [];
  const roles = useMemo(() => rolesQuery.data?.data ?? [], [rolesQuery.data]);
  const filteredRoles = useMemo(() => {
    if (!search.trim()) return roles;
    const s = search.toLowerCase();
    return roles.filter((r) => r.name.toLowerCase().includes(s));
  }, [roles, search]);

  const openCreate = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setSelectedPerms(new Set());
    setModalOpen(true);
  };

  const openEdit = (role: { id: string; name: string; description?: string | null; permissions: string[] }) => {
    setEditingRole(role.id);
    setRoleName(role.name);
    setRoleDescription(role.description ?? '');
    setSelectedPerms(new Set(role.permissions));
    setModalOpen(true);
  };

  const handleSave = async () => {
    const name = roleName.trim();
    if (!name) {
      toast({ variant: 'error', title: 'Role name is required' });
      return;
    }
    const perms = Array.from(selectedPerms);
    try {
      if (editingRole) {
        await updateRole.mutateAsync({ id: editingRole, data: { name, description: roleDescription, permissions: perms } });
        toast({ variant: 'success', title: 'Role updated' });
      } else {
        await createRole.mutateAsync({ name, description: roleDescription, permissions: perms });
        toast({ variant: 'success', title: 'Role created' });
      }
      setModalOpen(false);
    } catch (e) {
      toast({ variant: 'error', title: 'Save failed', description: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete role "${name}"? This cannot be undone.`)) return;
    try {
      await deleteRole.mutateAsync(id);
      toast({ variant: 'success', title: 'Role deleted' });
    } catch (e) {
      toast({ variant: 'error', title: 'Delete failed', description: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const togglePerm = (perm: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roles & Permissions</h1>
          <p className="text-sm text-slate-600">Create roles and define what each team member can access.</p>
        </div>
        <Button onClick={openCreate}>+ Create Role</Button>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="max-w-md">
          <Input
            placeholder="Search roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {rolesQuery.isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3 text-start">Role</th>
                <th className="px-4 py-3 text-start">Description</th>
                <th className="px-4 py-3 text-start">Permissions</th>
                <th className="px-4 py-3 text-center">System</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoles.map((role) => (
                <tr key={role.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{role.name}</td>
                  <td className="px-4 py-3 text-slate-600">{role.description ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {role.permissions?.length ?? 0} permissions
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {role.isSystem ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">System</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Custom</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => openEdit(role)} disabled={role.isSystem}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(role.id, role.name)}
                        disabled={role.isSystem}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRoles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No roles found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {editingRole ? 'Edit Role' : 'Create Role'}
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Role name</label>
                <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="e.g. Sales Manager" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Description</label>
                <Input value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} placeholder="Optional description" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Permissions</label>
                {matrixQuery.isLoading ? (
                  <Skeleton className="h-32" />
                ) : (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-200 p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {allPermissions.map((perm) => (
                        <label key={perm} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedPerms.has(perm)}
                            onChange={() => togglePerm(perm)}
                            className="rounded border-slate-300"
                          />
                          <span className="font-mono text-xs">{perm}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                isLoading={createRole.isPending || updateRole.isPending}
              >
                {editingRole ? 'Save changes' : 'Create role'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
