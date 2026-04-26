'use client';

import { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Status = 'Healthy' | 'Degraded' | 'Down';
type ServiceHealth = { name: string; port: number; status: Status; responseMs: number; uptime: number; checkedAt: string };

const SERVICES = [
  ['auth',3000],['crm',3001],['finance',3002],['notification',3003],['realtime',3005],['search',3006],['workflow',3007],['analytics',3008],['comm',3009],['storage',3010],['billing',3011],['integration',3012],['blueprint',3013],['approval',3014],['data',3015],['document',3016],['chatbot',3017],['cadence',3018],['territory',3019],['planning',3020],['reporting',3021],['portal',3022],['knowledge',3023],['incentive',3024],
] as const;

export default function AdminHealthPage() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [series, setSeries] = useState<Array<{ t: string; p50: number; p95: number }>>([]);

  useEffect(() => {
    function tick() {
      const now = new Date().toISOString();
      setServices(SERVICES.map(([name, port], i) => ({ name, port, status: i % 17 === 0 ? 'Down' : i % 7 === 0 ? 'Degraded' : 'Healthy', responseMs: 30 + (i * 13) % 220, uptime: 95 + ((i * 3) % 50) / 10, checkedAt: now })));
      setSeries((prev) => [...prev.slice(-59), { t: new Date().toLocaleTimeString(), p50: 80 + Math.round(Math.random() * 40), p95: 180 + Math.round(Math.random() * 80) }]);
    }

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const infra = useMemo(() => [
    { name: 'PostgreSQL', status: 'Healthy', connections: '128/500', memory: '63%', storage: '41%' },
    { name: 'Redis', status: 'Healthy', connections: '54/10000', memory: '42%', storage: 'N/A' },
    { name: 'Kafka', status: 'Degraded', connections: '220/1000', memory: '79%', storage: '67%' },
    { name: 'Meilisearch', status: 'Healthy', connections: '18/1000', memory: '38%', storage: '22%' },
    { name: 'MinIO', status: 'Healthy', connections: '25/500', memory: '57%', storage: '71%' },
    { name: 'ClickHouse', status: 'Healthy', connections: '40/300', memory: '61%', storage: '48%' },
  ], []);

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">System Health</h2>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {services.map((s) => <div key={s.name} className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-sm"><div className="flex items-center justify-between"><span className="font-semibold">{s.name}:{s.port}</span><span className={`rounded px-2 py-0.5 text-xs ${s.status === 'Healthy' ? 'bg-green-700' : s.status === 'Degraded' ? 'bg-yellow-700' : 'bg-red-700'}`}>{s.status}</span></div><p className="mt-2 text-gray-300">{s.responseMs} ms · Uptime {s.uptime.toFixed(1)}%</p><p className="mt-1 text-xs text-gray-500">Last checked {new Date(s.checkedAt).toLocaleTimeString()}</p></div>)}
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-3 text-sm font-semibold">Infrastructure status</h3>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{infra.map((i) => <div key={i.name} className="rounded border border-gray-800 bg-gray-950 p-3 text-sm"><div className="flex items-center justify-between"><span className="font-medium">{i.name}</span><span className={`rounded px-2 py-0.5 text-xs ${i.status === 'Healthy' ? 'bg-green-700' : 'bg-yellow-700'}`}>{i.status}</span></div><p className="mt-1 text-gray-400">Connections: {i.connections}</p><p className="text-gray-400">Memory: {i.memory}</p><p className="text-gray-400">Storage: {i.storage}</p></div>)}</div>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-3 text-sm font-semibold">Response times (last hour)</h3>
        <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={series}><XAxis dataKey="t" hide /><YAxis /><Tooltip /><Line type="monotone" dataKey="p50" stroke="#3b82f6" dot={false} /><Line type="monotone" dataKey="p95" stroke="#f59e0b" dot={false} /></LineChart></ResponsiveContainer></div>
      </section>
    </div>
  );
}
