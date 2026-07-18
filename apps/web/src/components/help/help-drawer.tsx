'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BookOpenText, ExternalLink, Search, Sparkles, X } from 'lucide-react';

interface Article {
  id: string;
  title: string;
  category: string;
  content: string;
  views: number;
  updatedAt: string;
}

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * In-app help drawer. Surfaces the Knowledge Base (search + article list, linking
 * to the full article) plus a "What's new" shortcut. Keyboard accessible: Escape
 * closes, Tab / Shift+Tab are focus-trapped inside the panel, and focus is
 * restored to the invoking control on close — mirroring the Dialog primitive.
 */
export function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const fetchArticles = (q = '') => {
    setLoading(true);
    fetch(`/api/knowledge/articles${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      .then((r) => r.json())
      .then((d) => {
        setArticles(Array.isArray(d.data) ? d.data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  // Load articles once when the drawer first opens.
  useEffect(() => {
    if (open) fetchArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus management + focus trap (mirrors components/ui/dialog.tsx).
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const t = setTimeout(() => inputRef.current?.focus(), 50);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(t);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchArticles(query);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close help"
        onClick={onClose}
        className="absolute inset-0 bg-on-surface/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Help and Knowledge Base"
        className="absolute inset-y-0 end-0 flex h-full w-full max-w-md flex-col border-s border-outline-variant bg-surface shadow-modal outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <BookOpenText className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-on-surface">Help &amp; Knowledge</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Close help"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-outline-variant px-5 py-3">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-3">
              <Search className="h-4 w-4 shrink-0 text-on-surface-variant" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the knowledge base…"
                className="flex-1 bg-transparent py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90"
            >
              Search
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-container-high" />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-on-surface">No articles found</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Try different keywords or browse the full knowledge base.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {articles.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/knowledge/${a.id}`}
                    onClick={onClose}
                    className="block rounded-xl border border-outline-variant bg-surface p-3 transition-colors hover:bg-surface-container-high"
                  >
                    <span className="inline-block rounded-full bg-primary-container px-2 py-0.5 text-[11px] font-medium text-on-primary-container">
                      {a.category}
                    </span>
                    <p className="mt-2 text-sm font-medium text-on-surface">{a.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">
                      {a.content.slice(0, 140)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-outline-variant px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/knowledge"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <BookOpenText className="h-4 w-4" /> Browse all articles
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/whats-new"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface"
            >
              <Sparkles className="h-4 w-4" /> What&apos;s new
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
