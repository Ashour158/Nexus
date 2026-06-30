'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/hooks/use-confirm';

const TERRITORY_SERVICE = '/api/territory';

interface Territory {
  id: string;
  name: string;
  region: string;
  country: string;
  currency?: string;
  managerId?: string;
  managerName?: string;
  repCount?: number;
  dealCount?: number;
  revenue?: number;
  isActive: boolean;
}

export default function TerritoriesPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', region: '', country: '', currency: 'USD' });

  const fetchTerritories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${TERRITORY_SERVICE}/territories`);
      const data = await res.json();
      setTerritories(data.data || data || []);
    } catch {
      setTerritories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTerritories();
  }, [fetchTerritories]);

  const handleCreate = async () => {
    await fetch(`${TERRITORY_SERVICE}/territories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setShowCreate(false);
    setForm({ name: '', region: '', country: '', currency: 'USD' });
    void fetchTerritories();
  };

  const handleDelete = async (id: string) => {
    if (!await confirm('Delete this territory?', 'Delete Territory')) return;
    await fetch(`${TERRITORY_SERVICE}/territories/${id}`, { method: 'DELETE' });
    void fetchTerritories();
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Territories</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage sales territories and regional assignments
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Territory
        </button>
      </div>

      {showCreate ? (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 grid grid-cols-4 gap-3">
            <input placeholder="Name" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input placeholder="Region" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            <input placeholder="Country (e.g. SA)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
            <input placeholder="Currency" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg bg-gray-200 px-3 py-1.5 text-sm text-gray-700">Cancel</button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : territories.length === 0 ? (
        <EmptyState
          icon="🗺️"
          title="No territories yet"
          description="Create territories to assign reps and track regional performance"
          cta={{ label: '+ Add Territory', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {territories.map((t) => (
            <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{t.name}</h3>
                  <p className="text-sm text-gray-500">
                    {t.region} · {t.country}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {t.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-lg font-bold text-gray-900">{t.repCount ?? 0}</p><p className="text-xs text-gray-500">Reps</p></div>
                <div><p className="text-lg font-bold text-gray-900">{t.dealCount ?? 0}</p><p className="text-xs text-gray-500">Deals</p></div>
                <div><p className="text-sm font-bold text-gray-900">{t.currency || 'USD'}</p><p className="text-xs text-gray-500">Currency</p></div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400">
                {t.managerName ? <span>MGR: {t.managerName}</span> : <span />}
                <button onClick={() => handleDelete(t.id)} className="ms-auto text-red-400 hover:text-red-600">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {ConfirmDialog}
    </div>
  );
}
