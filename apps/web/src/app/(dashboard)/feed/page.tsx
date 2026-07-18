'use client';

import Link from 'next/link';
import { Activity, Rss } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { useFeed, type FeedActivity } from '@/hooks/use-follow';

/**
 * "Following" feed — recent activity across records the current user follows.
 * Reads GET /me/feed. Degrades to an empty state when the endpoint is
 * unavailable (the hook returns []).
 */
export default function FeedPage() {
  const feedQuery = useFeed(50);
  const items = feedQuery.data ?? [];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-[#dbe7f3] bg-surface shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-primary via-success to-warning" />
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/30">
            <Rss className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">Your following feed</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-on-surface">Following</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
              Recent activity across the accounts and contacts you follow. Follow a record
              from its detail page to see its updates here.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#e7edf3] bg-surface p-4 shadow-sm">
        {feedQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="📡"
            title="Nothing to show yet"
            description="Follow accounts and contacts to see their recent activity in one place."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((item, index) => (
              <FeedItem key={String(item.id ?? index)} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FeedItem({ item }: { item: FeedActivity }) {
  const when = item.at ?? item.createdAt;
  const title = item.title ?? item.type ?? 'Activity';
  const ENTITY_ROUTES: Record<string, string> = {
    account: 'accounts',
    contact: 'contacts',
    deal: 'deals',
    lead: 'leads',
  };
  const entitySegment = item.entityType ? ENTITY_ROUTES[item.entityType] : undefined;
  const href =
    entitySegment && item.entityId ? `/${entitySegment}/${item.entityId}` : undefined;

  const body = (
    <div className="rounded-xl border border-outline-variant bg-surface p-4 transition hover:border-primary/40 hover:bg-primary-container/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-lg bg-primary-container p-1.5 text-primary">
            <Activity className="h-4 w-4" />
          </span>
          <p className="truncate text-sm font-bold text-on-surface">{title}</p>
        </div>
        {when ? <span className="text-xs text-on-surface-variant">{formatDateTime(when)}</span> : null}
      </div>
      {item.description ? (
        <p className="mt-2 text-xs text-on-surface-variant">{item.description}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        {item.entityName ? (
          <span className="rounded bg-surface-container-high px-1.5 py-0.5 font-semibold text-on-surface-variant">
            {item.entityName}
          </span>
        ) : null}
        {item.actorName ? <span className="text-on-surface-variant">by {item.actorName}</span> : null}
      </div>
    </div>
  );

  return <li>{href ? <Link href={href}>{body}</Link> : body}</li>;
}
