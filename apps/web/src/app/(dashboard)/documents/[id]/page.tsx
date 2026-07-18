'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';

import { TableSkeleton } from '@/components/ui/skeleton';
import { useDocumentDownloadUrl } from '@/hooks/use-documents';
import { formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('documents:read');

  // In the current storage service there is no single-file GET endpoint,
  // so we construct a minimal detail view from the download-url endpoint
  // and render the iframe from a local blob when available.
  const downloadQuery = useDocumentDownloadUrl(id);

  if (!canRead) {
    return (
      <main className="p-4">
        <div className="rounded-xl border border-warning/30 bg-warning-container p-4 text-sm text-on-warning-container">
          You do not have permission to view documents.
        </div>
      </main>
    );
  }

  const isLoading = downloadQuery.isLoading;
  const hasUrl = !!downloadQuery.data?.url;

  // For demo / placeholder metadata when backend detail endpoint is not available
  const meta = {
    name: `Document ${id.slice(0, 8)}`,
    type: 'PDF',
    size: '1.2 MB',
    uploadedAt: new Date().toISOString(),
    uploader: 'System',
  };

  if (isLoading) {
    return (
      <main className="grid gap-4 p-4 lg:grid-cols-12">
        <section className="space-y-3 lg:col-span-8">
          <TableSkeleton rows={4} cols={1} />
        </section>
        <aside className="space-y-3 lg:col-span-4">
          <TableSkeleton rows={4} cols={1} />
        </aside>
      </main>
    );
  }

  return (
    <main className="grid gap-4 p-4 lg:grid-cols-12">
      <section className="space-y-3 lg:col-span-8 rounded-xl border border-outline-variant bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-on-surface-variant">
              <Link href="/documents" className="hover:text-on-surface">
                Documents
              </Link>
              <span> / </span>
              <span className="font-mono text-xs">{id.slice(0, 8)}</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-on-surface">{meta.name}</h1>
          </div>
          {hasUrl && (
            <a
              href={downloadQuery.data?.url ?? ''}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary"
              download
            >
              Download
            </a>
          )}
        </div>

        <div className="rounded border border-outline-variant bg-surface-container-low p-2">
          {hasUrl && downloadQuery.data ? (
            <iframe
              title="preview"
              src={downloadQuery.data.url}
              className="h-[420px] w-full rounded bg-surface"
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center text-sm text-on-surface-variant">
              Preview not available
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-3 lg:col-span-4">
        <div className="rounded-xl border border-outline-variant bg-surface p-4 text-sm">
          <h2 className="font-semibold text-on-surface">Metadata</h2>
          <dl className="mt-3 space-y-2 text-on-surface-variant">
            <div className="flex justify-between gap-2">
              <dt>Type</dt>
              <dd>{meta.type}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Size</dt>
              <dd>{meta.size}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Uploaded</dt>
              <dd>{formatDate(meta.uploadedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>By</dt>
              <dd>{meta.uploader}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface p-4 text-sm">
          <h2 className="font-semibold text-on-surface">Associated records</h2>
          <p className="mt-2 text-on-surface-variant">
            Link this document to deals, contacts, or accounts from the document library.
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface p-4 text-sm">
          <h2 className="font-semibold text-on-surface">Version history</h2>
          <p className="mt-2 text-xs text-on-surface-variant">Version tracking coming soon.</p>
        </div>
      </aside>
    </main>
  );
}
