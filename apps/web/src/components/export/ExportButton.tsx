'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

interface ExportButtonProps {
  module: string;
  filters?: Record<string, unknown>;
}

export function ExportButton({ module, filters }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function onExport(format: 'csv' | 'xlsx') {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters ?? {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '' && value !== 'ALL') {
          params.set(key, String(value));
        }
      });
      if (format !== 'csv') params.set('format', format);

      // Always go same-origin with the bearer token attached. leads/deals have
      // richer dedicated CRM export routes; everything else routes through the
      // authenticated generic proxy (/api/export/:module) — never call
      // data-service (localhost:3015) directly from the browser (unauth + CORS).
      const token = useAuthStore.getState().accessToken;
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const localExportModules = new Set(['leads', 'deals']);
      const res = localExportModules.has(module)
        ? await fetch(`/api/${module}/export?${params.toString()}`, { headers: authHeaders })
        : await fetch(`/api/export/${module}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ filters, format }),
          });

      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${module}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notify.success(`Export ready - downloaded ${format.toUpperCase()}`);
    } catch (err) {
      notify.error('Export failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        disabled={loading}
        onClick={() => onExport('csv')}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
        {loading ? 'Exporting...' : 'Export'}
      </button>
    </div>
  );
}
