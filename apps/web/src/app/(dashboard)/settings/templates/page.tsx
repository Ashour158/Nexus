'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  FileText,
  Italic,
  LayoutTemplate,
  Link2,
  List as ListIcon,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  Underline,
} from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import { SetupHeader, SetupInput, SetupSelect } from '@/components/settings/setup-ui';

type TemplateType = 'EMAIL' | 'SMS' | 'DOCUMENT';

interface TemplateSummary {
  id: string;
  name: string;
  type: TemplateType;
  module?: string | null;
  subject?: string | null;
  updatedAt?: string;
}

interface TemplateDetail extends TemplateSummary {
  body?: string | null;
}

interface MergeField {
  token: string;
  label: string;
  group?: string;
}

const TYPES: { value: TemplateType; label: string; icon: typeof Mail }[] = [
  { value: 'EMAIL', label: 'Email', icon: Mail },
  { value: 'SMS', label: 'SMS', icon: MessageSquare },
  { value: 'DOCUMENT', label: 'Document', icon: FileText },
];

const MODULES = ['deal', 'lead', 'account', 'contact', 'quote', 'ticket'];

const TYPE_ICON: Record<TemplateType, typeof Mail> = {
  EMAIL: Mail,
  SMS: MessageSquare,
  DOCUMENT: FileText,
};

/** Blank draft used for the "New template" state. */
const emptyDraft = (): TemplateDetail => ({
  id: '',
  name: '',
  type: 'EMAIL',
  module: 'deal',
  subject: '',
  body: '',
});

