'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

const RESOURCES = ['contacts', 'deals', 'reports', 'workflows'] as const;

type UserDetail = {
  id: string;
  name: string;
  email: string;
  role: string;
  tenant: string;
  status: string;
  joined: string;
  loginHistory: Array<{ id: string; at: string; action: string }>;
  sessions: Array<{ id: string; ip: string; device: string }>;
};

export default function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [data, setData] = useState<UserDetail | null>(null);
  const [role, setRole] = useState('ae');
  const [tenant, setTenant] = useState('Tenant 1');
  const [permissions, setPermissions] = useState<Record<string, { read: boolean; write: boolean; delete: boolean }>>(
    Object.fromEntries(RESOURCES.map((r) => [r, { read: true, write: r !== 'reports', delete: false }]))
  );
  const [banner, setBanner] = useState('');

  useEffect(() => {
    fetch(`/api/admin/users/${params.id}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        setRole(json.role ?? 'ae');
        setTenant(json.tenant ?? 'Tenant 1');
      })
      .catch(() => setData(null));
  }, [accessToken, params.id]);

  const sessions = useMemo(() => data?.sessions ?? [], [data?.sessions]);
  const history = useMemo(() => data?.loginHistory ?? [], [data?.loginHistory]);

  async function updateCurrent(payload: Record<string, unknown>, success: string) {
    setBanner('');
    try {
      const res = await fetch(`/api/admin/users/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Request failed');
      setBanner(success);
    } catch {
      setBanner('Action failed');
    }
  }

  async function deleteCurrent() {
    if (!window.confirm('Delete this user account?')) return;
    setBanner('');
    try {
      const res = await fetch(`/api/admin/users/${params.id}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!res.ok) throw new Error('Request failed');
      setBanner('User deleted');
    } catch {
      setBanner('Delete failed');
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">User #{params.id}</h2>
      {banner ? <div className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">{banner}</div> : null}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-3 font-semibold">Profile</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <div>Name: {data?.name ?? '?'}</div>
          <div>Email: {data?.email ?? '?'}</div>
          <div>Phone: +1 555 000 111</div>
          <div>Joined: {data?.joined ? new Date(data.joined).toLocaleDateString() : '?'}</div>
        </div>
      </section>
      <section className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h3 className="font-semibold">Access controls</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Role<select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-2"><option>admin</option><option>manager</option><option>ae</option><option>sdr</option></select></label>
          <label className="text-sm">Tenant<select value={tenant} onChange={(e) => setTenant(e.target.value)} className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-2"><option>Tenant 1</option><option>Tenant 2</option></select></label>
        </div>
        <div className="space-y-2">
          {RESOURCES.map((r) => (
            <div key={r} className="flex items-center justify-between rounded border border-gray-800 p-2 text-sm">
              <span className="uppercase text-gray-300">{r}</span>
              <div className="flex gap-3">
                {(['read', 'write', 'delete'] as const).map((p) => (
                  <label key={p} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={permissions[r][p]}
                      onChange={(e) => setPermissions((prev) => ({ ...prev, [r]: { ...prev[r], [p]: e.target.checked } }))}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-2 font-semibold">Login history</h3>
        <ul className="space-y-1 text-sm text-gray-300">{history.map((h) => <li key={h.id}>{new Date(h.at).toLocaleString()} - {h.action}</li>)}</ul>
      </section>
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-2 font-semibold">Active sessions</h3>
        <ul className="space-y-2 text-sm">{sessions.map((s) => <li key={s.id} className="flex items-center justify-between rounded border border-gray-800 p-2"><span>{s.device} - {s.ip}</span><button className="rounded border border-red-700 px-2 py-1 text-xs text-red-300">Revoke</button></li>)}</ul>
      </section>
      <section className="rounded-xl border border-red-900 bg-red-950/30 p-4">
        <h3 className="font-semibold text-red-300">Danger zone</h3>
        <div className="mt-2 flex gap-2">
          <button onClick={() => void updateCurrent({ status: 'Suspended' }, 'Account suspended')} className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-300">Suspend account</button>
          <button onClick={() => void deleteCurrent()} className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-300">Delete account</button>
        </div>
      </section>
      <div className="flex justify-end">
        <button
          onClick={() => void updateCurrent({ role, tenant, permissions }, 'User permissions saved')}
          className="rounded bg-blue-600 px-3 py-2 text-sm"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
