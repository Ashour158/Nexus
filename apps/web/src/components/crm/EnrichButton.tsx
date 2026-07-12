'use client';

import { useState } from 'react';

export function EnrichButton({
  entityType,
  entityId,
}: {
  entityType: 'contact' | 'account';
  entityId: string;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleEnrich = async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/crm/enrich/${entityType}/${entityId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Enrichment request failed');
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
    }
  };

  return (
    <button
      type="button"
      onClick={handleEnrich}
      disabled={status === 'loading'}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        status === 'done'
          ? 'bg-success-container text-success'
          : status === 'error'
            ? 'bg-error-container text-error'
            : status === 'loading'
              ? 'bg-surface-container-high text-on-surface-variant'
              : 'bg-primary-container text-primary hover:bg-primary-container'
      }`}
    >
      {status === 'loading'
        ? 'Enriching...'
        : status === 'done'
          ? 'Enriched'
          : status === 'error'
            ? 'Failed'
            : 'Enrich Data'}
    </button>
  );
}
