'use client';

import { useCallback, useEffect, useState } from 'react';
import { notify } from '@/lib/toast';

interface DealCompetitorItem {
  id: string;
  competitorId: string;
  outcome?: string;
  notes?: string;
  competitor: { id: string; name: string; website?: string };
}

export function DealCompetitors({ dealId }: { dealId: string }) {
  const [items, setItems] = useState<DealCompetitorItem[]>([]);
  const [allComps, setAllComps] = useState<{ id: string; name: string }[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ competitorId: '', outcome: 'UNKNOWN', notes: '' });

  const fetchItems = useCallback(async () => {
    const res = await fetch(`/api/crm/deals/${dealId}/competitors`);
    const data = (await res.json()) as { data?: DealCompetitorItem[] };
    setItems(data.data ?? []);
  }, [dealId]);

  useEffect(() => {
    void fetchItems();
    fetch('/api/crm/competitors')
      .then(async (r) => (await r.json()) as { data?: Array<{ id: string; name: string }> })
      .then((d) => setAllComps(d.data ?? []))
      .catch(() => setAllComps([]));
  }, [dealId, fetchItems]);

  const handleAdd = async () => {
    if (!form.competitorId) return;
    const res = await fetch(`/api/crm/deals/${dealId}/competitors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      notify.error('Failed to add competitor');
      return;
    }
    setShowAdd(false);
    setForm({ competitorId: '', outcome: 'UNKNOWN', notes: '' });
    void fetchItems();
  };

  const outcomeColors: Record<string, string> = {
    WON_AGAINST: 'bg-success-container text-success',
    LOST_TO: 'bg-error-container text-error',
    TIED: 'bg-surface-container-high text-on-surface-variant',
    UNKNOWN: 'bg-warning-container text-warning',
  };

  return (
    <div className="mt-4 rounded-lg border border-outline-variant p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-on-surface">Competitors in this Deal</h3>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="text-xs text-primary hover:underline"
        >
          + Add
        </button>
      </div>

      {showAdd ? (
        <div className="mb-3 space-y-2 rounded-lg bg-surface-container-low p-3">
          <select
            className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
            value={form.competitorId}
            onChange={(e) => setForm((f) => ({ ...f, competitorId: e.target.value }))}
          >
            <option value="">Select competitor...</option>
            {allComps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
            value={form.outcome}
            onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
          >
            <option value="UNKNOWN">Outcome unknown</option>
            <option value="WON_AGAINST">Won against them</option>
            <option value="LOST_TO">Lost to them</option>
            <option value="TIED">Tied</option>
          </select>
          <input
            placeholder="Notes (optional)"
            className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-lg bg-surface-container-highest px-3 py-1.5 text-xs text-on-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {items.length === 0 && !showAdd ? (
        <p className="py-2 text-xs text-on-surface-variant">No competitors tracked for this deal</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface p-2.5"
            >
              <span className="text-sm font-medium text-on-surface">{item.competitor.name}</span>
              {item.outcome ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${outcomeColors[item.outcome] || outcomeColors.UNKNOWN}`}
                >
                  {item.outcome.replace(/_/g, ' ')}
                </span>
              ) : null}
              {item.notes ? <span className="flex-1 text-xs text-on-surface-variant">{item.notes}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
