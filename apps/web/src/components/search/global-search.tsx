'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Bookmark, BookmarkPlus, Building2, Clock, Command, FileText, Search, TrendingUp, Trash2, User, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useRecentSearches,
  useSavedSearches,
} from '@/hooks/use-saved-searches';

interface SearchResult {
  id: string;
  type: 'contact' | 'deal' | 'lead' | 'account' | 'note';
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_CONFIG = {
  contact: { icon: User, label: 'Contact', color: 'text-blue-600', bg: 'bg-blue-50' },
  deal: { icon: TrendingUp, label: 'Deal', color: 'text-green-600', bg: 'bg-green-50' },
  lead: { icon: User, label: 'Lead', color: 'text-purple-600', bg: 'bg-purple-50' },
  account: { icon: Building2, label: 'Account', color: 'text-indigo-600', bg: 'bg-indigo-50' },
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
  // The `/api/search` proxy flattens the backend's keyed entity arrays into a
  // single tagged `hits` array with a canonical `type` + ready-made `href`.
  const data = (await res.json().catch(() => ({ hits: [] }))) as {
    hits?: Array<{ id: string; type?: string; title?: string; subtitle?: string; href?: string }>;
  };
  return (data.hits ?? []).map((hit) => {
    const t = hit.type ?? 'contact';
    const type: SearchResult['type'] =
      t === 'deal' ? 'deal' :
      t === 'lead' ? 'lead' :
      t === 'account' ? 'account' :
      t === 'contact' ? 'contact' :
      'note';
    const href =
      hit.href ??
      (type === 'deal' ? `/deals/${hit.id}` :
        type === 'account' ? `/accounts/${hit.id}` :
        type === 'lead' ? `/leads/${hit.id}` :
        `/contacts/${hit.id}`);
    return {
      id: hit.id,
      type,
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

  // Saved searches (SRCH-08) + recent searches (SRCH-09). Recent is only fetched
  // while the panel is open to avoid unnecessary requests.
  const { data: recent = [] } = useRecentSearches(10, open);
  const { data: saved = [] } = useSavedSearches();
  const createSaved = useCreateSavedSearch();
  const deleteSaved = useDeleteSavedSearch();

  const trimmed = query.trim();
  const alreadySaved = saved.some((s) => s.query.toLowerCase() === trimmed.toLowerCase());

  function handleSaveCurrent() {
    if (!trimmed || alreadySaved || createSaved.isPending) return;
    createSaved.mutate({ name: trimmed, query: trimmed });
  }

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
            {trimmed ? (
              <button
                onClick={handleSaveCurrent}
                disabled={alreadySaved || createSaved.isPending}
                title={alreadySaved ? 'Already saved' : 'Save this search'}
                aria-label={alreadySaved ? 'Search saved' : 'Save this search'}
                className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors ${
                  alreadySaved
                    ? 'text-blue-600'
                    : 'text-gray-400 hover:bg-blue-50 hover:text-blue-600'
                } disabled:cursor-default`}
              >
                {alreadySaved ? <Bookmark className="h-4 w-4 fill-current" /> : <BookmarkPlus className="h-4 w-4" />}
              </button>
            ) : null}
            {query ? (
              <button onClick={() => setQuery('')} aria-label="Clear search">
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            ) : null}
          </div>

          {!trimmed ? (
            <div className="max-h-72 overflow-y-auto py-1">
              {recent.length > 0 ? (
                <div>
                  <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Recent
                  </p>
                  {recent.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setQuery(r.query);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-start transition-colors hover:bg-gray-50"
                    >
                      <Clock className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                      <span className="truncate text-sm text-gray-700">{r.query}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {saved.length > 0 ? (
                <div>
                  <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Saved
                  </p>
                  {saved.map((s) => (
                    <div
                      key={s.id}
                      className="group flex items-center gap-3 px-4 py-2 transition-colors hover:bg-gray-50"
                    >
                      <Bookmark className="h-3.5 w-3.5 flex-shrink-0 fill-current text-blue-500" />
                      <button
                        onClick={() => {
                          setQuery(s.query);
                          setTimeout(() => inputRef.current?.focus(), 0);
                        }}
                        className="min-w-0 flex-1 text-start"
                      >
                        <span className="block truncate text-sm text-gray-700">{s.name}</span>
                        {s.name !== s.query ? (
                          <span className="block truncate text-xs text-gray-400">{s.query}</span>
                        ) : null}
                      </button>
                      <button
                        onClick={() => deleteSaved.mutate(s.id)}
                        aria-label={`Delete saved search ${s.name}`}
                        className="flex-shrink-0 rounded p-1 text-gray-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {recent.length === 0 && saved.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  Start typing to search across contacts, deals, leads and notes.
                </div>
              ) : null}
            </div>
          ) : null}

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
            <span>&#8593;&#8595; navigate</span>
            <span>&#8629; select</span>
            <span>Esc close</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
