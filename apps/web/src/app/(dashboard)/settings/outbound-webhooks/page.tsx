'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Webhook } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import {
  Pill,
  PrimaryButton,
  SetupHeader,
  SetupInput,
  SetupPanel,
  SetupTableCard,
} from '@/components/settings/setup-ui';

interface Subscription {
  id: string;
  name: string;
  targetUrl: string;
  events: string[];
  isActive: boolean;
}
interface Delivery {
  id: string;
  event?: string;
  status?: string;
  statusCode?: number | null;
  createdAt?: string;
}

export default function OutboundWebhooksPage() {
  const { get, post, del } = useBff();
  const { rows, state, reload } = useBffList<Subscription>('/bff/integration/integrations/webhooks');

  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [eventsText, setEventsText] = useState('');
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<Subscription | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [delState, setDelState] = useState<'idle' | 'loading' | 'ready'>('idle');

  useEffect(() => {
    if (!selected) return;
    setDelState('loading');
    void get<Delivery[]>(`/bff/integration/integrations/webhooks/${selected.id}/deliveries`).then((res) => {
      setDeliveries(Array.isArray(res.data) ? res.data : []);
      setDelState('ready');
    });
  }, [selected, get]);

  const create = async () => {
    if (!name.trim() || !targetUrl.trim()) return notify.error('Name and target URL are required');
    const events = eventsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (events.length === 0) return notify.error('Subscribe to at least one event');
    setSaving(true);
    const res = await post('/bff/integration/integrations/webhooks', {
      name: name.trim(),
      targetUrl: targetUrl.trim(),
      events,
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create subscription', res.error);
    notify.success('Webhook subscription created');
    setName('');
    setTargetUrl('');
    setEventsText('');
    void reload();
  };

  const remove = async (sub: Subscription) => {
    const res = await del(`/bff/integration/integrations/webhooks/${sub.id}`);
    if (!res.ok) return notify.error('Failed to delete subscription', res.error);
    notify.success('Subscription deleted');
    if (selected?.id === sub.id) setSelected(null);
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={Webhook}
        title="Outbound Webhooks"
        description="Push CRM events to external systems. Subscribe an HTTPS endpoint to one or more events; select a subscription to inspect recent deliveries."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New webhook subscription">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SetupInput label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ops Slack relay" />
          <SetupInput
            label="Target URL"
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com/hooks/nexus"
          />
        </div>
        <div>
          <label htmlFor="wh-events" className="mb-1 block text-sm font-medium text-on-surface">
            Events
          </label>
          <input
            id="wh-events"
            value={eventsText}
            onChange={(e) => setEventsText(e.target.value)}
            placeholder="e.g. deal.created, deal.won, contact.updated"
            className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <p className="mt-1 text-xs text-on-surface-variant">Comma-separated event names to subscribe to.</p>
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !name.trim() || !targetUrl.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Add subscription'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <SetupTableCard
        state={state}
        isEmpty={rows.length === 0}
        emptyIcon={Webhook}
        emptyTitle="No webhook subscriptions yet"
        emptyHint="Subscribe an endpoint to start receiving event deliveries."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <th className="px-5 py-3 text-start font-medium">Name</th>
              <th className="px-5 py-3 text-start font-medium">Target</th>
              <th className="px-5 py-3 text-start font-medium">Events</th>
              <th className="px-5 py-3 text-center font-medium">Status</th>
              <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((sub, i) => (
              <tr
                key={sub.id}
                onClick={() => setSelected(sub)}
                className={`cursor-pointer border-b border-outline-variant ${
                  selected?.id === sub.id ? 'bg-primary-container/40' : i % 2 === 0 ? '' : 'bg-surface-container-low/50'
                } hover:bg-primary-container/30`}
              >
                <td className="px-5 py-3 font-medium text-on-surface">{sub.name}</td>
                <td className="max-w-[16rem] truncate px-5 py-3 font-mono text-xs text-on-surface-variant">{sub.targetUrl}</td>
                <td className="px-5 py-3 text-on-surface-variant">{Array.isArray(sub.events) ? sub.events.length : 0}</td>
                <td className="px-5 py-3 text-center">
                  <Pill tone={sub.isActive ? 'success' : 'neutral'}>{sub.isActive ? 'Active' : 'Off'}</Pill>
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(sub);
                    }}
                    className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Delete ${sub.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SetupTableCard>

      {selected ? (
        <div className="rounded-xl border border-outline-variant bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-on-surface">
            Recent deliveries — <span className="text-primary">{selected.name}</span>
          </h3>
          {delState === 'loading' ? (
            <p className="text-sm text-on-surface-variant">Loading deliveries…</p>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No deliveries recorded yet for this subscription.</p>
          ) : (
            <ul className="space-y-2">
              {deliveries.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-on-surface">{d.event ?? d.id}</span>
                  <div className="flex items-center gap-2">
                    {d.statusCode != null ? (
                      <span className="text-xs text-on-surface-variant">HTTP {d.statusCode}</span>
                    ) : null}
                    <Pill tone={d.status === 'SUCCESS' || d.status === 'DELIVERED' ? 'success' : d.status === 'FAILED' ? 'error' : 'neutral'}>
                      {d.status ?? 'pending'}
                    </Pill>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