export default function TemplatesPage() {
  const { get, post, patch, del } = useBff();

  // ---- List (filterable) --------------------------------------------------
  const [filterType, setFilterType] = useState<'' | TemplateType>('');
  const [filterModule, setFilterModule] = useState('');

  const listEndpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (filterType) params.set('type', filterType);
    if (filterModule) params.set('module', filterModule);
    const qs = params.toString();
    return `/bff/comms/templates${qs ? `?${qs}` : ''}`;
  }, [filterType, filterModule]);

  const { rows, state, reload } = useBffList<TemplateSummary>(listEndpoint);

  // ---- Editor -------------------------------------------------------------
  const [draft, setDraft] = useState<TemplateDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const isNew = draft !== null && draft.id === '';

  const selectTemplate = useCallback(
    async (id: string) => {
      setLoadingDetail(true);
      const res = await get<TemplateDetail>(`/bff/comms/templates/${id}`);
      setLoadingDetail(false);
      if (res.ok && res.data) {
        setDraft({ ...res.data, subject: res.data.subject ?? '', body: res.data.body ?? '' });
      } else {
        notify.error('Failed to load template', res.error);
      }
    },
    [get]
  );

  const startNew = () => setDraft(emptyDraft());

  const patchDraft = (partial: Partial<TemplateDetail>) =>
    setDraft((d) => (d ? { ...d, ...partial } : d));

  // ---- Merge fields for the selected module -------------------------------
  const [mergeFields, setMergeFields] = useState<MergeField[]>([]);
  const activeModule = draft?.module ?? '';

  useEffect(() => {
    let cancelled = false;
    if (!activeModule) {
      setMergeFields([]);
      return;
    }
    void get<MergeField[]>(`/bff/comms/templates/merge-fields?module=${encodeURIComponent(activeModule)}`).then(
      (res) => {
        if (cancelled) return;
        setMergeFields(Array.isArray(res.data) ? res.data : []);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [activeModule, get]);

  const groupedFields = useMemo(() => {
    const groups: Record<string, MergeField[]> = {};
    for (const f of mergeFields) {
      const g = f.group || 'Fields';
      (groups[g] ??= []).push(f);
    }
    return groups;
  }, [mergeFields]);

  // ---- Body editing helpers (textarea + toolbar) --------------------------
  /** Insert text at the caret, or wrap the current selection with before/after. */
  const applyToBody = (before: string, after = '', placeholder = '') => {
    const el = bodyRef.current;
    const current = draft?.body ?? '';
    if (!el) {
      patchDraft({ body: current + before + placeholder + after });
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = current.slice(start, end) || placeholder;
    const next = current.slice(0, start) + before + selected + after + current.slice(end);
    patchDraft({ body: next });
    // Restore a sensible caret position after React re-renders.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + before.length + selected.length + after.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const insertMergeField = (token: string) => {
    if (!token) return;
    const wrapped = token.startsWith('{{') ? token : `{{${token}}}`;
    applyToBody(wrapped);
  };

  // ---- Live preview (debounced) -------------------------------------------
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!draft || !draft.body?.trim()) {
      setPreview(null);
      setPreviewState('idle');
      return;
    }
    const handle = setTimeout(async () => {
      setPreviewState('loading');
      const res = await post<{ subject: string; html: string }>('/bff/comms/templates/preview', {
        subject: draft.type === 'EMAIL' ? draft.subject || undefined : undefined,
        body: draft.body,
        module: draft.module || undefined,
      });
      if (res.ok && res.data) {
        setPreview(res.data);
        setPreviewState('idle');
      } else {
        setPreviewState('error');
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [draft, post]);

  // ---- Save / delete ------------------------------------------------------
  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return notify.error('Enter a template name');
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      type: draft.type,
      module: draft.module || null,
      subject: draft.type === 'EMAIL' ? draft.subject ?? '' : null,
      body: draft.body ?? '',
    };
    const res = isNew
      ? await post<TemplateDetail>('/bff/comms/templates', payload)
      : await patch<TemplateDetail>(`/bff/comms/templates/${draft.id}`, payload);
    setSaving(false);
    if (!res.ok) return notify.error('Failed to save template', res.error);
    notify.success(isNew ? 'Template created' : 'Template saved');
    if (res.data?.id) {
      setDraft({ ...res.data, subject: res.data.subject ?? '', body: res.data.body ?? '' });
    }
    void reload();
  };

  const remove = async (id: string, name: string) => {
    const res = await del(`/bff/comms/templates/${id}`);
    if (!res.ok) return notify.error('Failed to delete template', res.error);
    notify.success(`Deleted "${name}"`);
    if (draft?.id === id) setDraft(null);
    void reload();
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SetupHeader
        icon={LayoutTemplate}
        title="Templates"
        description="Design reusable email, SMS, and document templates with merge fields and a live preview. Insert {{tokens}} that resolve against each record at send time."
        onRefresh={() => void reload()}
      >
        <button
          type="button"
          onClick={startNew}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> New template
        </button>
      </SetupHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---- Left: template list ---- */}
        <aside className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <SetupSelect
              label="Type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as '' | TemplateType)}
            >
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </SetupSelect>
            <SetupSelect label="Module" value={filterModule} onChange={(e) => setFilterModule(e.target.value)}>
              <option value="">All modules</option>
              {MODULES.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {m}
                </option>
              ))}
            </SetupSelect>
          </div>

          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
            {state === 'loading' ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-on-surface-variant">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
              </div>
            ) : state === 'error' ? (
              <div className="p-8 text-center text-sm text-on-surface-variant">
                Couldn&apos;t reach the template service. Try refreshing in a moment.
              </div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center">
                <LayoutTemplate className="mx-auto mb-3 h-9 w-9 text-outline" aria-hidden />
                <p className="text-sm font-medium text-on-surface-variant">No templates yet</p>
                <p className="mt-1 text-xs text-on-surface-variant">Create your first template to get started.</p>
              </div>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-outline-variant overflow-y-auto">
                {rows.map((t) => {
                  const Icon = TYPE_ICON[t.type] ?? FileText;
                  const active = draft?.id === t.id;
                  return (
                    <li key={t.id}>
                      <div
                        className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
                          active ? 'bg-primary-container' : 'hover:bg-surface-container-low'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void selectTemplate(t.id)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-start focus:outline-none"
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${active ? 'text-on-primary-container' : 'text-on-surface-variant'}`}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <span
                              className={`block truncate text-sm font-medium ${
                                active ? 'text-on-primary-container' : 'text-on-surface'
                              }`}
                            >
                              {t.name || 'Untitled'}
                            </span>
                            <span
                              className={`block truncate text-xs ${
                                active ? 'text-on-primary-container/80' : 'text-on-surface-variant'
                              }`}
                            >
                              {t.type}
                              {t.module ? ` · ${t.module}` : ''}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(t.id, t.name)}
                          className="shrink-0 rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          aria-label={`Delete ${t.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ---- Right: editor + preview ---- */}
        <section className="min-w-0">
          {draft === null ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface p-10 text-center">
              <LayoutTemplate className="mb-3 h-10 w-10 text-outline" aria-hidden />
              <p className="text-sm font-medium text-on-surface">Select a template to edit</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Or create a new one to start designing.
              </p>
              <button
                type="button"
                onClick={startNew}
                className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Plus className="h-4 w-4" aria-hidden /> New template
              </button>
            </div>
          ) : loadingDetail ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-outline-variant bg-surface text-sm text-on-surface-variant">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Loading template…
            </div>
          ) : (
            <div className="space-y-5">
              {/* Meta */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SetupInput
                  label="Template name"
                  value={draft.name}
                  onChange={(e) => patchDraft({ name: e.target.value })}
                  placeholder="e.g. Deal won — thank you"
                />
                <SetupSelect
                  label="Type"
                  value={draft.type}
                  onChange={(e) => patchDraft({ type: e.target.value as TemplateType })}
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </SetupSelect>
                <SetupSelect
                  label="Target module"
                  value={draft.module ?? ''}
                  onChange={(e) => patchDraft({ module: e.target.value })}
                >
                  <option value="">None</option>
                  {MODULES.map((m) => (
                    <option key={m} value={m} className="capitalize">
                      {m}
                    </option>
                  ))}
                </SetupSelect>
                {draft.type === 'EMAIL' ? (
                  <SetupInput
                    label="Subject"
                    value={draft.subject ?? ''}
                    onChange={(e) => patchDraft({ subject: e.target.value })}
                    placeholder="e.g. Thanks for choosing {{account.name}}"
                  />
                ) : null}
              </div>

              {/* Body editor + preview */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {/* Editor */}
                <div className="flex flex-col rounded-xl border border-outline-variant bg-surface">
                  <div className="flex flex-wrap items-center gap-1 border-b border-outline-variant p-2">
                    <ToolbarButton label="Bold" onClick={() => applyToBody('<strong>', '</strong>', 'bold text')}>
                      <Bold className="h-4 w-4" aria-hidden />
                    </ToolbarButton>
                    <ToolbarButton label="Italic" onClick={() => applyToBody('<em>', '</em>', 'italic text')}>
                      <Italic className="h-4 w-4" aria-hidden />
                    </ToolbarButton>
                    <ToolbarButton label="Underline" onClick={() => applyToBody('<u>', '</u>', 'underlined')}>
                      <Underline className="h-4 w-4" aria-hidden />
                    </ToolbarButton>
                    <ToolbarButton label="Heading" onClick={() => applyToBody('<h2>', '</h2>', 'Heading')}>
                      <span className="text-xs font-bold">H</span>
                    </ToolbarButton>
                    <ToolbarButton
                      label="Bullet list"
                      onClick={() => applyToBody('<ul>\n  <li>', '</li>\n</ul>', 'item')}
                    >
                      <ListIcon className="h-4 w-4" aria-hidden />
                    </ToolbarButton>
                    <ToolbarButton
                      label="Link"
                      onClick={() => applyToBody('<a href="https://">', '</a>', 'link text')}
                    >
                      <Link2 className="h-4 w-4" aria-hidden />
                    </ToolbarButton>

                    <div className="ms-auto">
                      <label className="sr-only" htmlFor="merge-field-select">
                        Insert merge field
                      </label>
                      <select
                        id="merge-field-select"
                        value=""
                        onChange={(e) => {
                          insertMergeField(e.target.value);
                          e.target.value = '';
                        }}
                        disabled={mergeFields.length === 0}
                        className="rounded-lg border border-outline-variant bg-surface px-2 py-1.5 text-xs text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                      >
                        <option value="">
                          {mergeFields.length === 0 ? 'No merge fields' : '+ Insert merge field'}
                        </option>
                        {Object.entries(groupedFields).map(([group, fields]) => (
                          <optgroup key={group} label={group}>
                            {fields.map((f) => (
                              <option key={f.token} value={f.token}>
                                {f.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>

                  <textarea
                    ref={bodyRef}
                    value={draft.body ?? ''}
                    onChange={(e) => patchDraft({ body: e.target.value })}
                    placeholder="Write your template HTML here. Use the toolbar to format and insert {{merge fields}}."
                    spellCheck
                    className="min-h-[300px] flex-1 resize-y bg-transparent p-3 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
                  />
                  <p className="border-t border-outline-variant px-3 py-2 text-xs text-on-surface-variant">
                    Tip: select text then click a format button to wrap it. Merge fields resolve per record.
                  </p>
                </div>

                {/* Preview */}
                <div className="flex flex-col rounded-xl border border-outline-variant bg-surface">
                  <div className="flex items-center justify-between border-b border-outline-variant px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                      Live preview
                    </span>
                    {previewState === 'loading' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-on-surface-variant" aria-hidden />
                    ) : null}
                  </div>
                  {draft.type === 'EMAIL' && preview?.subject ? (
                    <div className="border-b border-outline-variant px-3 py-2">
                      <p className="text-xs text-on-surface-variant">Subject</p>
                      <p className="truncate text-sm font-medium text-on-surface">{preview.subject}</p>
                    </div>
                  ) : null}
                  {/*
                    Intentionally `bg-white`, not a theme token — this is the
                    canvas for the rendered email/document preview. Recipients
                    see it on white in their mail client, so theming it dark
                    would make the preview misrepresent the real output. This is
                    the one deliberate exception to the design-token rule.
                  */}
                  <div className="min-h-[300px] flex-1 bg-white">
                    {previewState === 'error' ? (
                      <div className="p-4 text-sm text-error">
                        Preview unavailable. The rendering service may be starting up.
                      </div>
                    ) : preview?.html ? (
                      <iframe
                        title="Template preview"
                        sandbox=""
                        srcDoc={preview.html}
                        className="h-full min-h-[300px] w-full border-0"
                      />
                    ) : (
                      <div className="p-4 text-sm text-on-surface-variant">
                        Start typing in the editor to see a live preview.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !draft.name.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                >
                  <Save className="h-4 w-4" aria-hidden /> {saving ? 'Saving…' : isNew ? 'Create template' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </button>
  );
}
