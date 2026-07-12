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
  'w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/60 focus:border-primary focus:outline-none';

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
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-primary">
            <Mail className="h-4 w-4" /> Personal settings
          </p>
          <h1 className="mt-1 text-2xl font-bold text-on-surface">Mail Accounts</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Your personal sending accounts. Outbound email is sent through your default account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-surface transition hover:bg-primary"
        >
          <Plus className="h-4 w-4" /> Add account
        </button>
      </header>

      {accountsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-surface p-12 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
        </div>
      ) : accountsQuery.isError ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-surface p-12 text-sm text-error">
          <AlertTriangle className="h-4 w-4" /> Could not load mail accounts.
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant bg-surface p-12 text-center">
          <Mail className="mx-auto h-8 w-8 text-on-surface-variant" />
          <p className="mt-3 text-sm text-on-surface-variant">No mail accounts configured.</p>
          <button
            type="button"
            onClick={() => setDraft(emptyDraft())}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-surface hover:bg-primary"
          >
            <Plus className="h-4 w-4" /> Add your first account
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {accounts.map((acct) => (
            <div key={acct.id} className="flex flex-col rounded-2xl border border-outline-variant bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-on-surface">{acct.displayName}</h3>
                    {acct.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-on-surface-variant">{acct.fromEmail}</p>
                </div>
                <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-xs text-outline">{acct.provider}</span>
              </div>

              <div className="mt-3 space-y-1 text-xs text-on-surface-variant">
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
                  <p className="inline-flex items-center gap-1 text-success">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified {formatDateTime(acct.verifiedAt)}
                  </p>
                ) : acct.lastError ? (
                  <p className="inline-flex items-center gap-1 text-error">
                    <AlertTriangle className="h-3.5 w-3.5" /> {acct.lastError}
                  </p>
                ) : (
                  <p className="text-on-surface-variant">Not verified yet</p>
                )}
                {!acct.isActive && <p className="text-warning">Inactive</p>}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-3">
                <button
                  type="button"
                  onClick={() => verify.mutate(acct.id)}
                  disabled={verify.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-medium text-outline hover:bg-surface-container-highest disabled:opacity-60"
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
                    className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-medium text-outline hover:bg-surface-container-highest disabled:opacity-60"
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
                  className="ml-auto rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(acct)}
                  className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error/10 hover:text-error"
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
    <div className="fixed inset-0 z-50 flex justify-end bg-on-surface/50" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-outline-variant bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <h2 className="text-lg font-semibold text-on-surface">{isEdit ? 'Edit mail account' : 'Add mail account'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">Provider</label>
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
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">Display name</label>
              <input value={draft.displayName} onChange={(e) => set('displayName', e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">From name</label>
              <input value={draft.fromName} onChange={(e) => set('fromName', e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">From email</label>
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
            <div className="space-y-4 rounded-lg border border-outline-variant bg-surface/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">SMTP configuration</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-on-surface-variant">Host</label>
                  <input value={draft.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} placeholder="smtp.company.com" className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-on-surface-variant">Port</label>
                  <input value={draft.smtpPort} onChange={(e) => set('smtpPort', e.target.value)} inputMode="numeric" className={inputClass} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-on-surface-variant">Username</label>
                <input value={draft.smtpUsername} onChange={(e) => set('smtpUsername', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-on-surface-variant">
                  Password {isEdit && <span className="text-on-surface-variant">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={draft.smtpPassword}
                  onChange={(e) => set('smtpPassword', e.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-outline">
                <input
                  type="checkbox"
                  checked={draft.smtpSecure}
                  onChange={(e) => set('smtpSecure', e.target.checked)}
                  className="h-4 w-4 rounded border-outline bg-surface"
                />
                Use TLS/SSL (implicit — typically port 465)
              </label>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {draft.provider === 'GMAIL' ? 'Gmail' : 'Outlook'} accounts connect via OAuth. Create the account here, then
                complete the connection from your provider&apos;s OAuth flow. Verification confirms a token is stored.
              </p>
            </div>
          )}

          {!isEdit && (
            <label className="flex items-center gap-2 text-sm text-outline">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={(e) => set('isDefault', e.target.checked)}
                className="h-4 w-4 rounded border-outline bg-surface"
              />
              Make this my default sending account
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-outline-variant px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-outline hover:bg-surface-container-highest">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-surface hover:bg-primary disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Add account'}
          </button>
        </div>
      </form>
    </div>
  );
}
