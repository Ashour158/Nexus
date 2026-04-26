'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

type TenantDetail = {
  id: string;
  name: string;
  plan: string;
  users: number;
  activeDeals: number;
  revenueTracked: number;
  storageUsed: string;
  renewalDate: string;
  limits: { maxUsers: number; maxContacts: number; maxStorageGb: number; maxApiCallsPerDay: number };
};

export default function AdminTenantDetailPage({ params }: { params: { id: string } }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [data, setData] = useState<TenantDetail | null>(null);
  const [maxUsers, setMaxUsers] = useState(250);
  const [maxContacts, setMaxContacts] = useState(50000);
  const [maxStorage, setMaxStorage] = useState(250);
  const [maxApi, setMaxApi] = useState(250000);
  const [confirm, setConfirm] = useState('');
  const [banner, setBanner] = useState('');

  useEffect(() => {
    fetch(`/api/admin/tenants/${params.id}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        setMaxUsers(json?.limits?.maxUsers ?? 250);
        setMaxContacts(json?.limits?.maxContacts ?? 50000);
        setMaxStorage(json?.limits?.maxStorageGb ?? 250);
        setMaxApi(json?.limits?.maxApiCallsPerDay ?? 250000);
      })
      .catch(() => setData(null));
  }, [accessToken, params.id]);

  async function patchTenant(payload: Record<string, unknown>, success: string) {
    setBanner('');
    try {
      const res = await fetch(`/api/admin/tenants/${params.id}`, {
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

  async function deleteTenant() {
    if (!window.confirm('Delete all tenant data?')) return;
    setBanner('');
    try {
      const res = await fetch(`/api/admin/tenants/${params.id}`, {
        method: 'DELETE',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!res.ok) throw new Error('Request failed');
      setBanner('Tenant deleted');
    } catch {
      setBanner('Delete failed');
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{data?.name ?? `Tenant #${params.id}`}</h2>
      {banner ? <div className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">{banner}</div> : null}
      <section className="grid gap-3 md:grid-cols-4">
        <Card label="Users" value={String(data?.users ?? 0)} />
        <Card label="Active deals" value={String(data?.activeDeals ?? 0)} />
        <Card label="Revenue tracked" value={typeof data?.revenueTracked === 'number' ? `$${data.revenueTracked.toLocaleString()}` : '—'} />
        <Card label="Storage used" value={data?.storageUsed ?? '—'} />
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-3 font-semibold">Subscription</h3>
        <p className="text-sm text-gray-300">Plan: {data?.plan ?? '—'} · Renewal: {data?.renewalDate ?? '—'} · Usage limits editable below.</p>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-3 font-semibold">Edit limits</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Max users" value={maxUsers} onChange={setMaxUsers} />
          <Input label="Max contacts" value={maxContacts} onChange={setMaxContacts} />
          <Input label="Max storage (GB)" value={maxStorage} onChange={setMaxStorage} />
          <Input label="Max API calls/day" value={maxApi} onChange={setMaxApi} />
        </div>
      </section>

      <section className="rounded-xl border border-red-900 bg-red-950/20 p-4">
        <h3 className="font-semibold text-red-300">Danger zone</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => void patchTenant({ forceLogoutAll: true }, 'Tenant sessions revoked')} className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-300">Force logout all users</button>
          <button onClick={() => void patchTenant({ status: 'Suspended' }, 'Tenant suspended')} className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-300">Suspend tenant</button>
        </div>
        <div className="mt-4 max-w-md space-y-2 text-sm">
          <p className="text-gray-300">Type tenant name to enable hard delete:</p>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={data?.name ?? 'Tenant name'} className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2" />
          <button onClick={() => void deleteTenant()} disabled={confirm !== (data?.name ?? '')} className="rounded border border-red-700 px-3 py-1.5 text-red-300 disabled:opacity-50">Delete all data</button>
        </div>
      </section>
      <div className="flex justify-end">
        <button
          onClick={() => void patchTenant({ limits: { maxUsers, maxContacts, maxStorageGb: maxStorage, maxApiCallsPerDay: maxApi } }, 'Tenant limits saved')}
          className="rounded bg-blue-600 px-3 py-2 text-sm"
        >
          Save limits
        </button>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-gray-800 bg-gray-900 p-4"><p className="text-xs text-gray-400">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}

function Input({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="text-sm">
      {label}
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value || 0))} className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2" />
    </label>
  );
}
