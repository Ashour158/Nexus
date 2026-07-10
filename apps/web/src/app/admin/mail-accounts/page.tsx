'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Loader2,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';
import { formatDateTime } from '@/lib/format';
import {
  useMailAccounts,
  useCreateMailAccount,
  useUpdateMailAccount,
  useDeleteMailAccount,
  useSetDefaultMailAccount,
  useVerifyMailAccount,
  type CreateMailAccountInput,
  type MailAccount,
  type MailProvider,
} from '@/hooks/use-mail-accounts';

const inputClass =
  'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none';

const PROVIDERS: { value: MailProvider; label: string }[] = [
  { value: 'SMTP', label: 'SMTP' },
  { value: 'GMAIL', label: 'Gmail (OAuth)' },
  { value: 'OUTLOOK', label: 'Outlook (OAuth)' },
];

interface DraftState {
  id?: string;
  provider: MailProvider;
  displayName: string;
  fromEmail: string;
  fromName: string;
  isDefault: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
}

function emptyDraft(): DraftState {
  return {
    provider: 'SMTP',
    displayName: '',
    fromEmail: '',
    fromName: '',
    isDefault: false,
    smtpHost: '',
    smtpPort: '587',
    smtpSecure: false,
    smtpUsername: '',
    smtpPassword: '',
  };
}

