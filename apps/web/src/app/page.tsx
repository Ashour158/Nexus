import { redirect } from 'next/navigation';

/**
 * Root route → app home.
 *
 * The previous root page was a large `'use client'` role-based landing
 * dashboard. As the root segment's page in Next.js standalone output it tripped
 * a known RSC bug ("Cannot read properties of undefined (reading
 * 'entryCSSFiles'/'clientModules')"), so `/` 500'd — and since login redirects
 * users back to their original destination (often `/`), every login landed on
 * the 500. A server-component redirect has no client modules to resolve, so it
 * renders cleanly. The landing dashboard can be reintroduced later under its own
 * route as a thin server page that renders a `'use client'` child. Its source is
 * preserved in git history.
 */
export default function RootPage() {
  redirect('/deals');
}
