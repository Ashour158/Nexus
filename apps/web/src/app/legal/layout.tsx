import Link from 'next/link';
import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-slate-900">Nexus CRM</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/legal/privacy" className="text-slate-600 hover:text-slate-900">Privacy</Link>
            <Link href="/legal/terms" className="text-slate-600 hover:text-slate-900">Terms</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <article className="prose prose-slate max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h2:mt-8 prose-h2:text-xl">
          {children}
        </article>
      </main>
    </div>
  );
}
