'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAssignUserRoles,
  useDeactivateUser,
  useInviteUser,
  useResetUserPassword,
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
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);

  const usersQuery = useUsers({ search, limit: 100 });
  const rolesQuery = useRoles();
  const inviteUser = useInviteUser();
  const assignRoles = useAssignUserRoles();
  const updateUser = useUpdateUser();
  const deactivateUser = useDeactivateUser();
  const resetPassword = useResetUserPassword();

  const users = usersQuery.data?.data ?? [];
  const roles = useMemo(
    () => rolesQuery.data?.data ?? [],
    [rolesQuery.data]
  );
  const defaultRoleId = useMemo(() => roles[0]?.id ?? '', [roles]);

  return (
    <main className="space-y-4 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">User Management</h1>
          <p className="text-sm text-on-surface-variant">Invite users, manage role and account status.</p>
        </div>
        <Button type="button" onClick={() => setInviteOpen(true)}>
          + Invite User
        </Button>
      </header>

      <section className="rounded-lg border border-outline-variant bg-surface p-4">
        <div className="max-w-md">
          <Input
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-outline-variant bg-surface">
        {usersQuery.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-56 rounded-md" />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
              <tr>
                <th className="px-3 py-2 text-start">Avatar</th>
                <th className="px-3 py-2 text-start">Name</th>
                <th className="px-3 py-2 text-start">Email</th>
                <th className="px-3 py-2 text-start">Role</th>
                <th className="px-3 py-2 text-start">Status</th>
                <th className="px-3 py-2 text-start">Last login</th>
                <th className="px-3 py-2 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-outline-variant">
                  <td className="px-3 py-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-inverse-surface text-xs font-semibold text-white">
                      {(u.firstName?.[0] ?? 'U').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-on-surface">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.roles?.[0]?.id ?? ''}
                      onChange={(e) => assignRoles.mutate({ id: u.id, roleIds: [e.target.value] })}
                      className="h-8 rounded-md border border-outline-variant bg-surface px-2 text-xs"
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
                        u.isActive ? 'bg-success-container text-on-success-container' : 'bg-surface-container-high text-on-surface'
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
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={resetPassword.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Reset password for ${u.email}? A one-time temporary password will be generated and their current password will stop working.`
                            )
                          ) {
                            return;
                          }
                          resetPassword.mutate(u.id, {
                            onSuccess: (res) =>
                              setResetResult({ email: u.email, password: res.temporaryPassword }),
                            onError: (err) =>
                              window.alert(`Could not reset password: ${err.message}`),
                          });
                        }}
                      >
                        Reset password
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-on-surface-variant">
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>

      {resetResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-surface p-4 shadow-xl">
            <h2 className="text-lg font-semibold text-on-surface">Temporary password</h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              Share this one-time password with <span className="font-medium">{resetResult.email}</span>. They
              will be required to set a new password on their next sign-in. It won&apos;t be shown again.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-md bg-surface-container-high p-3">
              <code className="flex-1 select-all break-all font-mono text-sm text-on-surface">
                {resetResult.password}
              </code>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigator.clipboard?.writeText(resetResult.password)}
              >
                Copy
              </Button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => setResetResult(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-surface p-4 shadow-xl">
            <h2 className="text-lg font-semibold text-on-surface">Invite User</h2>
            <div className="mt-3 space-y-3">
              <Input placeholder="First name" value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} />
              <Input placeholder="Last name" value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} />
              <Input placeholder="Email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <select
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(e.target.value)}
                className="h-9 w-full rounded-md border border-outline-variant bg-surface px-3 text-sm"
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
