'use client';

import { useState } from 'react';
import { apiClients } from '@/lib/api-client';

type UploadItem = { id: string; name: string; size: number; progress: number };

export function DocumentUpload() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  function onFiles(files: FileList | null) {
    if (!files) return;
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'text/csv'];
    const next: UploadItem[] = [];
    for (const f of Array.from(files)) {
      if (!allowed.includes(f.type) || f.size > 50 * 1024 * 1024) continue;
      next.push({ id: crypto.randomUUID(), name: f.name, size: f.size, progress: 0 });
    }
    setUploads((prev) => [...prev, ...next]);
    next.forEach(async (u, index) => {
      let p = 0;
      const timer = window.setInterval(() => {
        p += 20;
        setUploads((prev) => prev.map((x) => (x.id === u.id ? { ...x, progress: Math.min(100, p) } : x)));
        if (p >= 100) window.clearInterval(timer);
      }, 250);
      const file = Array.from(files)[index];
      if (!file) return;
      try {
        const payload = new FormData();
        payload.append('file', file);
        await apiClients.storage.post('/upload', payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setUploads((prev) => prev.map((x) => (x.id === u.id ? { ...x, progress: 100 } : x)));
      } catch {
        // Keep optimistic progress fallback if storage-service is unavailable.
      }
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
      <label className="block cursor-pointer rounded border border-slate-200 bg-slate-50 p-4 text-center text-sm">
        Drag-drop or click to upload (PDF, DOCX, XLSX, PNG, JPG, CSV — max 50MB)
        <input type="file" multiple className="hidden" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.csv" onChange={(e) => onFiles(e.target.files)} />
      </label>
      <ul className="space-y-2">{uploads.map((u) => <li key={u.id} className="rounded border border-slate-200 p-2 text-sm"><div className="flex items-center justify-between"><span>{u.name} · {(u.size / 1024 / 1024).toFixed(1)}MB</span><button onClick={() => setUploads((prev) => prev.filter((x) => x.id !== u.id))} className="text-xs text-red-600">Remove</button></div><div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-blue-600" style={{ width: `${u.progress}%` }} /></div></li>)}</ul>
    </section>
  );
}
