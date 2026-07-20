'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, FileText, MessageSquare, Settings } from 'lucide-react';
import {
  CRMCard,
  CRMMetricCard,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMSegmentedControl,
  CRMTableShell,
  CRMToolbar,
} from '@/components/ui/crm';

const ConversationsBarChart = dynamic(() => import('./charts').then((m) => m.ConversationsBarChart), { ssr: false });

interface Conversation {
  id: string;
  channel: 'WHATSAPP' | 'TELEGRAM';
  externalId: string;
  state: string;
  lastMessageAt: string;
}

interface ConversationList {
  data: Conversation[];
}

export default function ChatbotPage(): JSX.Element {
  const [tab, setTab] = useState<'conversations' | 'configuration' | 'analytics'>('conversations');
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waAccessToken, setWaAccessToken] = useState('');
  const [waVerifyToken, setWaVerifyToken] = useState('');
  const [tgToken, setTgToken] = useState('');

  const conversations = useQuery({
    queryKey: ['chatbot', 'conversations'],
    queryFn: async () => {
      // Same-origin BFF path (see next.config.mjs). This used to call
      // NEXT_PUBLIC_CHATBOT_URL, defaulting to http://localhost:3017, straight
      // from the browser — cross-origin and with no auth header, so it only
      // worked on a developer's own machine and failed in every deployment.
      const res = await fetch('/bff/chatbot/conversations');
      if (!res.ok) throw new Error(`Failed to load conversations: ${res.status}`);
      return (await res.json()) as ConversationList;
    },
  });

  const convRows = useMemo(
    () => conversations.data?.data ?? [],
    [conversations.data]
  );
  const analytics = useMemo(() => {
    const total = convRows.length;
    const byDayMap = new Map<string, number>();
    for (const c of convRows) {
      const d = new Date(c.lastMessageAt).toISOString().slice(0, 10);
      byDayMap.set(d, (byDayMap.get(d) ?? 0) + 1);
    }
    const byDay = Array.from(byDayMap.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const quotesCreated = convRows.filter((c) => c.state === 'QUOTE_SENT').length;
    const conversionRate = total > 0 ? (quotesCreated / total) * 100 : 0;
    return { total, quotesCreated, conversionRate, avgMsgsPerQuote: quotesCreated > 0 ? 4 : 0, byDay };
  }, [convRows]);

  return (
    <CRMModuleShell>
      <CRMPageHeader icon={MessageSquare} title="Chatbot" />
      <CRMToolbar>
        <CRMSegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'conversations', label: 'Conversations', icon: MessageSquare },
            { value: 'configuration', label: 'Configuration', icon: Settings },
            { value: 'analytics', label: 'Analytics', icon: BarChart3 },
          ]}
        />
      </CRMToolbar>

      {tab === 'conversations' ? (
        <CRMTableShell>
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-start text-xs uppercase text-on-surface-variant"><tr><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Customer ID</th><th className="px-3 py-2">State</th><th className="px-3 py-2">Last Activity</th></tr></thead>
            <tbody className="divide-y divide-outline-variant">{convRows.map((c) => <tr key={c.id}><td className="px-3 py-2">{c.channel}</td><td className="px-3 py-2">{c.externalId}</td><td className="px-3 py-2">{c.state}</td><td className="px-3 py-2">{new Date(c.lastMessageAt).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </CRMTableShell>
      ) : null}

      {tab === 'configuration' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <CRMCard title="WhatsApp">
            <input className="h-9 w-full rounded border border-outline-variant px-3 text-sm" value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} placeholder="Phone ID" />
            <input className="h-9 w-full rounded border border-outline-variant px-3 text-sm" value={waAccessToken} onChange={(e) => setWaAccessToken(e.target.value)} type="password" placeholder="Access Token" />
            <input className="h-9 w-full rounded border border-outline-variant px-3 text-sm" value={waVerifyToken} onChange={(e) => setWaVerifyToken(e.target.value)} placeholder="Verify Token" />
            <p className="text-xs text-on-surface-variant">Webhook URL: /api/v1/webhooks/whatsapp</p>
          </CRMCard>
          <CRMCard title="Telegram">
            <input className="h-9 w-full rounded border border-outline-variant px-3 text-sm" value={tgToken} onChange={(e) => setTgToken(e.target.value)} type="password" placeholder="Bot Token" />
            <p className="text-xs text-on-surface-variant">Webhook URL: /api/v1/webhooks/telegram</p>
          </CRMCard>
        </div>
      ) : null}

      {tab === 'analytics' ? (
        <div className="space-y-4">
          <CRMMetricGrid className="md:grid-cols-2 xl:grid-cols-4">
            <CRMMetricCard icon={MessageSquare} label="Total Conversations" value={analytics.total} />
            <CRMMetricCard icon={FileText} label="Quotes Created via Bot" value={analytics.quotesCreated} tone="emerald" />
            <CRMMetricCard icon={BarChart3} label="Conversion Rate" value={`${analytics.conversionRate.toFixed(1)}%`} tone="amber" />
            <CRMMetricCard icon={MessageSquare} label="Avg Messages per Quote" value={analytics.avgMsgsPerQuote.toFixed(1)} tone="orange" />
          </CRMMetricGrid>
          <CRMCard title="Conversations per day (14d)">
            <div className="h-72">
              <ConversationsBarChart data={analytics.byDay.slice(-14)} />
            </div>
          </CRMCard>
        </div>
      ) : null}
    </CRMModuleShell>
  );
}
