'use client';

import { useState } from 'react';

type MigrationSource = 'salesforce' | 'hubspot' | 'csv';
type MigrationStep = 'source' | 'upload' | 'mapping' | 'preview' | 'importing' | 'done';
type EntityType = 'contacts' | 'accounts';
interface ColumnMapping {
  sourceField: string;
  nexusField: string;
}

const NEXUS_CONTACT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'title',
  'industry',
  'city',
  'country',
  'linkedin',
];
const NEXUS_ACCOUNT_FIELDS = [
  'name',
  'website',
  'industry',
  'employees',
  'city',
  'country',
  'phone',
  'description',
];

export default function MigrationPage() {
  const [step, setStep] = useState<MigrationStep>('source');
  const [source, setSource] = useState<MigrationSource>('salesforce');
  const [entityType, setEntityType] = useState<EntityType>('contacts');
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);

  const nexusFields = entityType === 'contacts' ? NEXUS_CONTACT_FIELDS : NEXUS_ACCOUNT_FIELDS;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const text = await f.text();
    const lines = text.split('\n').filter(Boolean);
    if (!lines.length) return;
    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

    const autoMappings: ColumnMapping[] = headers.map((h) => {
      const lower = h.toLowerCase().replace(/[\s_]/g, '');
      const match =
        nexusFields.find((field) => field.toLowerCase() === lower) ||
        (lower.includes('first')
          ? 'firstName'
          : lower.includes('last')
            ? 'lastName'
            : lower.includes('email')
              ? 'email'
              : lower.includes('phone')
                ? 'phone'
                : lower.includes('company') || lower.includes('account')
                  ? entityType === 'contacts'
                    ? 'company'
                    : 'name'
                  : '');
      return { sourceField: h, nexusField: match || '' };
    });
    setMappings(autoMappings);

    const preview = lines.slice(1, 4).map((line) => {
      const vals = line.split(',').map((v) => v.trim().replace(/"/g, ''));
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
    });
    setPreviewRows(preview);
    setStep('mapping');
  };

  const handleStartImport = async () => {
    if (!file) return;
    setStep('importing');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('mappings', JSON.stringify(mappings.filter((m) => m.nexusField)));

    const res = await fetch('/api/data/imports', { method: 'POST', body: formData });
    const data = (await res.json()) as { jobId?: string };
    if (!data.jobId) {
      setStep('done');
      return;
    }

    const interval = setInterval(async () => {
      const statusRes = await fetch(`/api/data/imports/${data.jobId}`);
      const status = (await statusRes.json()) as {
        status?: string;
        totalRows?: number;
        importedRows?: number;
        failedRows?: number;
      };
      const total = status.totalRows ?? 0;
      const processed = (status.importedRows ?? 0) + (status.failedRows ?? 0);
      setImportProgress(total > 0 ? Math.round((processed / total) * 100) : 0);
      if (status.status === 'COMPLETED' || status.status === 'FAILED') {
        clearInterval(interval);
        setStep('done');
      }
    }, 1000);
  };

  return (
    <div className="max-w-2xl p-6">
      <h1 className="mb-2 text-xl font-bold text-on-surface">CRM Migration Wizard</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        Import contacts and accounts from Salesforce, HubSpot, or CSV exports
      </p>

      <div className="mb-8 flex items-center gap-2">
        {(['source', 'upload', 'mapping', 'preview', 'importing', 'done'] as MigrationStep[]).map(
          (s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  step === s
                    ? 'bg-primary text-white'
                    : ['source', 'upload', 'mapping', 'preview', 'importing', 'done'].indexOf(step) >
                        i
                      ? 'bg-success text-white'
                      : 'bg-surface-container-highest text-on-surface-variant'
                }`}
              >
                {i + 1}
              </div>
              {i < 5 ? <div className="h-0.5 w-6 bg-surface-container-highest" /> : null}
            </div>
          )
        )}
      </div>

      {step === 'source' ? (
        <div>
          <h2 className="mb-4 font-semibold text-on-surface">Choose source CRM</h2>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {([
              { id: 'salesforce', label: 'Salesforce', desc: 'Export as CSV from reports' },
              { id: 'hubspot', label: 'HubSpot', desc: 'Export from contacts or companies' },
              { id: 'csv', label: 'Generic CSV', desc: 'Any spreadsheet export' },
            ] as const).map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => setSource(src.id)}
                className={`rounded-xl border-2 p-4 text-start ${
                  source === src.id ? 'border-primary bg-primary-container' : 'border-outline-variant'
                }`}
              >
                <div className="text-sm font-medium text-on-surface">{src.label}</div>
                <div className="mt-1 text-xs text-on-surface-variant">{src.desc}</div>
              </button>
            ))}
          </div>
          <div className="mb-4 flex gap-3">
            <button
              type="button"
              onClick={() => setEntityType('contacts')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                entityType === 'contacts' ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              Contacts / Leads
            </button>
            <button
              type="button"
              onClick={() => setEntityType('accounts')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                entityType === 'accounts' ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              Accounts / Companies
            </button>
          </div>
          <button
            type="button"
            onClick={() => setStep('upload')}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white"
          >
            Next: Upload File
          </button>
        </div>
      ) : null}

      {step === 'upload' ? (
        <div>
          <h2 className="mb-2 font-semibold text-on-surface">Upload your CSV file</h2>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant p-10">
            <span className="text-sm font-medium text-on-surface-variant">Click to upload CSV</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      ) : null}

      {step === 'mapping' ? (
        <div>
          <h2 className="mb-1 font-semibold text-on-surface">Map your fields</h2>
          <div className="max-h-80 space-y-2 overflow-y-auto pe-1">
            {mappings.map((m, i) => (
              <div key={`${m.sourceField}-${i}`} className="flex items-center gap-3">
                <span className="flex-1 rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 font-mono text-sm text-on-surface">
                  {m.sourceField}
                </span>
                <select
                  className="flex-1 rounded-lg border border-outline-variant px-3 py-1.5 text-sm"
                  value={m.nexusField}
                  onChange={(e) => {
                    const next = [...mappings];
                    next[i] = { ...m, nexusField: e.target.value };
                    setMappings(next);
                  }}
                >
                  <option value="">(Skip this column)</option>
                  {nexusFields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setStep('upload')}
              className="rounded-lg bg-surface-container-high px-4 py-2 text-sm text-on-surface"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep('preview')}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-white"
            >
              Preview Import
            </button>
          </div>
        </div>
      ) : null}

      {step === 'preview' ? (
        <div>
          <h2 className="mb-1 font-semibold text-on-surface">Preview (first 3 rows)</h2>
          <div className="mb-4 overflow-x-auto">
            <table className="w-full overflow-hidden rounded-lg border border-outline-variant text-xs">
              <thead className="bg-surface-container-low">
                <tr>
                  {mappings
                    .filter((m) => m.nexusField)
                    .map((m, i) => (
                      <th key={`${m.nexusField}-${i}`} className="px-3 py-2 text-start font-medium text-on-surface-variant">
                        {m.nexusField}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-t border-outline-variant">
                    {mappings.filter((m) => m.nexusField).map((m) => (
                      <td key={m.sourceField} className="px-3 py-2 text-on-surface">
                        {row[m.sourceField] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('mapping')}
              className="rounded-lg bg-surface-container-high px-4 py-2 text-sm text-on-surface"
            >
              Edit Mapping
            </button>
            <button
              type="button"
              onClick={handleStartImport}
              className="rounded-lg bg-success px-4 py-2 text-sm font-medium text-white"
            >
              Start Import
            </button>
          </div>
        </div>
      ) : null}

      {step === 'importing' ? (
        <div className="py-8 text-center">
          <h2 className="mb-3 font-semibold text-on-surface">Importing your data...</h2>
          <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-surface-container-high">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${importProgress}%` }}
            />
          </div>
          <p className="text-sm text-on-surface-variant">{importProgress}% complete</p>
        </div>
      ) : null}

      {step === 'done' ? (
        <div className="py-8 text-center">
          <h2 className="mb-2 text-xl font-semibold text-on-surface">Import Complete</h2>
          <p className="mb-6 text-sm text-on-surface-variant">Your {entityType} were imported into NEXUS</p>
          <div className="flex justify-center gap-3">
            <a
              href={`/${entityType}`}
              className="rounded-lg bg-primary px-5 py-2 text-sm text-white"
            >
              View {entityType}
            </a>
            <button
              type="button"
              onClick={() => {
                setStep('source');
                setFile(null);
                setMappings([]);
                setPreviewRows([]);
                setImportProgress(0);
              }}
              className="rounded-lg bg-surface-container-high px-5 py-2 text-sm text-on-surface"
            >
              Import More
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
