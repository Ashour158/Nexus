import Link from 'next/link';
import { Construction } from 'lucide-react';

interface AdminPlaceholderProps {
  title: string;
  description: string;
  /** Optional existing route that provides related functionality today. */
  relatedHref?: string;
  relatedLabel?: string;
}

/**
 * Simple "coming soon" stub for admin features whose dedicated page has not been
 * built yet. Keeps the route reachable so the Admin Panel never links to a 404.
 */
export function AdminPlaceholder({ title, description, relatedHref, relatedLabel }: AdminPlaceholderProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-outline-variant bg-inverse-surface p-12 text-center">
        <Construction className="h-8 w-8 text-on-surface-variant" />
        <p className="text-sm font-medium text-outline">This dedicated admin page is coming soon.</p>
        {relatedHref ? (
          <Link
            href={relatedHref}
            className="mt-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary"
          >
            {relatedLabel ?? 'Open related settings'}
          </Link>
        ) : null}
        <Link href="/admin" className="text-xs text-on-surface-variant hover:text-outline">
          &larr; Back to Admin Panel
        </Link>
      </div>
    </div>
  );
}