export default function MailAccountsAdminPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const accountsQuery = useMailAccounts();
  const del = useDeleteMailAccount();
  const setDefault = useSetDefaultMailAccount();
  const verify = useVerifyMailAccount();

  const [draft, setDraft] = useState<DraftState | null>(null);

  const accounts = accountsQuery.data ?? [];

  async function handleDelete(acct: MailAccount) {
    const ok = await confirm({
      title: 'Remove mail account',
      message: `Remove “${acct.displayName}” (${acct.fromEmail})? Outbound mail using this account will stop.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) del.mutate(acct.id);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-indigo-300">
            <Mail className="h-4 w-4" /> Personal settings
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Mail Accounts</h1>
          <p className="mt-1 text-sm text-gray-400">
            Your personal sending accounts. Outbound email is sent through your default account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" /> Add account
        </button>
      </header>

      {accountsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-800 bg-gray-900 p-12 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
        </div>
      ) : accountsQuery.isError ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-800 bg-gray-900 p-12 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4" /> Could not load mail accounts.
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-12 text-center">
          <Mail className="mx-auto h-8 w-8 text-gray-600" />
          <p className="mt-3 text-sm text-gray-400">No mail accounts configured.</p>
          <button
            type="button"
            onClick={() => setDraft(emptyDraft())}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" /> Add your first account
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {accounts.map((acct) => (
            <div key={acct.id} className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-white">{acct.displayName}</h3>
                    {acct.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-gray-400">{acct.fromEmail}</p>
                </div>
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300">{acct.provider}</span>
              </div>

              <div className="mt-3 space-y-1 text-xs text-gray-500">
                {acct.smtp && (
                  <p>
                    SMTP {acct.smtp.host ?? '—'}:{acct.smtp.port ?? '—'}
                    {acct.smtp.secure ? ' · TLS' : ''}
                    {acct.smtp.hasPassword ? ' · password set' : ' · no password'}
                  </p>
                )}
                {acct.oauth && (
                  <p>{acct.oauth.connected ? 'OAuth connected' : 'OAuth not connected'}</p>
                )}
                {acct.verifiedAt ? (
                  <p className="inline-flex items-center gap-1 text-emerald-400">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified {formatDateTime(acct.verifiedAt)}
                  </p>
                ) : acct.lastError ? (
                  <p className="inline-flex items-center gap-1 text-red-300">
                    <AlertTriangle className="h-3.5 w-3.5" /> {acct.lastError}
                  </p>
                ) : (
                  <p className="text-gray-500">Not verified yet</p>
                )}
                {!acct.isActive && <p className="text-amber-300">Inactive</p>}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
                <button
                  type="button"
                  onClick={() => verify.mutate(acct.id)}
                  disabled={verify.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                >
                  {verify.isPending && verify.variables === acct.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  Verify
                </button>
                {!acct.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefault.mutate(acct.id)}
                    disabled={setDefault.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                  >
                    <Star className="h-3.5 w-3.5" /> Set default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      id: acct.id,
                      provider: acct.provider,
                      displayName: acct.displayName,
                      fromEmail: acct.fromEmail,
                      fromName: acct.fromName ?? '',
                      isDefault: acct.isDefault,
                      smtpHost: acct.smtp?.host ?? '',
                      smtpPort: acct.smtp?.port != null ? String(acct.smtp.port) : '587',
                      smtpSecure: acct.smtp?.secure ?? false,
                      smtpUsername: acct.smtp?.username ?? '',
                      smtpPassword: '',
                    })
                  }
                  className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(acct)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-500/10 hover:text-red-300"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && <MailAccountFormDrawer draft={draft} setDraft={setDraft} onClose={() => setDraft(null)} />}

      {ConfirmDialog}
    </div>
  );
}

function MailAccountFormDrawer({
  draft,
  setDraft,
  onClose,
}: {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  onClose: () => void;
}) {
  const create = useCreateMailAccount();
  const update = useUpdateMailAccount();
  const isEdit = Boolean(draft.id);
  const saving = create.isPending || update.isPending;

  function set<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft({ ...draft, [key]: value });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.displayName.trim() || !draft.fromEmail.trim()) return;

    const smtp =
      draft.provider === 'SMTP'
        ? {
            host: draft.smtpHost.trim(),
            port: Number(draft.smtpPort) || 587,
            secure: draft.smtpSecure,
            username: draft.smtpUsername.trim() || undefined,
            password: draft.smtpPassword ? draft.smtpPassword : undefined,
          }
        : undefined;

    if (isEdit && draft.id) {
      update.mutate(
        {
          id: draft.id,
          data: {
            displayName: draft.displayName.trim(),
            fromName: draft.fromName.trim() || undefined,
            // Only resend SMTP block when the user provided a new password or
            // provider is SMTP and host/port present (rotates + re-verifies).
            ...(draft.provider === 'SMTP' && smtp && smtp.host ? { smtp } : {}),
          },
        },
        { onSuccess: onClose }
      );
    } else {
      const payload: CreateMailAccountInput = {
        provider: draft.provider,
        displayName: draft.displayName.trim(),
        fromEmail: draft.fromEmail.trim(),
        fromName: draft.fromName.trim() || undefined,
        isDefault: draft.isDefault,
        ...(draft.provider === 'SMTP' && smtp ? { smtp } : {}),
      };
      create.mutate(payload, { onSuccess: onClose });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-gray-800 bg-gray-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">{isEdit ? 'Edit mail account' : 'Add mail account'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Provider</label>
            <select
              value={draft.provider}
              onChange={(e) => set('provider', e.target.value as MailProvider)}
              disabled={isEdit}
              className={`${inputClass} disabled:opacity-50`}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Display name</label>
              <input value={draft.displayName} onChange={(e) => set('displayName', e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">From name</label>
              <input value={draft.fromName} onChange={(e) => set('fromName', e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">From email</label>
            <input
              type="email"
              value={draft.fromEmail}
              onChange={(e) => set('fromEmail', e.target.value)}
              disabled={isEdit}
              placeholder="you@company.com"
              className={`${inputClass} disabled:opacity-50`}
              required
            />
          </div>

          {draft.provider === 'SMTP' ? (
            <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-950/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">SMTP configuration</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-gray-500">Host</label>
                  <input value={draft.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} placeholder="smtp.company.com" className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Port</label>
                  <input value={draft.smtpPort} onChange={(e) => set('smtpPort', e.target.value)} inputMode="numeric" className={inputClass} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Username</label>
                <input value={draft.smtpUsername} onChange={(e) => set('smtpUsername', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Password {isEdit && <span className="text-gray-600">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={draft.smtpPassword}
                  onChange={(e) => set('smtpPassword', e.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={draft.smtpSecure}
                  onChange={(e) => set('smtpSecure', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-950"
                />
                Use TLS/SSL (implicit — typically port 465)
              </label>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm text-indigo-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {draft.provider === 'GMAIL' ? 'Gmail' : 'Outlook'} accounts connect via OAuth. Create the account here, then
                complete the connection from your provider&apos;s OAuth flow. Verification confirms a token is stored.
              </p>
            </div>
          )}

          {!isEdit && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={(e) => set('isDefault', e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-950"
              />
              Make this my default sending account
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-800 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Add account'}
          </button>
        </div>
      </form>
    </div>
  );
}
