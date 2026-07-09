'use client';

import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExportButton } from '@/components/export/ExportButton';

interface Article {
  id: string;
  title: string;
  category: string;
  content: string;
  views: number;
  updatedAt: string;
}

export default function KnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchArticles = (q = '') => {
    setLoading(true);
    fetch(`/api/knowledge/articles${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      .then((r) => r.json())
      .then((d) => {
        setArticles(d.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchArticles(query);
  };

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
        <ExportButton module="knowledge" />
      </div>
      <p className="mb-6 text-sm text-gray-500">Sales playbooks, battle cards, and product docs</p>
      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <input className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Search articles..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Search</button>
      </form>
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No articles found"
          description={`No results for "${query}". Try different keywords`}
          cta={{ label: 'Clear search', onClick: () => { setQuery(''); fetchArticles(); } }}
        />
      ) : (
        <div className="space-y-3">
          {articles.map((a) => (
            <div key={a.id} className="cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">{a.category}</span>
                  <h3 className="mt-2 font-medium text-gray-900">{a.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{a.content.slice(0, 120)}...</p>
                </div>
              </div>
              <div className="mt-3 flex justify-between text-xs text-gray-400">
                <span>{a.views} views</span>
                <span>{new Date(a.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
