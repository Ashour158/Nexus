'use client';

import { useState } from 'react';
import { Languages, Plus, Trash2 } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import {
  Pill,
  PrimaryButton,
  SetupHeader,
  SetupInput,
  SetupPanel,
  SetupSelect,
  SetupTableCard,
} from '@/components/settings/setup-ui';

interface Translation {
  id: string;
  entityType: string;
  entityKey: string;
  locale: string;
  value: string;
}

const ENTITY_TYPES = ['field', 'module', 'picklistValue'];

export default function LabelTranslationsPage() {
  const { post, del } = useBff();
  const { rows, state, reload } = useBffList<Translation>('/bff/metadata/translations');

  const [entityType, setEntityType] = useState('field');
  const [entityKey, setEntityKey] = useState('');
  const [locale, setLocale] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!entityKey.trim() || !locale.trim() || !value.trim())
      return notify.error('Key, locale and translation are required');
    setSaving(true);
    const res = await post('/bff/metadata/translations', {
      entityType,
      entityKey: entityKey.trim(),
      locale: locale.trim(),
      value: value.trim(),
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to save translation', res.error);
    notify.success('Translation saved');
    setEntityKey('');
    setValue('');
    void reload();
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/metadata/translations/${id}`);
    if (!res.ok) return notify.error('Failed to delete translation', res.error);
    notify.success('Translation deleted');
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={Languages}
        title="Label Translations"
        description="Localize field, module, and picklist labels per locale. The base label is used wherever a translation is missing."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New translation">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SetupSelect label="Entity type" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SetupSelect>
          <SetupInput label="Entity key" value={entityKey} onChange={(e) => setEntityKey(e.target.value)} placeholder="e.g. account.name" className="font-mono" />
          <SetupInput label="Locale" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="e.g. ar, fr-FR" />
          <SetupInput label="Translation" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Localized label" />
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !entityKey.trim() || !locale.trim() || !value.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Saving…' : 'Add translation'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <SetupTableCard
        state={state}
        isEmpty={rows.length === 0}
        emptyIcon={Languages}
        emptyTitle="No translations yet"
        emptyHint="Add a translation to localize a label for a specific locale."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <th className="px-5 py-3 text-start font-medium">Type</th>
              <th className="px-5 py-3 text-start font-medium">Key</th>
              <th className="px-5 py-3 text-start font-medium">Locale</th>
              <th className="px-5 py-3 text-start font-medium">Translation</th>
              <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id} className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}>
                <td className="px-5 py-3">
                  <Pill tone="neutral">{t.entityType}</Pill>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-on-surface-variant">{t.entityKey}</td>
                <td className="px-5 py-3 text-on-surface-variant">{t.locale}</td>
                <td className="px-5 py-3 text-on-surface">{t.value}</td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => remove(t.id)}
                    className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Delete translation ${t.entityKey}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SetupTableCard>
    </div>
  );
}
