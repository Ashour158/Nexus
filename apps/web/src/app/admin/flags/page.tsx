'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';

type Flag = { name: string; description: string; enabled: boolean; tenants: string[]; users: string; rollout: number; modifiedBy: string; modifiedAt: string };

const INITIAL_FLAGS: Flag[] = [
  { name: 'RULE_FORECASTING', description: 'Enable rule-based deal scoring and forecast', enabled: true, tenants: [], users: '', rollout: 50, modifiedBy: 'system', modifiedAt: new Date().toISOString() },
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
  const accessToken = useAuthStore((s) => s.accessToken);
  const [flags, setFlags] = useState<Flag[]>(INITIAL_FLAGS);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newRollout, setNewRollout] = useState('0');

  const authHeaders = useCallback((): Record<string, string> => {
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }, [accessToken]);

  // Load persisted flags from the BFF; seed with defaults if none are stored.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetch('/api/admin/flags', { headers: authHeaders() })
      .then((r) => r.json())
      .then((json: { flags?: Flag[] }) => {
        if (Array.isArray(json.flags) && json.flags.length > 0) {
          setFlags(json.flags);
        }
      })
      .catch(() => {
        /* keep defaults; surface nothing — read is best-effort */
      })
      .finally(() => setLoading(false));
  }, [authHeaders]);

  // Persist the full flags array. Optimistic: caller already applied `next`;
  // on failure we roll back to `previous` and toast.
  const persist = useCallback(
    async (next: Flag[], previous: Flag[]) => {
      setSaving(true);
      try {
        const res = await fetch('/api/admin/flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ flags: next }),
        });
        if (!res.ok) throw new Error('Save failed');
        notify.success('Feature flags saved');
      } catch {
        setFlags(previous);
        notify.error('Failed to save feature flags');
      } finally {
        setSaving(false);
      }
    },
    [authHeaders]
  );

  // Apply an update optimistically then persist.
  const mutate = useCallback(
    (updater: (prev: Flag[]) => Flag[]) => {
      setFlags((prev) => {
        const next = updater(prev);
        void persist(next, prev);
        return next;
      });
    },
    [persist]
  );

  const updateAt = (idx: number, patch: Partial<Flag>) =>
    mutate((prev) =>
      prev.map((f, i) =>
        i === idx ? { ...f, ...patch, modifiedBy: 'admin', modifiedAt: new Date().toISOString() } : f
      )
    );

  const createFlag = () => {
    const name = newName.trim();
    if (!name) return;
    const rollout = Math.min(100, Math.max(0, Number(newRollout) || 0));
    mutate((prev) => [
      ...prev,
      {
        name,
        description: newDescription.trim(),
        enabled: false,
        tenants: [],
        users: '',
        rollout,
        modifiedBy: 'admin',
        modifiedAt: new Date().toISOString(),
      },
    ]);
    setNewName('');
    setNewDescription('');
    setNewRollout('0');
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Feature Flags</h2>
          {saving ? <span className="text-xs text-on-surface-variant">Saving…</span> : null}
        </div>
        <button onClick={() => setOpen(true)} className="rounded bg-primary px-3 py-2 text-sm">Create flag</button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container-highest" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag, idx) => (
            <div key={flag.name} className="rounded-xl border border-outline-variant bg-inverse-surface p-4">
              <div className="grid gap-3 lg:grid-cols-6">
                <div className="lg:col-span-2">
                  <p className="font-mono text-sm text-primary">{flag.name}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{flag.description}</p>
                </div>
                <label className="text-xs">
                  Global
                  <input
                    type="checkbox"
                    className="ms-2"
                    checked={flag.enabled}
                    onChange={(e) => updateAt(idx, { enabled: e.target.checked })}
                  />
                </label>
                <input value={flag.tenants.join(',')} onChange={(e) => updateAt(idx, { tenants: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} placeholder="tenants csv" className="rounded border border-outline-variant bg-inverse-surface px-2 py-1.5 text-xs" />
                <input value={flag.users} onChange={(e) => updateAt(idx, { users: e.target.value })} placeholder="user emails" className="rounded border border-outline-variant bg-inverse-surface px-2 py-1.5 text-xs" />
                <div>
                  <input type="range" min={0} max={100} value={flag.rollout} onChange={(e) => updateAt(idx, { rollout: Number(e.target.value) })} />
                  <p className="text-xs text-on-surface-variant">{flag.rollout}%</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-on-surface-variant">Last modified by {flag.modifiedBy} at {new Date(flag.modifiedAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Create Feature Flag" size="lg">
          <div className="w-full rounded-xl border border-outline-variant bg-inverse-surface p-4">
            <h3 className="text-lg font-semibold">Create Feature Flag</h3>
            <div className="mt-3 grid gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="FLAG_NAME" className="rounded border border-outline-variant bg-inverse-surface px-3 py-2 text-sm" />
              <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Description" className="rounded border border-outline-variant bg-inverse-surface px-3 py-2 text-sm" />
              <input value={newRollout} onChange={(e) => setNewRollout(e.target.value)} type="number" min={0} max={100} placeholder="Rollout %" className="rounded border border-outline-variant bg-inverse-surface px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded border border-outline-variant px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={createFlag} disabled={!newName.trim()} className="rounded bg-primary px-3 py-1.5 text-sm disabled:opacity-50">Create</button>
            </div>
          </div>
      </Modal>
    </div>
  );
}
