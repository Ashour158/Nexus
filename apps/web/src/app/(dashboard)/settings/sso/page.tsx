'use client';

import { useEffect, useState } from 'react';

interface SsoConfig {
  provider: string;
  entryPoint: string;
  issuer: string;
  isActive: boolean;
}

export default function SsoPage() {
  const [config, setConfig] = useState<SsoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    provider: 'azure_ad',
    entryPoint: '',
    issuer: '',
    certificate: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchConfig = () =>
    fetch('/api/auth/sso/config')
      .then(async (r) => (await r.json()) as SsoConfig | null)
      .then((d) => {
        setConfig(d);
        setLoading(false);
      });

  useEffect(() => {
    void fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/auth/sso/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    void fetchConfig();
  };

  const handleToggle = async () => {
    await fetch('/api/auth/sso/config/toggle', { method: 'PATCH' });
    void fetchConfig();
  };

  const providers = [
    { id: 'azure_ad', label: 'Microsoft Azure AD', emoji: '🔷' },
    { id: 'okta', label: 'Okta', emoji: '🔑' },
    { id: 'google', label: 'Google Workspace', emoji: '🟢' },
    { id: 'saml', label: 'Generic SAML 2.0', emoji: '🔐' },
  ];

  return (
    <div className="max-w-2xl p-6">
      <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">Single Sign-On (SSO)</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Configure SAML 2.0 or Azure AD SSO for enterprise login.
      </p>

      {!loading && config ? (
        <div
          className={`mb-6 flex items-center justify-between rounded-xl border p-4 ${
            config.isActive
              ? 'border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
              : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
          }`}
        >
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              SSO is {config.isActive ? 'enabled' : 'disabled'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Provider: {config.provider.toUpperCase()}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              config.isActive
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {config.isActive ? 'Disable SSO' : 'Enable SSO'}
          </button>
        </div>
      ) : null}

      <form
        onSubmit={handleSave}
        className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
      >
        <h2 className="mb-4 font-semibold text-gray-800 dark:text-gray-200">IdP Configuration</h2>

        <div className="mb-4">
          <label className="mb-2 block text-xs text-gray-500">Provider</label>
          <div className="grid grid-cols-2 gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, provider: p.id }))}
                className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                  form.provider === p.id
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-600'
                }`}
              >
                <span>{p.emoji}</span>
                <span className="font-medium">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">SSO Entry Point URL *</label>
            <input
              required
              type="url"
              placeholder="https://login.microsoftonline.com/{tenant}/saml2"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              value={form.entryPoint}
              onChange={(e) => setForm((f) => ({ ...f, entryPoint: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">SP Entity ID / Issuer *</label>
            <input
              required
              placeholder="nexus-crm-your-company"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              value={form.issuer}
              onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">IdP Certificate (PEM) *</label>
            <textarea
              required
              rows={5}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              value={form.certificate}
              onChange={(e) => setForm((f) => ({ ...f, certificate: e.target.value }))}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
}
