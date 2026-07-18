'use client';

import { useCallback, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, X } from 'lucide-react';
import { ImportProgress } from '@/components/data/ImportProgress';

interface FieldMapping {
  csvColumn: string;
  nexusField: string;
}

const NEXUS_CONTACT_FIELDS = [
  { value: '', label: '- Skip this column -' },
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'email', label: 'Email *' },
  { value: 'phone', label: 'Phone' },
  { value: 'company', label: 'Company' },
  { value: 'title', label: 'Job Title' },
  { value: 'website', label: 'Website' },
  { value: 'notes', label: 'Notes' },
  { value: 'tags', label: 'Tags (comma-separated)' },
] as const;

type Step = 'upload' | 'map' | 'importing' | 'done';

export function CsvImportDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [fileName, setFileName] = useState('');
  const [importResult, setImportResult] = useState({ imported: 0, skipped: 0, errors: 0 });
  const [error, setError] = useState('');
  const [importJobId, setImportJobId] = useState<string | null>(null);

  function parseCSV(text: string) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
    const rows = lines.slice(1).map((line) => line.split(',').map((cell) => cell.replace(/"/g, '').trim()));
    return { headers, rows };
  }

  function autoMap(headers: string[]): FieldMapping[] {
    const aliases: Record<string, string> = {
      'first name': 'firstName', firstname: 'firstName', first: 'firstName',
      'last name': 'lastName', lastname: 'lastName', last: 'lastName',
      email: 'email', 'email address': 'email', 'e-mail': 'email',
      phone: 'phone', 'phone number': 'phone', mobile: 'phone', tel: 'phone',
      company: 'company', organization: 'company', account: 'company',
      title: 'title', 'job title': 'title', position: 'title', role: 'title',
      website: 'website', url: 'website', notes: 'notes', tags: 'tags',
    };

    return headers.map((h) => ({
      csvColumn: h,
      nexusField: aliases[h.toLowerCase()] ?? '',
    }));
  }

  const readFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMappings(autoMap(headers));
      setStep('map');
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !file.name.endsWith('.csv')) return;
      readFile(file);
    },
    [readFile]
  );

  function updateMapping(index: number, nexusField: string) {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, nexusField } : m)));
  }

  async function runImport() {
    setStep('importing');
    setError('');
    try {
      const blob = new Blob(
        [
          `${csvHeaders.join(',')}\n${csvRows
            .map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n')}`,
        ],
        { type: 'text/csv' }
      );
      const file = new File([blob], fileName || 'contacts.csv', { type: 'text/csv' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append(
        'mapping',
        JSON.stringify(
          mappings.reduce<Record<string, string>>((acc, m) => {
            if (m.nexusField) acc[m.csvColumn] = m.nexusField;
            return acc;
          }, {})
        )
      );

      const res = await fetch('/api/data/imports', { method: 'POST', body: formData });
      const result = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok) {
        setError(result.error ?? 'Import failed');
        setStep('map');
        return;
      }
      if (!result.jobId) {
        setError('Import job was not created');
        setStep('map');
        return;
      }
      setImportJobId(result.jobId);
    } catch {
      setError('Import failed');
      setStep('map');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <h2 className="font-semibold text-on-surface">Import Contacts from CSV</h2>
          <button onClick={onClose} aria-label="Close import dialog">
            <X className="h-5 w-5 text-on-surface-variant hover:text-on-surface-variant" />
          </button>
        </div>

        <div className="p-6">
          {step === 'upload' ? (
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="rounded-xl border-2 border-dashed border-outline-variant p-12 text-center transition-colors hover:border-primary"
            >
              <FileSpreadsheet className="mx-auto mb-4 h-12 w-12 text-outline" />
              <p className="mb-1 font-medium text-on-surface">Drop your CSV file here</p>
              <p className="mb-4 text-sm text-on-surface-variant">or</p>
              <label className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary">
                Choose File
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) readFile(file);
                  }}
                />
              </label>
              <p className="mt-4 text-xs text-on-surface-variant">
                Any column names are accepted — you&apos;ll map them next
              </p>
            </div>
          ) : null}

          {step === 'map' ? (
            <div>
              <p className="mb-4 text-sm text-on-surface-variant">
                <span className="font-medium">{fileName}</span> - {csvRows.length} rows detected. Map your CSV columns to NEXUS fields:
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto pe-2">
                {mappings.map((mapping, i) => (
                  <div key={mapping.csvColumn + i} className="flex items-center gap-3">
                    <div className="flex-1 truncate rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 font-mono text-sm text-on-surface">
                      {mapping.csvColumn}
                    </div>
                    <span className="text-on-surface-variant">?</span>
                    <select
                      value={mapping.nexusField}
                      onChange={(e) => updateMapping(i, e.target.value)}
                      className="flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {NEXUS_CONTACT_FIELDS.map((field) => (
                        <option key={field.value} value={field.value}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                {error ? <p className="me-auto text-sm text-error">{error}</p> : null}
                <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high">Cancel</button>
                <button onClick={runImport} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary">
                  Import {csvRows.length} Contacts
                </button>
              </div>
            </div>
          ) : null}

          {step === 'importing' ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="font-medium text-on-surface">Importing contacts...</p>
              <p className="mt-1 text-sm text-on-surface-variant">Checking for duplicates and validating emails</p>
              {importJobId ? (
                <div className="mt-5 text-start">
                  <ImportProgress
                    jobId={importJobId}
                    onComplete={() => {
                      void fetch(`/api/data/imports/${importJobId}`)
                        .then((r) => r.json())
                        .then((d) => {
                          const job = d?.data;
                          const imported = Number(job?.imported ?? 0);
                          const errorsCount = Number(job?.failed ?? 0);
                          setImportResult({
                            imported,
                            skipped: Math.max(csvRows.length - imported, 0),
                            errors: errorsCount,
                          });
                          setStep('done');
                          setImportJobId(null);
                        })
                        .catch(() => {
                          setStep('done');
                          setImportJobId(null);
                        });
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 'done' ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-success" />
              <h3 className="mb-4 text-lg font-semibold text-on-surface">Import Complete</h3>
              <p className="mb-4 text-sm text-on-surface-variant">
                Successfully imported {importResult.imported} contacts. {importResult.errors} rows had errors.
              </p>
              <div className="mb-6 flex justify-center gap-8">
                <div className="text-center">
                  <p className="text-3xl font-bold text-success">{importResult.imported}</p>
                  <p className="mt-1 text-sm text-on-surface-variant">Imported</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-warning">{importResult.skipped}</p>
                  <p className="mt-1 text-sm text-on-surface-variant">Skipped (invalid email)</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-error">{importResult.errors}</p>
                  <p className="mt-1 text-sm text-on-surface-variant">Errors</p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary">
                View Contacts
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
