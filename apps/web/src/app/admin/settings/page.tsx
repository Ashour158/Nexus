'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';

interface SystemSettings {
  defaultCurrency: string;
  fromEmail: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessTimezone: string;
  dataRetentionDays: number;
  updatedBy: string;
  updatedAt: string;
}

const EMPTY: SystemSettings = {
  defaultCurrency: 'USD',
  fromEmail: '',
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
  businessTimezone: 'UTC',
  dataRetentionDays: 365,
  updatedBy: 'system',
  updatedAt: new Date(0).toISOString(),
};

export default function AdminSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [settings, setSettings] = useState<SystemSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(
    (): Record<string, string> => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    [accessToken]
  );

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetch('/api/admin/settings', { headers: authHeaders(), cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Admin access required.' : `Failed to load (${r.status})`);
        return r.json() as Promise<{ settings: SystemSettings }>;
      })
      .then((json) => {
        if (json.settings) setSettings((prev) => ({ ...prev, ...json.settings }));
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, [authHeaders]);

  const set = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const json = (await res.json()) as { settings: SystemSettings };
      if (json.settings) setSettings(json.settings);
      notify.success('System settings saved');
    } catch (err) {
      notify.error('Failed to save settings', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">System Settings</h2>
        <div className="h-72 animate-pulse rounded-xl bg-surface-container-highest" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">System Settings</h2>
        {saving ? <span className="text-xs text-on-surface-variant">Saving…</span> : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-error bg-error-container/40 p-4 text-sm text-error">{error}</div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-outline-variant bg-inverse-surface p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default currency" hint="ISO 4217 code applied to new records">
            <input
              value={settings.defaultCurrency}
              onChange={(e) => set('defaultCurrency', e.target.value.toUpperCase())}
              maxLength={8}
              className="w-full rounded border border-outline-variant bg-inverse-surface px-3 py-2 text-sm uppercase"
            />
          </Field>
          <Field label="From email" hint="Sender address for system notifications">
            <input
              type="email"
              value={settings.fromEmail}
              onChange={(e) => set('fromEmail', e.target.value)}
              placeholder="no-reply@nexus.local"
              className="w-full rounded border border-outline-variant bg-inverse-surface px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Business hours start">
            <input
              type="time"
              value={settings.businessHoursStart}
              onChange={(e) => set('businessHoursStart', e.target.value)}
              className="w-full rounded border border-outline-variant bg-inverse-surface px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Business hours end">
            <input
              type="time"
              value={settings.businessHoursEnd}
              onChange={(e) => set('businessHoursEnd', e.target.value)}
              className="w-full rounded border border-outline-variant bg-inverse-surface px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Business timezone" hint="IANA timezone, e.g. Europe/London">
            <input
              value={settings.businessTimezone}
              onChange={(e) => set('businessTimezone', e.target.value)}
              className="w-full rounded border border-outline-variant bg-inverse-surface px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Data retention (days)" hint="How long transactional data is kept (1–3650)">
            <input
              type="number"
              min={1}
              max={3650}
              value={settings.dataRetentionDays}
              onChange={(e) => set('dataRetentionDays', Number(e.target.value) || 0)}
              className="w-full rounded border border-outline-variant bg-inverse-surface px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between border-t border-outline-variant pt-4">
          <p className="text-xs text-on-surface-variant">
            Last updated by {settings.updatedBy} at{' '}
            {settings.updatedAt && settings.updatedAt !== new Date(0).toISOString()
              ? new Date(settings.updatedAt).toLocaleString()
              : 'never'}
          </p>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-outline">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-on-surface-variant">{hint}</span> : null}
    </label>
  );
}
