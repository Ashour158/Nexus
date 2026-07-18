'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { notify } from '@/lib/toast';

interface ImportButtonProps {
  module: 'leads' | 'deals';
  onImported?: () => void;
}

export function ImportButton({ module, onImported }: ImportButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);

  async function importFile(file: File) {
    setLoading(true);
    try {
      const res = await fetch(`/api/${module}/import`, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'text/csv' },
        body: await file.text(),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        data?: { imported?: number; failed?: number };
        error?: { message?: string };
      };
      if (!res.ok && res.status !== 207) {
        throw new Error(payload.error?.message ?? 'Import failed');
      }
      const imported = payload.data?.imported ?? 0;
      const failed = payload.data?.failed ?? 0;
      notify.success(`Import complete - ${imported} added${failed ? `, ${failed} failed` : ''}`);
      onImported?.();
    } catch (err) {
      notify.error('Import failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".csv,text/csv,application/json"
        // Visually hidden and driven by the button below; still needs an accessible
        // name so axe's `label` rule passes and screen readers announce the picker.
        aria-label="Import file (CSV or JSON)"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
        }}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface hover:bg-surface-container-low disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        {loading ? 'Importing...' : 'Import'}
      </button>
    </>
  );
}
