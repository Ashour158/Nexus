'use client';

import { useMemo, useState } from 'react';

type EventType = 'USER_LOGIN' | 'USER_LOGOUT' | 'DEAL_CREATED' | 'DEAL_DELETED' | 'CONTACT_EXPORTED' | 'PERMISSION_CHANGED' | 'TENANT_SUSPENDED' | 'BILLING_UPDATED';

const EVENTS = ['USER_LOGIN','USER_LOGOUT','DEAL_CREATED','DEAL_DELETED','CONTACT_EXPORTED','PERMISSION_CHANGED','TENANT_SUSPENDED','BILLING_UPDATED'] as const;

const LOGS = Array.from({ length: 220 }).map((_, i) => ({ id: String(i + 1), timestamp: new Date(Date.now() - i * 120000).toISOString(), actor: `User ${i % 12}`, eventType: EVENTS[i % EVENTS.length] as EventType, resourceType: i % 2 ? 'deal' : 'contact', resourceId: String(1000 + i), ip: `10.0.0.${i % 50}`, details: { changed: ['role', 'status'], by: 'admin' } }));

const EVENT_COLORS: Record<EventType, string> = {
  USER_LOGIN: 'bg-green-700', USER_LOGOUT: 'bg-gray-700', DEAL_CREATED: 'bg-blue-700', DEAL_DELETED: 'bg-red-700', CONTACT_EXPORTED: 'bg-orange-700', PERMISSION_CHANGED: 'bg-purple-700', TENANT_SUSPENDED: 'bg-red-700', BILLING_UPDATED: 'bg-yellow-700',
};

export default function AuditLogPage() {
  const [q, setQ] = useState('');
  const [eventType, setEventType] = useState<string>('all');
  const [resourceType, setResourceType] = useState('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => LOGS.filter((l) => (eventType === 'all' || l.eventType === eventType) && (resourceType === 'all' || l.resourceType === resourceType) && (!q || l.actor.toLowerCase().includes(q.toLowerCase()) || l.resourceId.includes(q))), [eventType, resourceType, q]);
  const rows = filtered.slice((page - 1) * 100, page * 100);

  function exportCsv() {
    const header = 'timestamp,actor,eventType,resourceType,resourceId,ip\n';
    const body = filtered.map((l) => `${l.timestamp},${l.actor},${l.eventType},${l.resourceType},${l.resourceId},${l.ip}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Audit Log</h2>
      <div className="grid gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3 md:grid-cols-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actor/resource" className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm" />
        <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm"><option value="all">All events</option>{EVENTS.map((e) => <option key={e}>{e}</option>)}</select>
        <select value={resourceType} onChange={(e) => setResourceType(e.target.value)} className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm"><option value="all">All resources</option><option value="deal">deal</option><option value="contact">contact</option></select>
        <button onClick={exportCsv} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium">Export CSV</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
        <table className="min-w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-gray-400"><tr><th className="px-3 py-2">Timestamp</th><th>Actor</th><th>Event</th><th>Resource</th><th>IP</th><th>Details</th></tr></thead><tbody className="divide-y divide-gray-800">{rows.map((r) => <><tr key={r.id}><td className="px-3 py-2">{new Date(r.timestamp).toLocaleString()}</td><td>{r.actor}</td><td><span className={`rounded px-2 py-0.5 text-xs ${EVENT_COLORS[r.eventType]}`}>{r.eventType}</span></td><td>{r.resourceType} <a className="underline" href="#">{r.resourceId}</a></td><td>{r.ip}</td><td><button className="rounded border border-gray-700 px-2 py-1 text-xs" onClick={() => setExpanded((x) => x === r.id ? null : r.id)}>{expanded === r.id ? 'Hide' : 'Expand'} JSON</button></td></tr>{expanded === r.id ? <tr key={`${r.id}-d`}><td colSpan={6} className="bg-gray-950 px-3 py-2 text-xs"><pre>{JSON.stringify(r.details, null, 2)}</pre></td></tr> : null}</>)}</tbody></table>
      </div>
      <div className="flex justify-end gap-2"><button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-gray-700 px-3 py-1 text-sm disabled:opacity-50">Prev</button><button disabled={page * 100 >= filtered.length} onClick={() => setPage((p) => p + 1)} className="rounded border border-gray-700 px-3 py-1 text-sm disabled:opacity-50">Next</button></div>
    </div>
  );
}
