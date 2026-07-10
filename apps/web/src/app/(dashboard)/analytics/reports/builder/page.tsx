'use client';

import { type ReactElement, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Plus, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  AGG_FNS,
  DATASETS,
  FILTER_OPS,
  TIME_GRAINS,
  type AggFn,
  type Dataset,
  type FilterOp,
  type QueryResult,
  type ReportSpec,
  type ReportSpecFilter,
  type TimeGrain,
} from '@/lib/bi-types';
import {
  runAdHocReport,
  useCreateReport,
  useDeleteReport,
  useFieldCatalog,
  useReports,
} from '@/hooks/use-bi';
import { formatCurrency } from '@/lib/format';

const selectCls =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500';
const inputCls =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500';

export default function ReportBuilderPage(): ReactElement {
  const [name, setName] = useState('');
  const [dataset, setDataset] = useState<Dataset>('deals');
  const [measures, setMeasures] = useState<Array<{ field: string; agg: AggFn }>>([]);
  const [dimensions, setDimensions] = useState<Array<{ field: string; timeGrain?: TimeGrain }>>([]);
  const [filters, setFilters] = useState<Array<{ field: string; op: FilterOp; value: string }>>([]);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const { data: catalog } = useFieldCatalog(dataset);
  const { data: reports } = useReports();
  const createReport = useCreateReport();
  const deleteReport = useDeleteReport();

  const spec: ReportSpec | null = useMemo(() => {
    const validMeasures = measures.filter((m) => m.field);
    if (!validMeasures.length) return null;
    return {
      dataset,
      measures: validMeasures.map((m) => ({ field: m.field, agg: m.agg, alias: `${m.agg}_${m.field}` })),
      dimensions: dimensions
        .filter((d) => d.field)
        .map((d) => ({ field: d.field, ...(d.timeGrain ? { timeGrain: d.timeGrain } : {}) })),
      filters: filters
        .filter((f) => f.field && f.value !== '')
        .map<ReportSpecFilter>((f) => ({ field: f.field, op: f.op, value: f.value })),
    };
  }, [dataset, measures, dimensions, filters]);

  async function run() {
    if (!spec) return;
    setRunning(true);
    setRunError(null);
    try {
      setResult(await runAdHocReport(spec));
    } catch (err) {
      setRunError((err as Error).message || 'Failed to run report');
    } finally {
      setRunning(false);
    }
  }

  async function save() {
    if (!spec || !name.trim()) return;
    await createReport.mutateAsync({ name: name.trim(), spec });
    setName('');
  }

  const measureOpts = catalog?.measures ?? [];
  const dimensionOpts = catalog?.dimensions ?? [];
  const filterOpts = catalog?.filters ?? [];
  const dimIsDate = (field: string) => dimensionOpts.find((d) => d.key === field)?.type === 'date';

  function onDatasetChange(next: Dataset) {
    setDataset(next);
    setMeasures([]);
    setDimensions([]);
    setFilters([]);
    setResult(null);
  }

  return (
    <main className="space-y-6">
      <Link
        href="/analytics/dashboards"
        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Dashboards
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-slate-900">Report builder</h1>
        <p className="text-sm text-slate-500">Build an ad-hoc report, run it into a table, and save it.</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Builder */}
        <div className="space-y-5 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dataset</span>
            <select value={dataset} onChange={(e) => onDatasetChange(e.target.value as Dataset)} className={cn(selectCls, 'w-full')}>
              {DATASETS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </label>

          <SectionHeader label="Measures" onAdd={() => setMeasures((p) => [...p, { field: measureOpts[0]?.key ?? '', agg: 'sum' }])} />
          {measures.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={m.agg} onChange={(e) => setMeasures((p) => p.map((r, idx) => (idx === i ? { ...r, agg: e.target.value as AggFn } : r)))} className={selectCls}>
                {AGG_FNS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <select value={m.field} onChange={(e) => setMeasures((p) => p.map((r, idx) => (idx === i ? { ...r, field: e.target.value } : r)))} className={cn(selectCls, 'flex-1')}>
                {measureOpts.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <RemoveBtn onClick={() => setMeasures((p) => p.filter((_, idx) => idx !== i))} />
            </div>
          ))}

          <SectionHeader label="Dimensions" onAdd={() => setDimensions((p) => [...p, { field: dimensionOpts[0]?.key ?? '' }])} />
          {dimensions.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={d.field} onChange={(e) => setDimensions((p) => p.map((r, idx) => (idx === i ? { ...r, field: e.target.value } : r)))} className={cn(selectCls, 'flex-1')}>
                {dimensionOpts.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              {dimIsDate(d.field) && (
                <select value={d.timeGrain ?? ''} onChange={(e) => setDimensions((p) => p.map((r, idx) => (idx === i ? { ...r, timeGrain: (e.target.value || undefined) as TimeGrain | undefined } : r)))} className={selectCls}>
                  <option value="">(raw)</option>
                  {TIME_GRAINS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              )}
              <RemoveBtn onClick={() => setDimensions((p) => p.filter((_, idx) => idx !== i))} />
            </div>
          ))}

          <SectionHeader label="Filters" onAdd={() => setFilters((p) => [...p, { field: filterOpts[0]?.key ?? '', op: 'eq', value: '' }])} />
          {filters.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={f.field} onChange={(e) => setFilters((p) => p.map((r, idx) => (idx === i ? { ...r, field: e.target.value } : r)))} className={cn(selectCls, 'flex-1')}>
                {filterOpts.map((fo) => <option key={fo.key} value={fo.key}>{fo.label}</option>)}
              </select>
              <select value={f.op} onChange={(e) => setFilters((p) => p.map((r, idx) => (idx === i ? { ...r, op: e.target.value as FilterOp } : r)))} className={selectCls}>
                {FILTER_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input value={f.value} onChange={(e) => setFilters((p) => p.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)))} placeholder="value" className={cn(inputCls, 'w-20')} />
              <RemoveBtn onClick={() => setFilters((p) => p.filter((_, idx) => idx !== i))} />
            </div>
          ))}

          <div className="flex items-center gap-2 pt-2">
            <button onClick={run} disabled={!spec || running} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              <Play className="h-4 w-4" /> {running ? 'Running…' : 'Run'}
            </button>
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Report name to save" className={cn(inputCls, 'flex-1')} />
            <button onClick={save} disabled={!spec || !name.trim() || createReport.isPending} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </div>

        {/* Result + saved reports */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Result</h3>
            {runError ? (
              <p className="text-sm text-rose-600">{runError}</p>
            ) : !result ? (
              <p className="text-sm text-slate-400">Configure a measure and press Run.</p>
            ) : result.rows.length === 0 ? (
              <p className="text-sm text-slate-400">No rows.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      {result.columns.map((c) => (
                        <th key={c.key} className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {result.columns.map((c) => (
                          <td key={c.key} className="px-3 py-2 text-slate-700">
                            {c.type === 'currency' && typeof row[c.key] === 'number'
                              ? formatCurrency(row[c.key] as number)
                              : String(row[c.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Saved reports</h3>
            {!reports?.length ? (
              <p className="text-sm text-slate-400">No saved reports yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                      <p className="text-xs text-slate-400">{r.spec.dataset}</p>
                    </div>
                    <button onClick={() => deleteReport.mutate(r.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SectionHeader({ label, onAdd }: { label: string; onAdd: () => void }): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <button onClick={onAdd} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
        <Plus className="h-3.5 w-3.5" /> Add
      </button>
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }): ReactElement {
  return (
    <button onClick={onClick} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove">
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
