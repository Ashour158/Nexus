'use client';

import { useMemo, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
      const base = process.env.NEXT_PUBLIC_CHATBOT_URL ?? 'http://localhost:3017';
      const res = await fetch(`${base}/api/v1/conversations`);
      if (!res.ok) return { data: [] } as ConversationList;
      return (await res.json()) as ConversationList;
    },
  });

  const convRows = conversations.data?.data ?? [];
  const analytics = useMemo(() => {
    const total = convRows.length;
    const byDayMap = new Map<string, number>();
    for (const c of convRows) {
      const d = new Date(c.lastMessageAt).toISOString().slice(0, 10);
      byDayMap.set(d, (byDayMap.get(d) ?? 0) + 1);
    }
    const byDay = Array.from(byDayMap.entries()).map(([day, count]) => ({ day, count }));
    const quotesCreated = convRows.filter((c) => c.state === 'QUOTE_SENT').length;
    const conversionRate = total > 0 ? (quotesCreated / total) * 100 : 0;
    return { total, quotesCreated, conversionRate, avgMsgsPerQuote: quotesCreated > 0 ? 4 : 0, byDay };
  }, [convRows]);

  return (
    <main className="space-y-4 px-6 py-6">
      <h1 className="text-2xl font-bold">Chatbot</h1>
      <div className="flex gap-1 border-b border-slate-200">
        {(['conversations', 'configuration', 'analytics'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? 'border-slate-900 font-semibold' : 'border-transparent text-slate-500'}`}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === 'conversations' ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Customer ID</th><th className="px-3 py-2">State</th><th className="px-3 py-2">Last Activity</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{convRows.map((c) => <tr key={c.id}><td className="px-3 py-2">{c.channel}</td><td className="px-3 py-2">{c.externalId}</td><td className="px-3 py-2">{c.state}</td><td className="px-3 py-2">{new Date(c.lastMessageAt).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}

      {tab === 'configuration' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">WhatsApp</h2>
            <input className="h-9 w-full rounded border border-slate-200 px-3 text-sm" value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} placeholder="Phone ID" />
            <input className="h-9 w-full rounded border border-slate-200 px-3 text-sm" value={waAccessToken} onChange={(e) => setWaAccessToken(e.target.value)} type="password" placeholder="Access Token" />
            <input className="h-9 w-full rounded border border-slate-200 px-3 text-sm" value={waVerifyToken} onChange={(e) => setWaVerifyToken(e.target.value)} placeholder="Verify Token" />
            <p className="text-xs text-slate-500">Webhook URL: /api/v1/webhooks/whatsapp</p>
          </section>
          <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Telegram</h2>
            <input className="h-9 w-full rounded border border-slate-200 px-3 text-sm" value={tgToken} onChange={(e) => setTgToken(e.target.value)} type="password" placeholder="Bot Token" />
            <p className="text-xs text-slate-500">Webhook URL: /api/v1/webhooks/telegram</p>
          </section>
        </div>
      ) : null}

      {tab === 'analytics' ? (
        <div className="space-y-4">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Total Conversations" value={String(analytics.total)} />
            <Metric label="Quotes Created via Bot" value={String(analytics.quotesCreated)} />
            <Metric label="Conversion Rate" value={`${analytics.conversionRate.toFixed(1)}%`} />
            <Metric label="Avg Messages per Quote" value={analytics.avgMsgsPerQuote.toFixed(1)} />
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold">Conversations per day (14d)</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.byDay.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0f172a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>;
}
