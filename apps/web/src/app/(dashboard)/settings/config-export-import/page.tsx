'use client';

import { useState } from 'react';
import { Download, FileJson, Upload } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff } from '@/lib/use-bff';
import { PrimaryButton, SetupHeader } from '@/components/settings/setup-ui';

export default function ConfigExportImportPage() {
  const { get, post } = useBff();
  const [exporting, setExporting] = useState(false);
  const [bundleText, setBundleText] = useState('');
  const [preview, setPreview] = useState<unknown | null>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setExporting(true);
    const res = await get('/bff/metadata/config/export');
    setExporting(false);
    if (!res.ok || !res.data) return notify.error('Export failed', res.error);
    const json = JSON.stringify(res.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify.success('Configuration exported');
  };

  const parseBundle = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(bundleText);
      if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
      return parsed as Record<string, unknown>;
    } catch {
      notify.error('Bundle is not valid JSON');
      return null;
    }
  };

  const runImport = async (mode: 'DRY_RUN' | 'APPLY') => {
    const bundle = parseBundle();
    if (!bundle) return;
    setBusy(true);
    const res = await post('/bff/metadata/config/import', { bundle, mode, conflict: 'SKIP' });
    setBusy(false);
    if (!res.ok) return notify.error('Import failed', res.error);
    setPreview(res.data);
    notify.success(mode === 'DRY_RUN' ? 'Dry run complete — review the diff below' : 'Configuration imported');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={FileJson}
        title="Config Export / Import"
        description="Move your low-code customization (fields, modules, layouts, picklists, validation rules) between environments as a JSON bundle."
      />

      <section className="rounded-xl border border-outline-variant bg-surface p-5">
        <h2 className="mb-1 text-lg font-semibold text-on-surface">Export</h2>
        <p className="mb-4 text-sm text-on-surface-variant">
          Download this workspace&apos;s customization bundle as a JSON file.
        </p>
        <PrimaryButton onClick={doExport} disabled={exporting}>
          <Download className="h-4 w-4" aria-hidden /> {exporting ? 'Exporting…' : 'Export configuration'}
        </PrimaryButton>
      </section>

      <section className="space-y-4 rounded-xl border border-outline-variant bg-surface p-5">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Import</h2>
          <p className="text-sm text-on-surface-variant">
            Paste a bundle, run a dry run to preview the diff, then apply. Import always rebinds to this workspace.
          </p>
        </div>
        <div>
          <label htmlFor="cfg-bundle" className="mb-1 block text-sm font-medium text-on-surface">
            Configuration bundle (JSON)
          </label>
          <textarea
            id="cfg-bundle"
            value={bundleText}
            onChange={(e) => setBundleText(e.target.value)}
            rows={10}
            placeholder='{ "version": "1.0", "globalPicklistSets": [], ... }'
            className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-mono text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => runImport('DRY_RUN')}
            disabled={busy || !bundleText.trim()}
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <FileJson className="h-4 w-4" aria-hidden /> Dry run (preview)
          </button>
          <PrimaryButton onClick={() => runImport('APPLY')} disabled={busy || !bundleText.trim()}>
            <Upload className="h-4 w-4" aria-hidden /> {busy ? 'Working…' : 'Apply import'}
          </PrimaryButton>
        </div>
        {preview !== null ? (
          <div>
            <h3 className="mb-1 text-sm font-semibold text-on-surface">Result</h3>
            <pre className="max-h-72 overflow-auto rounded-lg border border-outline-variant bg-surface-container-low p-3 text-xs text-on-surface">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}
