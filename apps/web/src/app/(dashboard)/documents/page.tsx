'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DocumentUpload } from '@/components/documents/DocumentUpload';

const DOCS = [
  { id: 'd1', name: 'MSA-v2.pdf', type: 'PDF', folder: 'Contracts', deal: 'Acme Expansion', contact: 'John Smith', size: '1.2 MB', modified: '2026-04-25', author: 'Mia' },
  { id: 'd2', name: 'Proposal-Q2.docx', type: 'DOCX', folder: 'Proposals', deal: 'Globex Renewal', contact: 'Sara Lee', size: '0.9 MB', modified: '2026-04-24', author: 'Ahmed' },
];

export default function DocumentsPage() {
  const [view, setView] = useState<'grid' | 'list'>('grid');

  return (
    <main className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-bold text-slate-900">Document Library</h1><div className="flex gap-2"><button onClick={() => setView('grid')} className={`rounded px-3 py-2 text-sm ${view==='grid'?'bg-slate-900 text-white':'border border-slate-300'}`}>Grid</button><button onClick={() => setView('list')} className={`rounded px-3 py-2 text-sm ${view==='list'?'bg-slate-900 text-white':'border border-slate-300'}`}>List</button></div></header>
      <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap gap-2 text-sm"><select className="rounded border border-slate-300 px-2 py-1"><option>All type</option><option>PDF</option><option>DOCX</option><option>XLSX</option></select><select className="rounded border border-slate-300 px-2 py-1"><option>Date modified</option><option>Last 7 days</option><option>Last 30 days</option></select><select className="rounded border border-slate-300 px-2 py-1"><option>Associated entity</option><option>Deal</option><option>Contact</option></select><select className="rounded border border-slate-300 px-2 py-1"><option>Owner</option><option>Mia</option><option>Ahmed</option></select><div className="ml-auto flex gap-2"><button className="rounded border border-slate-300 px-2 py-1">Download zip</button><button className="rounded border border-slate-300 px-2 py-1">Move</button><button className="rounded border border-red-300 px-2 py-1 text-red-700">Delete</button></div></div>
      <DocumentUpload />
      {view === 'grid' ? <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{DOCS.map((d) => <Link key={d.id} href={`/documents/${d.id}`} className="rounded-xl border border-slate-200 bg-white p-3"><div className="h-20 rounded bg-slate-100 grid place-items-center text-xl">{d.type === 'PDF' ? '??' : d.type === 'DOCX' ? '??' : '??'}</div><p className="mt-2 text-sm font-medium">{d.name}</p><p className="text-xs text-slate-500">{d.deal} · {d.contact}</p><p className="text-xs text-slate-500">{d.size} · {d.modified} · {d.author}</p></Link>)}</section> : <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Associated</th><th className="px-3 py-2">Size</th><th className="px-3 py-2">Modified</th><th className="px-3 py-2">Author</th></tr></thead><tbody>{DOCS.map((d) => <tr key={d.id} className="border-t border-slate-100"><td className="px-3 py-2"><Link href={`/documents/${d.id}`} className="font-medium hover:underline">{d.name}</Link></td><td className="px-3 py-2">{d.type}</td><td className="px-3 py-2">{d.deal} / {d.contact}</td><td className="px-3 py-2">{d.size}</td><td className="px-3 py-2">{d.modified}</td><td className="px-3 py-2">{d.author}</td></tr>)}</tbody></table></section>}
    </main>
  );
}
