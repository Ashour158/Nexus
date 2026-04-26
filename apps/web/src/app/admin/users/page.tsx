'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

type Status = 'Active' | 'Suspended' | 'Invited';
type UserRow = { id: string; name: string; email: string; role: string; tenant: string; status: Status; joined: string; lastActive: string };
type UsersResponse = { data: UserRow[]; page: number; limit: number; total: number; totalPages: number };

export default function AdminUsersPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [tenant, setTenant] = useState('all');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState<'all' | Status>('all');
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'role' | 'tenant' | 'joined' | 'lastActive'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<UsersResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  function loadUsers() {
    const params = new URLSearchParams({ q, tenant, role, status, page: String(page), limit: '50' });
    return fetch(`/api/admin/users?${params.toString()}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
      .then((r) => r.json())
      .then((json) => setResult(json))
      .catch(() => setResult({ data: [], page: 1, limit: 50, total: 0, totalPages: 1 }));
  }

  useEffect(() => {
    void loadUsers();
  }, [accessToken, page, q, role, status, tenant]);

  const tenants = useMemo(() => Array.from(new Set((result?.data ?? []).map((u) => u.tenant))), [result?.data]);

  const pageRows = useMemo(() => {
    const rows = [...(result?.data ?? [])];
    rows.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [result?.data, sortBy, sortDir]);

  function sort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('asc');
    }
  }

  async function updateUser(id: string, payload: Record<string, unknown>, success: string) {
    setBusyId(id);
    setBanner('');
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Request failed');
      setBanner(success);
      await loadUsers();
    } catch {
      setBanner('Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(id: string) {
    if (!window.confirm('Delete this user?')) return;
    setBusyId(id);
    setBanner('');
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!res.ok) throw new Error('Request failed');
      setBanner('User deleted');
      await loadUsers();
    } catch {
      setBanner('Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">User Management</h2>
      {banner ? (
        <div className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">{banner}</div>
      ) : null}
      <div className="grid gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3 md:grid-cols-4">
        <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search name or email" className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm" />
        <select value={tenant} onChange={(e) => setTenant(e.target.value)} className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm"><option value="all">All tenants</option>{tenants.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm"><option value="all">All roles</option><option value="admin">admin</option><option value="manager">manager</option><option value="ae">ae</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | Status)} className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm"><option value="all">All statuses</option><option>Active</option><option>Suspended</option><option>Invited</option></select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-3 py-2 cursor-pointer" onClick={() => sort('name')}>Avatar+Name</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => sort('email')}>Email</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => sort('role')}>Role</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => sort('tenant')}>Tenant</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => sort('lastActive')}>Last active</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {pageRows.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2"><Link href={`/admin/users/${u.id}`} className="hover:underline">{u.name}</Link></td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2"><span className="rounded bg-blue-900 px-2 py-0.5 text-xs">{u.role}</span></td>
                <td className="px-3 py-2">{u.tenant}</td>
                <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs ${u.status === 'Active' ? 'bg-green-900' : u.status === 'Suspended' ? 'bg-red-900' : 'bg-yellow-900'}`}>{u.status}</span></td>
                <td className="px-3 py-2">{new Date(u.lastActive).toLocaleString()}</td>
                <td className="space-x-2 px-3 py-2">
                  <button disabled={busyId === u.id} onClick={() => updateUser(u.id, { role: u.role === 'ae' ? 'manager' : 'ae' }, 'Role updated')} className="rounded border border-gray-700 px-2 py-1 text-xs disabled:opacity-50">Edit role</button>
                  <button disabled={busyId === u.id} onClick={() => updateUser(u.id, { status: u.status === 'Active' ? 'Suspended' : 'Active' }, 'Status updated')} className="rounded border border-gray-700 px-2 py-1 text-xs disabled:opacity-50">Suspend/Activate</button>
                  <button disabled={busyId === u.id} onClick={() => updateUser(u.id, { resetPassword: true }, 'Password reset requested')} className="rounded border border-gray-700 px-2 py-1 text-xs disabled:opacity-50">Reset password</button>
                  <button disabled={busyId === u.id} onClick={() => void deleteUser(u.id)} className="rounded border border-red-700 px-2 py-1 text-xs text-red-300 disabled:opacity-50">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>Page {result?.page ?? page} of {result?.totalPages ?? 1} · {result?.total ?? 0} users</span>
        <div className="space-x-2">
          <button disabled={(result?.page ?? page) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-gray-700 px-3 py-1 disabled:opacity-50">Prev</button>
          <button disabled={(result?.page ?? page) >= (result?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)} className="rounded border border-gray-700 px-3 py-1 disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
  );
}
