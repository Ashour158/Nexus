'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

const SOURCES = ['Deals', 'Contacts', 'Activities', 'Revenue', 'Cadences'];
const FIELDS: Record<string, string[]> = {
  Deals: ['name', 'stage', 'amount', 'ownerId', 'expectedCloseDate'],
  Contacts: ['firstName', 'lastName', 'email', 'accountId'],
  Activities: ['type', 'subject', 'dueDate', 'status'],
  Revenue: ['month', 'arr', 'mrr', 'wonAmount'],
  Cadences: ['name', 'step', 'replyRate', 'enrollment'],
};

type Template = { id?: string; name: string; description?: string };

type QueryResult = { columns: string[]; rows: Array<Record<string, unknown>> };

export default function ReportBuilderPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [source, setSource] = useState('Deals');
  const [selectedFields, setSelectedFields] = useState<string[]>(['name', 'amount']);
  const [filters, setFilters] = useState([{ field: 'stage', op: 'contains', value: 'Proposal' }]);
  const [viz, setViz] = useState('table');
  const [schedule, setSchedule] = useState('one-time');
  const [reportName, setReportName] = useState('Custom Report');
  const [reportDescription, setReportDescription] = useState('Generated from builder');

  const templates = useQuery({ queryKey: ['report-templates'], queryFn: () => apiClients.reporting.get<Template[]>('/reports/templates') });

  const preview = useMutation({
    mutationFn: () =>
      apiClients.crm.post<QueryResult>('/reports/query', {
        querySpec: {
          entity: source.slice(0, -1).toLowerCase(),
          columns: selectedFields,
          filters: filters
            .filter((f) => f.field && f.value)
            .map((f) => ({ field: f.field, operator: f.op, value: f.value })),
          limit: 50,
        },
      }),
  });

  const saveReport = useMutation({
    mutationFn: () =>
      apiClients.reporting.post('/reports', {
        name: reportName,
        description: reportDescription,
        category: source,
        datasource: source.toLowerCase(),
        querySpec: {
          entity: source.slice(0, -1).toLowerCase(),
          columns: selectedFields,
          filters,
          visualization: viz,
        },
        isShared: true,
      }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const created = (await saveReport.mutateAsync()) as { id: string };
      return apiClients.reporting.post(`/reports/${created.id}/run`, {});
    },
  });

  const scheduleReport = useMutation({
    mutationFn: async () => {
      const created = (await saveReport.mutateAsync()) as { id: string };
      const cron = schedule === 'daily' ? '0 8 * * *' : schedule === 'weekly' ? '0 8 * * 1' : '0 8 1 * *';
      return apiClients.reporting.post(`/reports/${created.id}/schedules`, {
        cron,
        format: 'xlsx',
        recipients: ['ops@nexuscrm.app'],
      });
    },
  });

  const previewRows = useMemo(() => preview.data?.rows ?? [], [preview.data]);
  const previewColumns = useMemo(() => preview.data?.columns ?? selectedFields, [preview.data, selectedFields]);

  return (
    <main className="grid gap-4 p-4 lg:grid-cols-12">
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5">
        <h1 className="text-xl font-bold text-slate-900">Custom Report Builder</h1>
        <div className="text-xs text-slate-500">Templates: {(templates.data ?? []).map((t) => t.name).join(', ') || 'None'}</div>
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setStep(n)} className={`rounded px-2 py-1 text-xs ${step===n?'bg-slate-900 text-white':'border border-slate-300'}`}>Step {n}</button>)}</div>
        {step === 1 ? <label className="block text-sm">Choose data source<select value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label> : null}
        {step === 2 ? <div className="space-y-1 text-sm"><p className="font-medium">Select fields</p>{FIELDS[source].map((f) => <label key={f} className="flex items-center gap-2"><input type="checkbox" checked={selectedFields.includes(f)} onChange={(e) => setSelectedFields((prev) => e.target.checked ? [...prev, f] : prev.filter((x) => x !== f))} />{f}</label>)}</div> : null}
        {step === 3 ? <div className="space-y-2 text-sm"><p className="font-medium">Filters</p>{filters.map((f, i) => <div key={`${f.field}-${i}`} className="grid gap-1 md:grid-cols-3"><input value={f.field} onChange={(e) => setFilters((p) => p.map((x, idx) => idx===i ? { ...x, field: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1" /><select value={f.op} onChange={(e) => setFilters((p) => p.map((x, idx) => idx===i ? { ...x, op: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1"><option>equals</option><option>contains</option><option>eq</option><option>in</option></select><input value={f.value} onChange={(e) => setFilters((p) => p.map((x, idx) => idx===i ? { ...x, value: e.target.value } : x))} className="rounded border border-slate-300 px-2 py-1" /></div>)}<button onClick={() => setFilters((p) => [...p, { field: '', op: 'contains', value: '' }])} className="rounded border border-slate-300 px-2 py-1">Add filter</button></div> : null}
        {step === 4 ? <label className="block text-sm">Visualization<select value={viz} onChange={(e) => setViz(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2"><option>table</option><option>bar chart</option><option>line chart</option><option>pie chart</option></select></label> : null}
        {step === 5 ? <label className="block text-sm">Schedule<select value={schedule} onChange={(e) => setSchedule(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2"><option>one-time</option><option>daily</option><option>weekly</option><option>monthly email</option></select></label> : null}
        <input value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="Report name" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <input value={reportDescription} onChange={(e) => setReportDescription(e.target.value)} placeholder="Description" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-2"><button onClick={() => saveReport.mutate()} className="rounded border border-slate-300 px-3 py-2 text-sm" disabled={saveReport.isPending}>Save report</button><button onClick={() => preview.mutate()} className="rounded border border-slate-300 px-3 py-2 text-sm" disabled={preview.isPending}>Preview</button><button onClick={() => runNow.mutate()} className="rounded bg-blue-600 px-3 py-2 text-sm text-white" disabled={runNow.isPending}>Run now</button><button onClick={() => scheduleReport.mutate()} className="rounded border border-slate-300 px-3 py-2 text-sm" disabled={scheduleReport.isPending}>Schedule</button></div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-7"><h2 className="text-sm font-semibold text-slate-900">Live preview ({viz})</h2><div className="mt-2 overflow-x-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr>{previewColumns.map((f) => <th key={f} className="px-2 py-2">{f}</th>)}</tr></thead><tbody>{previewRows.map((row, i) => <tr key={i} className="border-t border-slate-100">{previewColumns.map((f) => <td key={f} className="px-2 py-2">{String(row[f] ?? '-')}</td>)}</tr>)}{previewRows.length===0?<tr><td className="px-2 py-4 text-sm text-slate-500" colSpan={previewColumns.length || 1}>{preview.isPending ? 'Loading preview...' : 'Run preview to see results.'}</td></tr>:null}</tbody></table></div></section>
    </main>
  );
}
