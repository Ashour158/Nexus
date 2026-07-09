'use client';

import { useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { SearchIcon } from '@/components/ui/icons';

interface SearchResult {
  id: string;
  type: 'deal' | 'contact' | 'account' | 'lead';
  title: string;
  subtitle?: string;
}

// Backend `/api/v1/search` (default request) returns the four primary entities
// as keyed arrays of raw Meili documents — NOT a flat `hits` array. The typed
// api-client already unwraps the `{ success, data }` envelope, so this is the
// `data` shape.
type SearchDoc = Record<string, any> & { id?: string };

interface SearchResponse {
  deals?: SearchDoc[];
  contacts?: SearchDoc[];
  accounts?: SearchDoc[];
  leads?: SearchDoc[];
  total?: number;
}

function docId(doc: SearchDoc, legacyKey: string): string {
  return String(doc.id ?? doc[legacyKey] ?? '');
}

function fullName(doc: SearchDoc): string {
  return [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim();
}

function flattenResults(data: SearchResponse | undefined): SearchResult[] {
  if (!data) return [];
  return [
    ...(data.deals ?? []).map((d): SearchResult => {
      const id = docId(d, 'dealId');
      return {
        id,
        type: 'deal',
        title: d.name ?? `Deal ${id}`,
        subtitle: typeof d.amount === 'number' ? `$${d.amount.toLocaleString()}` : d.stageId,
      };
    }),
    ...(data.contacts ?? []).map((c): SearchResult => {
      const id = docId(c, 'contactId');
      return {
        id,
        type: 'contact',
        title: fullName(c) || c.email || `Contact ${id}`,
        subtitle: c.email,
      };
    }),
    ...(data.accounts ?? []).map((a): SearchResult => {
      const id = docId(a, 'accountId');
      return {
        id,
        type: 'account',
        title: a.name ?? `Account ${id}`,
        subtitle: a.industry ?? a.website,
      };
    }),
    ...(data.leads ?? []).map((l): SearchResult => {
      const id = docId(l, 'leadId');
      return {
        id,
        type: 'lead',
        title: fullName(l) || l.company || l.email || `Lead ${id}`,
        subtitle: l.company ?? l.email,
      };
    }),
  ];
}

const TYPE_LABELS: Record<string, string> = {
  deal: 'Deal',
  contact: 'Contact',
  account: 'Account',
  lead: 'Lead',
};

const TYPE_HREFS: Record<string, (id: string) => string> = {
  deal: (id) => `/deals/${id}`,
  contact: (id) => `/contacts/${id}`,
  account: (id) => `/accounts/${id}`,
  lead: (id) => `/leads/${id}`,
};

const TYPE_COLORS: Record<string, string> = {
  deal: 'bg-blue-100 text-blue-700',
  contact: 'bg-emerald-100 text-emerald-700',
  account: 'bg-purple-100 text-purple-700',
  lead: 'bg-orange-100 text-orange-700',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props): JSX.Element | null {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const searchQuery = useQuery({
    queryKey: ['search', query],
    queryFn: () =>
      apiClients.search.get<SearchResponse>('', { params: { q: query, limit: 8 } }),
    enabled: query.trim().length >= 2,
    staleTime: 5000,
  });

  const results: SearchResult[] = flattenResults(searchQuery.data);

  const shortcuts = [
    { label: 'New Deal', href: '/deals/new' },
    { label: 'Deals', href: '/deals' },
    { label: 'Contacts', href: '/contacts' },
    { label: 'Accounts', href: '/accounts' },
    { label: 'Reports', href: '/reports' },
  ];

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelected(0);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    const items = query.length < 2 ? shortcuts : results;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, items.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query.length < 2) {
        const shortcut = shortcuts[selected];
        if (shortcut) navigate(shortcut.href);
      } else {
        const result = results[selected];
        if (result) navigate(TYPE_HREFS[result.type]?.(result.id) ?? '/');
      }
    }
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
      />
      <div className="fixed start-1/2 top-24 z-50 w-full max-w-xl -translate-x-1/2 rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <SearchIcon size={16} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search deals, contacts, accounts..."
            className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {query.length < 2 ? (
            <>
              <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Quick navigation
              </p>
              {shortcuts.map((s, i) => (
                <button
                  key={s.href}
                  type="button"
                  onClick={() => navigate(s.href)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 ${selected === i ? 'bg-slate-50' : ''}`}
                >
                  {s.label}
                </button>
              ))}
            </>
          ) : searchQuery.isLoading ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">Searching...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              No results for &quot;{query}&quot;
            </div>
          ) : (
            <>
              <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {results.length} results
              </p>
              {results.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate(TYPE_HREFS[r.type]?.(r.id) ?? '/')}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 hover:bg-slate-50 ${selected === i ? 'bg-slate-50' : ''}`}
                >
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_COLORS[r.type] ?? 'bg-slate-100 text-slate-600'}`}
                  >
                    {TYPE_LABELS[r.type] ?? r.type}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-slate-900">{r.title}</span>
                  {r.subtitle ? (
                    <span className="truncate text-xs text-slate-400">{r.subtitle}</span>
                  ) : null}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
