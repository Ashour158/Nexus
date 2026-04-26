'use client';

import { useParams } from 'next/navigation';

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <main className="grid gap-4 p-4 lg:grid-cols-12">
      <section className="space-y-3 lg:col-span-8 rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">Document {params?.id}</h1>
        <div className="rounded border border-slate-200 bg-slate-50 p-2"><iframe title="preview" src="about:blank" className="h-[420px] w-full rounded bg-white" /></div>
        <div className="rounded border border-slate-200 p-3 text-sm"><h2 className="font-semibold">Comments / notes</h2><textarea rows={4} className="mt-2 w-full rounded border border-slate-300 px-3 py-2" placeholder="Add note" /></div>
      </section>
      <aside className="space-y-3 lg:col-span-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><h2 className="font-semibold text-slate-900">Metadata</h2><p>Size: 1.2 MB</p><p>Type: PDF</p><p>Uploaded: 2026-04-24</p><p>By: Mia</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><h2 className="font-semibold text-slate-900">Associated records</h2><p>Deal: Acme Expansion</p><p>Contact: John Smith</p><button className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs">Edit links</button></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><h2 className="font-semibold text-slate-900">Version history</h2><ul className="mt-2 space-y-1"><li>v2.0 <button className="ml-2 rounded border border-slate-300 px-2 py-0.5 text-xs">Download</button> <button className="ml-1 rounded border border-slate-300 px-2 py-0.5 text-xs">Restore</button></li><li>v1.1 <button className="ml-2 rounded border border-slate-300 px-2 py-0.5 text-xs">Download</button></li></ul></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><h2 className="font-semibold text-slate-900">Sharing</h2><button className="rounded border border-slate-300 px-3 py-1 text-xs">Generate signed link (24h)</button><button className="ml-2 rounded border border-blue-300 px-3 py-1 text-xs">Send for e-signature</button></div>
      </aside>
    </main>
  );
}
