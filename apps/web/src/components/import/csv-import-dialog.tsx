'use client';

import { useCallback, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, X } from 'lucide-react';

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

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.csv')) return;
    readFile(file);
  }, []);

  function readFile(file: File) {
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
  }

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

      const res = await fetch('/api/contacts/import', { method: 'POST', body: formData });
      const result = (await res.json()) as { imported?: number; errors?: unknown[]; error?: string };
      if (!res.ok) {
        setError(result.error ?? 'Import failed');
        setStep('map');
        return;
      }
      const imported = result.imported ?? 0;
      const errorsCount = (result.errors ?? []).length;
      setImportResult({ imported, skipped: Math.max(csvRows.length - imported, 0), errors: errorsCount });
      setStep('done');
    } catch {
      setError('Import failed');
      setStep('map');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Import Contacts from CSV</h2>
          <button onClick={onClose} aria-label="Close import dialog">
            <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <div className="p-6">
          {step === 'upload' ? (
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center transition-colors hover:border-blue-400"
            >
              <FileSpreadsheet className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="mb-1 font-medium text-gray-700">Drop your CSV file here</p>
              <p className="mb-4 text-sm text-gray-400">or</p>
              <label className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
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
              <p className="mt-4 text-xs text-gray-400">Any column names are accepted - you'll map them next</p>
            </div>
          ) : null}

          {step === 'map' ? (
            <div>
              <p className="mb-4 text-sm text-gray-600">
                <span className="font-medium">{fileName}</span> - {csvRows.length} rows detected. Map your CSV columns to NEXUS fields:
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto pe-2">
                {mappings.map((mapping, i) => (
                  <div key={mapping.csvColumn + i} className="flex items-center gap-3">
                    <div className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-700">
                      {mapping.csvColumn}
                    </div>
                    <span className="text-gray-400">?</span>
                    <select
                      value={mapping.nexusField}
                      onChange={(e) => updateMapping(i, e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                {error ? <p className="me-auto text-sm text-red-600">{error}</p> : null}
                <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100">Cancel</button>
                <button onClick={runImport} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                  Import {csvRows.length} Contacts
                </button>
              </div>
            </div>
          ) : null}

          {step === 'importing' ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              <p className="font-medium text-gray-700">Importing contacts...</p>
              <p className="mt-1 text-sm text-gray-400">Checking for duplicates and validating emails</p>
            </div>
          ) : null}

          {step === 'done' ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-green-500" />
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Import Complete</h3>
              <p className="mb-4 text-sm text-gray-600">
                Successfully imported {importResult.imported} contacts. {importResult.errors} rows had errors.
              </p>
              <div className="mb-6 flex justify-center gap-8">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{importResult.imported}</p>
                  <p className="mt-1 text-sm text-gray-500">Imported</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-amber-500">{importResult.skipped}</p>
                  <p className="mt-1 text-sm text-gray-500">Skipped (invalid email)</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-red-500">{importResult.errors}</p>
                  <p className="mt-1 text-sm text-gray-500">Errors</p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                View Contacts
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
