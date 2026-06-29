'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Copy, Pencil, Trash2, Archive, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  useKnowledgeArticle,
  useUpdateKnowledgeArticle,
  usePublishKnowledgeArticle,
  useArchiveKnowledgeArticle,
  useDeleteKnowledgeArticle,
} from '@/hooks/use-knowledge';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

export default function KnowledgeArticlePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('documents:read');
  const articleQuery = useKnowledgeArticle(id);
  const updateArticle = useUpdateKnowledgeArticle();
  const publishArticle = usePublishKnowledgeArticle();
  const archiveArticle = useArchiveKnowledgeArticle();
  const deleteArticle = useDeleteKnowledgeArticle();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', body: '' });

  const article = articleQuery.data;

  if (!canRead) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You do not have permission to view knowledge base articles.
        </div>
      </main>
    );
  }

  if (articleQuery.isLoading) {
    return (
      <main className="grid gap-4 p-4 lg:grid-cols-12">
        <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-8">
          <TableSkeleton rows={6} cols={1} />
        </article>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Article not found.
        </div>
        <Link href="/knowledge" className="mt-2 inline-block text-sm underline">
          Back to knowledge base
        </Link>
      </main>
    );
  }

  const art = article;

  function startEdit() {
    setEditForm({ title: art!.title, body: art!.body });
    setEditing(true);
  }

  function saveEdit() {
    updateArticle.mutate(
      { id, data: { title: editForm.title, body: editForm.body } },
      {
        onSuccess: () => {
          setEditing(false);
          notify.success('Article updated');
        },
        onError: (err) => notify.error('Update failed', err.message),
      }
    );
  }

  return (
    <main className="grid gap-4 p-4 lg:grid-cols-12">
      <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">
              <Link href="/knowledge" className="hover:text-slate-800">
                Knowledge Base
              </Link>
              <span> / </span>
              <span className="text-xs">{art.status}</span>
            </div>
            {editing ? (
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-xl font-bold text-slate-900"
              />
            ) : (
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{art.title}</h1>
            )}
            <p className="text-sm text-slate-500">
              Author: {article.authorId ?? 'N/A'} · Last updated:{' '}
              {article.updatedAt ? new Date(article.updatedAt).toLocaleDateString() : '—'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button type="button" onClick={saveEdit} disabled={updateArticle.isPending}>
                  {updateArticle.isPending ? 'Saving…' : 'Save'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={startEdit}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                {art.status === 'DRAFT' && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      publishArticle.mutate(id, {
                        onSuccess: () => notify.success('Article published'),
                        onError: (err) => notify.error('Publish failed', err.message),
                      })
                    }
                    disabled={publishArticle.isPending}
                  >
                    <CheckCircle className="h-4 w-4" /> Publish
                  </Button>
                )}
                {art.status === 'PUBLISHED' && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      archiveArticle.mutate(id, {
                        onSuccess: () => notify.success('Article archived'),
                        onError: (err) => notify.error('Archive failed', err.message),
                      })
                    }
                    disabled={archiveArticle.isPending}
                  >
                    <Archive className="h-4 w-4" /> Archive
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm('Delete this article?')) {
                      deleteArticle.mutate(id, {
                        onSuccess: () => {
                          notify.success('Article deleted');
                          router.push('/knowledge');
                        },
                        onError: (err) => notify.error('Delete failed', err.message),
                      });
                    }
                  }}
                  disabled={deleteArticle.isPending}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <textarea
            value={editForm.body}
            onChange={(e) => setEditForm((f) => ({ ...f, body: e.target.value }))}
            rows={20}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono"
          />
        ) : (
          <div className="prose prose-gray max-w-none rounded bg-slate-50 p-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{art.body ?? ''}</ReactMarkdown>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Copy link
          </button>
          <button
            onClick={() => {
              const summary = art.body?.slice(0, 500) ?? '';
              navigator.clipboard
                .writeText(summary)
                .then(() => notify.success('Copied to clipboard'))
                .catch(() => notify.error('Could not copy'));
            }}
            className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-slate-50"
          >
            <Copy className="h-4 w-4" /> Use in email
          </button>
        </div>

        {art.tags && art.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {art.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </article>

      <aside className="space-y-4 lg:col-span-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Related articles</h2>
          <p className="mt-2 text-xs text-slate-500">Related articles will appear here.</p>
        </div>
      </aside>
    </main>
  );
}
