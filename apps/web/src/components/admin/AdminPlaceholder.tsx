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
        <p className="mt-1 text-sm text-gray-400">{description}</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-700 bg-gray-900 p-12 text-center">
        <Construction className="h-8 w-8 text-gray-500" />
        <p className="text-sm font-medium text-gray-300">This dedicated admin page is coming soon.</p>
        {relatedHref ? (
          <Link
            href={relatedHref}
            className="mt-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {relatedLabel ?? 'Open related settings'}
          </Link>
        ) : null}
        <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-200">
          &larr; Back to Admin Panel
        </Link>
      </div>
    </div>
  );
}
