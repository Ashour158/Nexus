'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Command, FileText, Search, TrendingUp, User, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

interface SearchResult {
  id: string;
  type: 'contact' | 'deal' | 'lead' | 'note';
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_CONFIG = {
  contact: { icon: User, label: 'Contact', color: 'text-blue-600', bg: 'bg-blue-50' },
  deal: { icon: TrendingUp, label: 'Deal', color: 'text-green-600', bg: 'bg-green-50' },
  lead: { icon: User, label: 'Lead', color: 'text-purple-600', bg: 'bg-purple-50' },
  note: { icon: FileText, label: 'Note', color: 'text-gray-600', bg: 'bg-gray-50' },
} as const;

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  contact: { label: 'Contact', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  deal: { label: 'Deal', color: 'bg-green-50 text-green-700 border-green-200' },
  company: { label: 'Company', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  document: { label: 'Doc', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  activity: { label: 'Activity', color: 'bg-gray-50 text-gray-700 border-gray-200' },
};

async function searchAll(q: string): Promise<SearchResult[]> {
  if (!q.trim()) return [];
  const token = useAuthStore.getState().accessToken ?? '';
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({ hits: [] }))) as { hits?: Array<{ id: string; type?: string; title?: string; subtitle?: string }> };
  return (data.hits ?? []).map((hit) => {
    const t = hit.type ?? 'contact';
    const href =
      t === 'deal' ? `/deals/${hit.id}` :
      t === 'company' ? `/accounts/${hit.id}` :
      t === 'document' ? `/documents/${hit.id}` :
      t === 'activity' ? '/activities' :
      `/contacts/${hit.id}`;
    return {
      id: hit.id,
      type: (t === 'company' || t === 'document' || t === 'activity' ? 'note' : t) as SearchResult['type'],
      title: hit.title ?? 'Untitled',
      subtitle: hit.subtitle ?? '',
      href,
    };
  });
}

export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchAll(query);
      setResults(r);
      setLoading(false);
      setActive(0);
    }, 200);

    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    }
    if (e.key === 'Enter' && results[active]) {
      window.location.href = results[active].href;
    }
  }

  return (
    <div
      ref={containerRef}
      className={compact ? 'relative h-11 w-11 shrink-0' : 'relative w-full min-w-[280px] max-w-[460px]'}
    >
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        aria-label="Search (?K)"
        title="Search (?K)"
        className={
          compact
            ? 'flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500 transition-colors hover:border-blue-200 hover:bg-white hover:text-slate-700'
            : 'flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500 transition-colors hover:border-blue-200 hover:bg-white hover:text-slate-700'
        }
      >
        <Search className="h-4 w-4 shrink-0" />
        {!compact ? (
          <>
            <span className="min-w-0 flex-1 truncate text-start">Search contacts, deals, notes...</span>
            <kbd className="ms-auto hidden items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:flex">
              <Command className="h-3 w-3" />K
            </kbd>
          </>
        ) : null}
      </button>

      {open ? (
        <div
          className={
            compact
              ? 'absolute end-0 top-full z-50 mt-1 w-[min(90vw,28rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl'
              : 'absolute start-0 end-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl'
          }
        >
          <div className="flex items-center gap-2 border-b border-gray-100 px-3">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search across contacts, deals, leads, notes..."
              className="flex-1 py-3 text-sm text-gray-900 outline-none placeholder-gray-400"
            />
            {query ? (
              <button onClick={() => setQuery('')}>
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            ) : null}
          </div>

          {loading ? <div className="px-4 py-6 text-center text-sm text-gray-400">Searching...</div> : null}
          {!loading && results.length === 0 && query.trim() ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">No results for &quot;{query}&quot;</div>
          ) : null}

          {!loading && results.length > 0 ? (
            <div className="max-h-72 overflow-y-auto py-1">
              {results.map((r, i) => {
                const cfg = TYPE_CONFIG[r.type];
                const Icon = cfg.icon;
                return (
                  <Link
                    key={r.id}
                    href={r.href}
                    onClick={() => {
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${i === active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${cfg.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{r.title}</p>
                      <p className="truncate text-xs text-gray-500">{r.subtitle}</p>
                    </div>
                    {TYPE_BADGES[(r as unknown as { type: string }).type] ? (
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${TYPE_BADGES[(r as unknown as { type: string }).type].color}`}>
                        {TYPE_BADGES[(r as unknown as { type: string }).type].label}
                      </span>
                    ) : (
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ) : null}

          <div className="flex items-center gap-3 border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] text-gray-400">
            <span>?? navigate</span>
            <span>? select</span>
            <span>Esc close</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
