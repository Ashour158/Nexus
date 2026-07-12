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
  'w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/60 focus:border-primary focus:outline-none';

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
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-primary">
            <KeyRound className="h-4 w-4" /> Programmatic access
          </p>
          <h1 className="mt-1 text-2xl font-bold text-on-surface">API Keys</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Issue scoped keys for programmatic access. The secret is shown only once at creation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-surface transition hover:bg-primary"
        >
          <Plus className="h-4 w-4" /> New key
        </button>
      </header>

      {/* Show-once secret banner */}
      {createdKey && (
        <div className="rounded-2xl border border-success/40 bg-success/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-success">
                <Check className="h-4 w-4" /> Key “{createdKey.name}” created
              </p>
              <p className="mt-1 text-xs text-success/80">
                Copy it now — you won&apos;t be able to see this secret again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatedKey(null)}
              className="rounded-lg p-1.5 text-success hover:bg-success/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-success/30 bg-surface px-3 py-2 font-mono text-sm text-success">
              {createdKey.key}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="inline-flex items-center gap-1.5 rounded-lg border border-success/40 px-3 py-2 text-xs font-medium text-success hover:bg-success/20"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface">
        {keysQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading keys…
          </div>
        ) : keysQuery.isError ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-error">
            <AlertTriangle className="h-4 w-4" /> Could not load API keys.
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-on-surface-variant" />
            <p className="mt-3 text-sm text-on-surface-variant">No API keys yet.</p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-surface hover:bg-primary"
            >
              <Plus className="h-4 w-4" /> Create your first key
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface/50 text-left text-xs uppercase tracking-wide text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Scopes</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-surface/40">
                  <td className="px-4 py-3 font-medium text-on-surface">{key.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">{key.keyPrefix}…</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.length === 0 ? (
                        <span className="text-xs text-on-surface-variant">—</span>
                      ) : (
                        key.scopes.map((s) => (
                          <span key={s} className="rounded-full bg-surface-container-highest px-2 py-0.5 text-[11px] text-outline">
                            {s}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{key.expiresAt ? formatDate(key.expiresAt) : 'Never'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{formatDate(key.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRevoke(key)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-medium text-outline hover:bg-error/10 hover:text-error"
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
        <div className="fixed inset-0 z-50 flex justify-end bg-on-surface/50" onClick={resetForm}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-outline-variant bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
              <h2 className="text-lg font-semibold text-on-surface">New API key</h2>
              <button type="button" onClick={resetForm} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 px-6 py-5">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production integration"
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {SCOPE_OPTIONS.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        scopes.includes(scope)
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-highest text-outline hover:bg-surface-container-high'
                      }`}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                  Expires <span className="text-on-surface-variant">(optional)</span>
                </label>
                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-outline-variant px-6 py-4">
              <button type="button" onClick={resetForm} className="rounded-lg px-4 py-2 text-sm font-medium text-outline hover:bg-surface-container-highest">
                Cancel
              </button>
              <button
                type="submit"
                disabled={create.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-surface hover:bg-primary disabled:opacity-60"
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
