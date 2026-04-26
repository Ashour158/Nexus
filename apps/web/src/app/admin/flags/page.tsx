'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';

type Flag = { name: string; description: string; enabled: boolean; tenants: string[]; users: string; rollout: number; modifiedBy: string; modifiedAt: string };

const INITIAL_FLAGS: Flag[] = [
  { name: 'AI_FORECASTING', description: 'Enable AI-powered deal scoring and forecast', enabled: true, tenants: [], users: '', rollout: 50, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
  { name: 'CALLING_MODULE', description: 'Show calling/dialer UI', enabled: false, tenants: [], users: '', rollout: 0, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
  { name: 'EMAIL_SEQUENCES', description: 'Enable cadence email builder', enabled: true, tenants: ['Tenant 1'], users: '', rollout: 100, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
  { name: 'WHATSAPP_INTEGRATION', description: 'WhatsApp message sending from contacts', enabled: false, tenants: [], users: '', rollout: 20, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
  { name: 'PRODUCT_CATALOG', description: 'Product/price book in deals', enabled: true, tenants: [], users: '', rollout: 100, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
  { name: 'COMMISSION_TRACKER', description: 'Commission calculator and leaderboard', enabled: true, tenants: [], users: '', rollout: 100, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
  { name: 'CUSTOMER_PORTAL', description: 'External customer portal', enabled: true, tenants: ['Tenant 3'], users: '', rollout: 60, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
  { name: 'GDPR_EXPORT', description: 'Self-service data export (GDPR Art. 20)', enabled: false, tenants: [], users: '', rollout: 0, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
  { name: 'ADVANCED_REPORTING', description: 'Custom report builder', enabled: true, tenants: ['Tenant 2'], users: '', rollout: 80, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
  { name: 'MOBILE_APP', description: 'Allow mobile app API access', enabled: true, tenants: [], users: '', rollout: 90, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
];

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<Flag[]>(INITIAL_FLAGS);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Feature Flags</h2>
        <button onClick={() => setOpen(true)} className="rounded bg-blue-600 px-3 py-2 text-sm">Create flag</button>
      </div>

      <div className="space-y-3">
        {flags.map((flag, idx) => (
          <div key={flag.name} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="grid gap-3 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <p className="font-mono text-sm text-blue-300">{flag.name}</p>
                <p className="mt-1 text-xs text-gray-400">{flag.description}</p>
              </div>
              <label className="text-xs">
                Global
                <input
                  type="checkbox"
                  className="ms-2"
                  checked={flag.enabled}
                  onChange={(e) => setFlags((prev) => prev.map((f, i) => i === idx ? { ...f, enabled: e.target.checked, modifiedAt: new Date().toISOString(), modifiedBy: 'admin' } : f))}
                />
              </label>
              <input value={flag.tenants.join(',')} onChange={(e) => setFlags((prev) => prev.map((f, i) => i === idx ? { ...f, tenants: e.target.value.split(',').map((v) => v.trim()).filter(Boolean), modifiedBy: 'admin', modifiedAt: new Date().toISOString() } : f))} placeholder="tenants csv" className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs" />
              <input value={flag.users} onChange={(e) => setFlags((prev) => prev.map((f, i) => i === idx ? { ...f, users: e.target.value, modifiedBy: 'admin', modifiedAt: new Date().toISOString() } : f))} placeholder="user emails" className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs" />
              <div>
                <input type="range" min={0} max={100} value={flag.rollout} onChange={(e) => setFlags((prev) => prev.map((f, i) => i === idx ? { ...f, rollout: Number(e.target.value), modifiedBy: 'admin', modifiedAt: new Date().toISOString() } : f))} />
                <p className="text-xs text-gray-400">{flag.rollout}%</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">Last modified by {flag.modifiedBy} at {new Date(flag.modifiedAt).toLocaleString()}</p>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Feature Flag" size="lg">
          <div className="w-full rounded-xl border border-gray-800 bg-gray-900 p-4">
            <h3 className="text-lg font-semibold">Create Feature Flag</h3>
            <div className="mt-3 grid gap-2">
              <input placeholder="FLAG_NAME" className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm" />
              <input placeholder="Description" className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm" />
              <input type="number" min={0} max={100} placeholder="Rollout %" className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded border border-gray-700 px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={() => setOpen(false)} className="rounded bg-blue-600 px-3 py-1.5 text-sm">Create</button>
            </div>
          </div>
      </Modal>
    </div>
  );
}
