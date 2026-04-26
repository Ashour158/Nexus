'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiClients } from '@/lib/api-client';

type Article = { id: string; title: string; body: string; categoryId?: string | null; updatedAt?: string; createdAt?: string; authorId?: string };

export default function KnowledgeArticlePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [comment, setComment] = useState('');
  const [helpful, setHelpful] = useState<'up' | 'down' | null>(null);

  const article = useQuery({ queryKey: ['knowledge-article', id], queryFn: () => apiClients.knowledge.get<Article>(`/knowledge/articles/${id}`), enabled: Boolean(id) });
  const related = useQuery({ queryKey: ['knowledge-related'], queryFn: () => apiClients.knowledge.get<Article[]>('/knowledge/articles', { params: { status: 'PUBLISHED' } }) });
  const recordView = useMutation({ mutationFn: () => apiClients.knowledge.post(`/knowledge/articles/${id}/view`, {}) });

  useEffect(() => {
    if (!id || recordView.isSuccess || recordView.isPending) return;
    recordView.mutate();
  }, [id, recordView]);

  return (
    <main className="grid gap-4 p-4 lg:grid-cols-12">
      <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-8">
        {!article.data ? <p className="text-sm text-slate-500">{article.isLoading ? 'Loading...' : 'Article not found.'}</p> : (
          <>
            <div><p className="text-xs text-slate-500">Knowledge article</p><h1 className="text-2xl font-bold text-slate-900">{article.data.title}</h1><p className="text-sm text-slate-500">Author: {article.data.authorId ?? 'N/A'} ù Last updated: {article.data.updatedAt ? new Date(article.data.updatedAt).toLocaleDateString() : 'ù'}</p></div>
            <div className="prose prose-gray max-w-none rounded bg-slate-50 p-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.data.body ?? ''}</ReactMarkdown>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="rounded border border-slate-300 px-3 py-2 text-sm">Copy link</button>
              <button
                onClick={() => {
                  const summary = article.data.body?.slice(0, 500) ?? '';
                  navigator.clipboard
                    .writeText(summary)
                    .then(() => window.alert('Copied to clipboard'))
                    .catch(() => window.alert('Could not copy'));
                }}
                className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm text-blue-600 hover:text-blue-700"
              >
                <Copy className="h-4 w-4" /> Use in email
              </button>
            </div>
            <div className="rounded border border-slate-200 p-3"><p className="text-sm font-medium">Was this helpful?</p><div className="mt-2 flex gap-2"><button onClick={() => setHelpful('up')} className={`rounded px-3 py-1 text-sm ${helpful==='up'?'bg-emerald-600 text-white':'border border-slate-300'}`}>??</button><button onClick={() => setHelpful('down')} className={`rounded px-3 py-1 text-sm ${helpful==='down'?'bg-red-600 text-white':'border border-slate-300'}`}>??</button></div><textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment" className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm" /></div>
          </>
        )}
      </article>
      <aside className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4"><h2 className="text-sm font-semibold">Related articles</h2><ul className="mt-2 space-y-2 text-sm">{(related.data ?? []).filter((x) => x.id !== id).slice(0, 5).map((a) => <li key={a.id}>{a.title}</li>)}</ul></aside>
    </main>
  );
}
