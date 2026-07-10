'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';
import { formatDate } from '@/lib/format';
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  type ApiKey,
  type CreatedApiKey,
} from '@/hooks/use-api-keys';

const inputClass =
  'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none';

const SCOPE_OPTIONS = ['read', 'write', 'admin'];

export default function ApiKeysAdminPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const keysQuery = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [expiresAt, setExpiresAt] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const keys = keysQuery.data?.data ?? [];

  function toggleScope(scope: string) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  function resetForm() {
    setShowForm(false);
    setName('');
    setScopes(['read']);
    setExpiresAt('');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      },
      {
        onSuccess: (key) => {
          setCreatedKey(key);
          resetForm();
        },
      }
    );
  }

  async function handleRevoke(key: ApiKey) {
    const ok = await confirm({
      title: 'Revoke API key',
      message: `Revoke “${key.name}” (${key.keyPrefix}…)? Any integration using it will immediately lose access.`,
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (ok) revoke.mutate(key.id);
  }

  async function copyKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — user can select manually */
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-indigo-300">
            <KeyRound className="h-4 w-4" /> Programmatic access
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">API Keys</h1>
          <p className="mt-1 text-sm text-gray-400">
            Issue scoped keys for programmatic access. The secret is shown only once at creation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" /> New key
        </button>
      </header>

      {/* Show-once secret banner */}
      {createdKey && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                <Check className="h-4 w-4" /> Key “{createdKey.name}” created
              </p>
              <p className="mt-1 text-xs text-emerald-300/80">
                Copy it now — you won&apos;t be able to see this secret again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatedKey(null)}
              className="rounded-lg p-1.5 text-emerald-300 hover:bg-emerald-500/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-emerald-500/30 bg-gray-950 px-3 py-2 font-mono text-sm text-emerald-200">
              {createdKey.key}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
        {keysQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading keys…
          </div>
        ) : keysQuery.isError ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4" /> Could not load API keys.
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-gray-600" />
            <p className="mt-3 text-sm text-gray-400">No API keys yet.</p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" /> Create your first key
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-950/50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Scopes</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-gray-950/40">
                  <td className="px-4 py-3 font-medium text-white">{key.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{key.keyPrefix}…</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.length === 0 ? (
                        <span className="text-xs text-gray-500">—</span>
                      ) : (
                        key.scopes.map((s) => (
                          <span key={s} className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300">
                            {s}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{key.expiresAt ? formatDate(key.expiresAt) : 'Never'}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(key.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRevoke(key)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create form drawer */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={resetForm}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-gray-800 bg-gray-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">New API key</h2>
              <button type="button" onClick={resetForm} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 px-6 py-5">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production integration"
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-400">Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {SCOPE_OPTIONS.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        scopes.includes(scope)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Expires <span className="text-gray-600">(optional)</span>
                </label>
                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-800 px-6 py-4">
              <button type="button" onClick={resetForm} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                disabled={create.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create key
              </button>
            </div>
          </form>
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}
