'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { usePrompt } from '@/hooks/use-confirm';

interface Category { id: string; name: string }

export default function NewKnowledgePage() {
  const qc = useQueryClient();
  const { prompt, PromptDialog } = usePrompt();
  const categories = useQuery({ queryKey: ['knowledge-categories'], queryFn: () => apiClients.knowledge.get<Category[]>('/knowledge/categories') });
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState('');
  const [body, setBody] = useState('## Draft article');

  const save = useMutation({
    mutationFn: (status: 'DRAFT' | 'PUBLISHED') => apiClients.knowledge.post('/knowledge/articles', { title, body, categoryId: categoryId || null, tags: tags.split(',').map((x) => x.trim()).filter(Boolean), status, dealStages: [] }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['knowledge-articles'] }); },
  });

  const archive = useMutation({ mutationFn: (id: string) => apiClients.knowledge.post(`/knowledge/articles/${id}/archive`) });

  return (
    <main className="max-w-4xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-on-surface">New knowledge article</h1>
      <section className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full rounded border border-outline-variant px-3 py-2 text-sm" />
        <div className="grid gap-2 md:grid-cols-2"><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded border border-outline-variant px-3 py-2 text-sm"><option value="">Select category</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags: comma separated" className="rounded border border-outline-variant px-3 py-2 text-sm" /></div>
        <textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded border border-outline-variant px-3 py-2 text-sm" />
        <label className="block text-sm">Attach files<input type="file" multiple className="mt-1 block w-full text-sm" /></label>
        <div className="flex flex-wrap gap-2"><button onClick={() => save.mutate('PUBLISHED')} className="rounded bg-primary px-3 py-2 text-sm text-white" disabled={!title || save.isPending}>Publish</button><button onClick={() => save.mutate('DRAFT')} className="rounded border border-outline-variant px-3 py-2 text-sm" disabled={!title || save.isPending}>Save draft</button><button onClick={async () => { const id = await prompt('Article ID to archive', 'Archive Article'); if (!id) return; archive.mutate(id); }} className="rounded border border-error/40 px-3 py-2 text-sm text-error">Archive</button></div>
        {PromptDialog}
      </section>
    </main>
  );
}
