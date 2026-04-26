'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

type Category = { id: string; name: string };
type Article = { id: string; title: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; categoryId?: string | null; updatedAt?: string; viewCount?: number };

export default function KnowledgePage() {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('all');

  const categories = useQuery({ queryKey: ['knowledge-categories'], queryFn: () => apiClients.knowledge.get<Category[]>('/knowledge/categories') });
  const articles = useQuery({
    queryKey: ['knowledge-articles', q, categoryId],
    queryFn: () => apiClients.knowledge.get<Article[]>('/knowledge/articles', { params: { search: q || undefined, categoryId: categoryId === 'all' ? undefined : categoryId, status: 'PUBLISHED' } }),
  });

  const items = articles.data ?? [];
  const featured = useMemo(() => items.slice(0, 3), [items]);
  const popular = useMemo(() => [...items].sort((a, b) => Number(b.viewCount ?? 0) - Number(a.viewCount ?? 0)).slice(0, 5), [items]);

  return (
    <main className="grid gap-4 p-4 lg:grid-cols-12">
      <aside className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-3">
        <h2 className="text-sm font-semibold">Categories</h2>
        <div className="mt-2 space-y-1">
          <button onClick={() => setCategoryId('all')} className={`block w-full rounded px-2 py-1 text-left text-sm ${categoryId==='all'?'bg-slate-900 text-white':'hover:bg-slate-100'}`}>All</button>
          {(categories.data ?? []).map((c) => <button key={c.id} onClick={() => setCategoryId(c.id)} className={`block w-full rounded px-2 py-1 text-left text-sm ${categoryId===c.id?'bg-slate-900 text-white':'hover:bg-slate-100'}`}>{c.name}</button>)}
        </div>
      </aside>
      <section className="space-y-4 lg:col-span-9">
        <div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-slate-900">Knowledge Base</h1><Link href="/knowledge/new" className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white">New article</Link></div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search knowledge" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <div className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-white p-3 md:col-span-2"><h2 className="text-sm font-semibold">Featured articles</h2><ul className="mt-2 space-y-2">{featured.map((a) => <li key={a.id}><Link href={`/knowledge/${a.id}`} className="text-sm font-medium hover:underline">{a.title}</Link></li>)}</ul></div><div className="rounded-xl border border-slate-200 bg-white p-3"><h2 className="text-sm font-semibold">Popular this week</h2><ul className="mt-2 space-y-2 text-sm">{popular.map((a) => <li key={`p-${a.id}`}>{a.title}</li>)}</ul></div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><h2 className="text-sm font-semibold">Recently updated</h2><ul className="mt-2 space-y-2">{items.map((a) => <li key={`r-${a.id}`} className="flex items-center justify-between text-sm"><Link href={`/knowledge/${a.id}`} className="hover:underline">{a.title}</Link><span className="text-xs text-slate-500">{a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : '—'}</span></li>)}</ul>{items.length===0?<p className="text-sm text-slate-500">{articles.isLoading?'Loading...':'No articles found.'}</p>:null}</div>
      </section>
    </main>
  );
}
