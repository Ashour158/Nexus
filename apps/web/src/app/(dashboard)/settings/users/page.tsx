'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAssignUserRoles,
  useDeactivateUser,
  useInviteUser,
  useRoles,
  useUpdateUser,
  useUsers,
} from '@/hooks/use-users';
import { formatDateTime } from '@/lib/format';

export default function SettingsUsersPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteFirst, setInviteFirst] = useState('');
  const [inviteLast, setInviteLast] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');

  const usersQuery = useUsers({ search, limit: 100 });
  const rolesQuery = useRoles();
  const inviteUser = useInviteUser();
  const assignRoles = useAssignUserRoles();
  const updateUser = useUpdateUser();
  const deactivateUser = useDeactivateUser();

  const users = usersQuery.data?.data ?? [];
  const roles = rolesQuery.data?.data ?? [];
  const defaultRoleId = useMemo(() => roles[0]?.id ?? '', [roles]);

  return (
    <main className="space-y-4 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-600">Invite users, manage role and account status.</p>
        </div>
        <Button type="button" onClick={() => setInviteOpen(true)}>
          + Invite User
        </Button>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="max-w-md">
          <Input
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {usersQuery.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-56 rounded-md" />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Avatar</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Last login</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                      {(u.firstName?.[0] ?? 'U').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.roles?.[0]?.id ?? ''}
                      onChange={(e) => assignRoles.mutate({ id: u.id, roleIds: [e.target.value] })}
                      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                    >
                      <option value="">No role</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {u.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          const next = !u.isActive;
                          if (next) {
                            updateUser.mutate({ id: u.id, data: { isActive: true } });
                          } else {
                            deactivateUser.mutate(u.id);
                          }
                        }}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button type="button" variant="ghost">
                        Reset password
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>

      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Invite User</h2>
            <div className="mt-3 space-y-3">
              <Input placeholder="First name" value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} />
              <Input placeholder="Last name" value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} />
              <Input placeholder="Email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <select
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Select role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                isLoading={inviteUser.isPending}
                onClick={async () => {
                  await inviteUser.mutateAsync({
                    firstName: inviteFirst.trim(),
                    lastName: inviteLast.trim(),
                    email: inviteEmail.trim(),
                    roleIds: [inviteRoleId || defaultRoleId].filter(Boolean),
                    sendEmail: true,
                  });
                  setInviteOpen(false);
                  setInviteFirst('');
                  setInviteLast('');
                  setInviteEmail('');
                  setInviteRoleId('');
                }}
              >
                Send invite
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
