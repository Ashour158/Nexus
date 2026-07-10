'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { File, FileText, Sheet, Loader2 } from 'lucide-react';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { apiClients } from '@/lib/api-client';
import { formatDate } from '@/lib/format';

interface FileRecord {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  entityType: string;
  entityId: string;
  uploadedBy: string;
  createdAt: string;
}

function fileIcon(mime: string) {
  if (mime === 'application/pdf') return <FileText className="h-8 w-8 text-red-500" />;
  if (mime.includes('spreadsheet') || mime.includes('excel')) return <Sheet className="h-8 w-8 text-green-600" />;
  return <File className="h-8 w-8 text-indigo-500" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');

  const { data, isLoading, refetch } = useQuery<FileRecord[]>({
    queryKey: ['documents', 'library', entityTypeFilter],
    queryFn: () =>
      apiClients.storage.get<FileRecord[]>(
        `/files${entityTypeFilter ? `?entityType=${entityTypeFilter}` : ''}`
      ),
  });

  const docs = data ?? [];

  return (
    <main className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Document Library</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setView('grid')}
            className={`rounded px-3 py-2 text-sm ${view === 'grid' ? 'bg-slate-900 text-white' : 'border border-slate-300'}`}
          >
            Grid
          </button>
          <button
            onClick={() => setView('list')}
            className={`rounded px-3 py-2 text-sm ${view === 'list' ? 'bg-slate-900 text-white' : 'border border-slate-300'}`}
          >
            List
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap gap-2 text-sm">
        <select
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1"
        >
          <option value="">All types</option>
          <option value="DEAL">Deal</option>
          <option value="CONTACT">Contact</option>
          <option value="ACCOUNT">Account</option>
          <option value="LEAD">Lead</option>
          <option value="QUOTE">Quote</option>
        </select>
        <button
          onClick={() => refetch()}
          className="ms-auto rounded border border-slate-300 px-2 py-1"
        >
          Refresh
        </button>
      </div>

      <DocumentUpload />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">No documents uploaded yet.</p>
          <p className="mt-1 text-xs text-slate-400">Upload a file above to get started.</p>
        </div>
      ) : view === 'grid' ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {docs.map((d) => (
            <Link
              key={d.id}
              href={`/documents/${d.id}`}
              className="rounded-xl border border-slate-200 bg-white p-3 hover:shadow-sm transition"
            >
              <div className="h-20 rounded bg-slate-100 grid place-items-center">
                {fileIcon(d.mimeType)}
              </div>
              <p className="mt-2 text-sm font-medium truncate">{d.filename}</p>
              <p className="text-xs text-slate-500">{d.entityType} · {d.entityId}</p>
              <p className="text-xs text-slate-500">{formatBytes(d.sizeBytes)} · {formatDate(d.createdAt)}</p>
            </Link>
          ))}
        </section>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start">Name</th>
                <th className="px-3 py-2 text-start">Type</th>
                <th className="px-3 py-2 text-start">Entity</th>
                <th className="px-3 py-2 text-start">Size</th>
                <th className="px-3 py-2 text-start">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                      {d.filename}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{d.mimeType}</td>
                  <td className="px-3 py-2 text-slate-500">{d.entityType} / {d.entityId}</td>
                  <td className="px-3 py-2">{formatBytes(d.sizeBytes)}</td>
                  <td className="px-3 py-2">{formatDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
