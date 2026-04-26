'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

type Tenant = { id: string; name: string; plan: 'Free' | 'Pro' | 'Enterprise'; usersCount: number; dealsCount: number; storageUsed: string; createdAt: string; status: 'Active' | 'Suspended' };

export default function AdminTenantsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Tenant[]>([]);
  const [banner, setBanner] = useState('');
  const [form, setForm] = useState({ name: '', plan: 'Free', adminEmail: '', locale: 'en' });

  function loadTenants() {
    fetch('/api/admin/tenants', {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
      .then((r) => r.json())
      .then((json) => setRows(json.data ?? []))
      .catch(() => setRows([]));
  }

  useEffect(() => {
    loadTenants();
  }, [accessToken]);

  async function createTenant() {
    setBanner('');
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Request failed');
      setBanner('Tenant created');
      setOpen(false);
      setForm({ name: '', plan: 'Free', adminEmail: '', locale: 'en' });
      loadTenants();
    } catch {
      setBanner('Create tenant failed');
    }
  }

  async function updateTenant(id: string, payload: Record<string, unknown>, success: string) {
    setBanner('');
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Request failed');
      setBanner(success);
      loadTenants();
    } catch {
      setBanner('Action failed');
    }
  }

  async function deleteTenant(id: string) {
    if (!window.confirm('Delete this tenant?')) return;
    setBanner('');
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!res.ok) throw new Error('Request failed');
      setBanner('Tenant deleted');
      loadTenants();
    } catch {
      setBanner('Delete failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Tenants</h2>
        <button onClick={() => setOpen(true)} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium">Create tenant</button>
      </div>
      {banner ? <div className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">{banner}</div> : null}
      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-400"><tr><th className="px-3 py-2">Tenant</th><th>Plan</th><th>Users</th><th>Deals</th><th>Storage</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-800">{rows.map((t) => <tr key={t.id}><td className="px-3 py-2"><Link href={`/admin/tenants/${t.id}`} className="hover:underline">{t.name}</Link></td><td>{t.plan}</td><td>{t.usersCount}</td><td>{t.dealsCount}</td><td>{t.storageUsed}</td><td>{new Date(t.createdAt).toLocaleDateString()}</td><td><span className={`rounded px-2 py-0.5 text-xs ${t.status === 'Active' ? 'bg-green-900' : 'bg-red-900'}`}>{t.status}</span></td><td className="space-x-1"><button className="rounded border border-gray-700 px-2 py-1 text-xs">View</button><button onClick={() => updateTenant(t.id, { plan: t.plan === 'Free' ? 'Pro' : t.plan === 'Pro' ? 'Enterprise' : 'Pro' }, 'Plan updated')} className="rounded border border-gray-700 px-2 py-1 text-xs">Edit plan</button><button onClick={() => updateTenant(t.id, { status: t.status === 'Active' ? 'Suspended' : 'Active' }, 'Tenant status updated')} className="rounded border border-red-700 px-2 py-1 text-xs text-red-300">Suspend</button><button onClick={() => void deleteTenant(t.id)} className="rounded border border-red-700 px-2 py-1 text-xs text-red-300">Delete</button></td></tr>)}</tbody>
        </table>
      </div>
      {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-4"><h3 className="text-lg font-semibold">Create tenant</h3><div className="mt-3 grid gap-2"><input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Tenant name" className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm" /><select value={form.plan} onChange={(e) => setForm((s) => ({ ...s, plan: e.target.value }))} className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm"><option>Free</option><option>Pro</option><option>Enterprise</option></select><input value={form.adminEmail} onChange={(e) => setForm((s) => ({ ...s, adminEmail: e.target.value }))} placeholder="Admin email" className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm" /><select value={form.locale} onChange={(e) => setForm((s) => ({ ...s, locale: e.target.value }))} className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm"><option>en</option><option>ar</option></select></div><div className="mt-4 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded border border-gray-700 px-3 py-1.5 text-sm">Cancel</button><button onClick={() => void createTenant()} className="rounded bg-blue-600 px-3 py-1.5 text-sm">Create</button></div></div></div> : null}
    </div>
  );
}
