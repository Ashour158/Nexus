'use client';

import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  AGG_FNS,
  CHART_TYPES,
  DATASETS,
  DATASET_KEY,
  FILTER_OPS,
  QUICK_CALCS,
  TIME_GRAINS,
  type AggFn,
  type ChartType,
  type Dataset,
  type FieldDef,
  type FilterOp,
  type QuickCalc,
  type ReportSpec,
  type ReportSpecFilter,
  type ReportSpecJoin,
  type TimeGrain,
} from '@/lib/bi-types';
import { useFieldCatalog, useFieldCatalogs, useQueryPreview } from '@/hooks/use-bi';
import { WidgetChart } from './widget-chart';

export interface WidgetDraft {
  title: string;
  chartType: ChartType;
  spec: ReportSpec;
}

interface MeasureRow {
  field: string;
  agg: AggFn;
  quickCalc?: QuickCalc;
}
interface DimensionRow {
  field: string;
  timeGrain?: TimeGrain;
}
interface FilterRow {
  field: string;
  op: FilterOp;
  value: string;
}

const selectCls =
  'rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary';
const inputCls =
  'rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary';

export function WidgetBuilder({
  initial,
  onCancel,
  onSave,
  saving,
}: {
  initial?: WidgetDraft;
  onCancel: () => void;
  onSave: (draft: WidgetDraft) => void;
  saving?: boolean;
}): ReactElement {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [dataset, setDataset] = useState<Dataset>(initial?.spec.dataset ?? 'deals');
  const [chartType, setChartType] = useState<ChartType>(initial?.chartType ?? 'bar');
  const [measures, setMeasures] = useState<MeasureRow[]>(
    initial?.spec.measures
      .filter((m) => typeof m.field === 'string' && typeof m.agg === 'string')
      .map((m) => ({ field: m.field as string, agg: m.agg as AggFn, quickCalc: m.quickCalc })) ?? []
  );
  const [dimensions, setDimensions] = useState<DimensionRow[]>(
    initial?.spec.dimensions.map((d) => ({ field: d.field, timeGrain: d.timeGrain })) ?? []
  );
  const [filters, setFilters] = useState<FilterRow[]>(
    initial?.spec.filters?.map((f) => ({ field: f.field, op: f.op, value: String(f.value ?? '') })) ?? []
  );
  const [calcs, setCalcs] = useState<Array<{ alias: string; formula: string }>>(
    initial?.spec.measures
      ?.filter((m) => typeof m.formula === 'string')
      .map((m) => ({ alias: m.alias ?? '', formula: m.formula ?? '' })) ?? []
  );
  const [joins, setJoins] = useState<Array<{ dataset: Dataset; on: string }>>(
    initial?.spec.joins?.map((j) => ({ dataset: j.dataset, on: j.on })) ?? []
  );
  const [limit, setLimit] = useState<string>(
    initial?.spec.limit ? String(initial.spec.limit) : ''
  );

  const { data: catalog, isLoading: catalogLoading } = useFieldCatalog(dataset);
  const joinedCatalogs = useFieldCatalogs(joins.map((j) => j.dataset));

  // Reset field selections when dataset changes (unless restoring initial for same dataset).
  useEffect(() => {
    if (initial && initial.spec.dataset === dataset) return;
    setMeasures([]);
    setDimensions([]);
    setFilters([]);
    setCalcs([]);
    setJoins([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  // Base-measure aliases available for calculated formulas to reference.
  const baseAliases = useMemo(
    () => measures.filter((m) => m.field).map((m) => `${m.agg}_${m.field}`),
    [measures]
  );

  const spec: ReportSpec | null = useMemo(() => {
    const validMeasures = measures.filter((m) => m.field);
    const validCalcs = calcs.filter((c) => c.alias.trim() && c.formula.trim());
    if (validMeasures.length === 0) return null;
    const validJoins: ReportSpecJoin[] = joins
      .filter((j) => j.dataset && j.on)
      .map((j) => ({ dataset: j.dataset, on: j.on }));
    const built: ReportSpec = {
      dataset,
      ...(validJoins.length > 0 ? { joins: validJoins } : {}),
      measures: [
        ...validMeasures.map((m) => ({
          field: m.field,
          agg: m.agg,
          alias: `${m.agg}_${m.field}`,
          ...(m.quickCalc ? { quickCalc: m.quickCalc } : {}),
        })),
        // Calculated measures come AFTER base measures so their referenced
        // aliases are already defined in the spec.
        ...validCalcs.map((c) => ({ formula: c.formula.trim(), alias: c.alias.trim() })),
      ],
      dimensions: dimensions
        .filter((d) => d.field)
        .map((d) => ({ field: d.field, ...(d.timeGrain ? { timeGrain: d.timeGrain } : {}) })),
      filters: filters
        .filter((f) => f.field && f.value !== '')
        .map<ReportSpecFilter>((f) => ({ field: f.field, op: f.op, value: f.value })),
    };
    if (limit && Number(limit) > 0) built.limit = Number(limit);
    return built;
  }, [dataset, joins, measures, calcs, dimensions, filters, limit]);

  const preview = useQueryPreview(spec, Boolean(spec));

  const canSave = Boolean(spec) && title.trim().length > 0;

  // Base fields + each joined dataset's fields (dotted "<dataset>.<field>",
  // labelled "Accounts › Industry") so cross-object reports can be built.
  const dottedFields = (list: (c: { measures: FieldDef[]; dimensions: FieldDef[]; filters: FieldDef[] }) => FieldDef[]): FieldDef[] =>
    joins.flatMap((j, i) => {
      const cat = joinedCatalogs[i]?.data;
      if (!cat) return [];
      const dsLabel = DATASETS.find((d) => d.value === j.dataset)?.label ?? j.dataset;
      return list(cat).map((f) => ({ ...f, key: `${j.dataset}.${f.key}`, label: `${dsLabel} › ${f.label}` }));
    });
  const measureOpts = [...(catalog?.measures ?? []), ...dottedFields((c) => c.measures)];
  const dimensionOpts = [...(catalog?.dimensions ?? []), ...dottedFields((c) => c.dimensions)];
  const filterOpts = [...(catalog?.filters ?? []), ...dottedFields((c) => c.filters)];

  // Candidate join keys on the BASE dataset: its *_id fields.
  const joinKeyOpts = [...(catalog?.dimensions ?? []), ...(catalog?.filters ?? [])]
    .filter((f, i, arr) => f.key.endsWith('_id') && arr.findIndex((x) => x.key === f.key) === i);
  const joinableDatasets = DATASETS.filter((d) => d.value !== dataset);

  function dimIsDate(field: string) {
    return dimensionOpts.find((d) => d.key === field)?.type === 'date';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <h2 className="text-lg font-bold text-on-surface">
            {initial ? 'Edit widget' : 'Add widget'}
          </h2>
          <button onClick={onCancel} className="text-on-surface-variant hover:text-on-surface" title="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Config panel */}
          <div className="space-y-5 border-r border-outline-variant p-6">
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Deals by stage"
                className={cn(inputCls, 'w-full')}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Dataset">
                <select
                  value={dataset}
                  onChange={(e) => setDataset(e.target.value as Dataset)}
                  className={cn(selectCls, 'w-full')}
                >
                  {DATASETS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Chart type">
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value as ChartType)}
                  className={cn(selectCls, 'w-full')}
                >
                  {CHART_TYPES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {catalogLoading ? (
              <p className="text-sm text-on-surface-variant">Loading fields…</p>
            ) : (
              <>
                {/* Joins */}
                <Section
                  title="Joined datasets"
                  onAdd={() =>
                    setJoins((prev) => {
                      if (prev.length >= 4) return prev;
                      const ds = joinableDatasets[0]?.value ?? 'accounts';
                      const defaultOn =
                        joinKeyOpts.find((f) => f.key === DATASET_KEY[ds])?.key ?? joinKeyOpts[0]?.key ?? '';
                      return [...prev, { dataset: ds, on: defaultOn }];
                    })
                  }
                >
                  {joins.length === 0 && (
                    <p className="text-xs text-on-surface-variant">
                      Optional. Join another object to group or filter by its fields (e.g. deals by
                      account industry). Max 4.
                    </p>
                  )}
                  {joins.map((j, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        value={j.dataset}
                        onChange={(e) =>
                          setJoins((prev) =>
                            prev.map((row, i) => {
                              if (i !== index) return row;
                              const ds = e.target.value as Dataset;
                              const on =
                                joinKeyOpts.find((f) => f.key === DATASET_KEY[ds])?.key ?? row.on;
                              return { dataset: ds, on };
                            })
                          )
                        }
                        className={cn(selectCls, 'flex-1')}
                      >
                        {joinableDatasets.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-on-surface-variant">on</span>
                      <select
                        value={j.on}
                        onChange={(e) =>
                          setJoins((prev) =>
                            prev.map((row, i) => (i === index ? { ...row, on: e.target.value } : row))
                          )
                        }
                        title="Join key on the base dataset"
                        className={selectCls}
                      >
                        {joinKeyOpts.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <RemoveBtn onClick={() => setJoins((p) => p.filter((_, i) => i !== index))} />
                    </div>
                  ))}
                </Section>

                {/* Measures */}
                <Section
                  title="Measures"
                  onAdd={() =>
                    setMeasures((prev) => [
                      ...prev,
                      { field: measureOpts[0]?.key ?? '', agg: 'sum' },
                    ])
                  }
                >
                  {measures.length === 0 && (
                    <p className="text-xs text-on-surface-variant">Add at least one measure.</p>
                  )}
                  {measures.map((m, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        value={m.agg}
                        onChange={(e) =>
                          setMeasures((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, agg: e.target.value as AggFn } : row
                            )
                          )
                        }
                        className={selectCls}
                      >
                        {AGG_FNS.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={m.field}
                        onChange={(e) =>
                          setMeasures((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, field: e.target.value } : row
                            )
                          )
                        }
                        className={cn(selectCls, 'flex-1')}
                      >
                        {measureOpts.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={m.quickCalc ?? ''}
                        onChange={(e) =>
                          setMeasures((prev) =>
                            prev.map((row, i) =>
                              i === index
                                ? { ...row, quickCalc: (e.target.value || undefined) as QuickCalc | undefined }
                                : row
                            )
                          )
                        }
                        title="Show value as"
                        className={selectCls}
                      >
                        <option value="">(raw value)</option>
                        {QUICK_CALCS.map((q) => (
                          <option key={q.value} value={q.value}>
                            {q.label}
                          </option>
                        ))}
                      </select>
                      <RemoveBtn onClick={() => setMeasures((p) => p.filter((_, i) => i !== index))} />
                    </div>
                  ))}
                </Section>

                {/* Calculated fields */}
                <Section
                  title="Calculated fields"
                  onAdd={() => setCalcs((prev) => [...prev, { alias: '', formula: '' }])}
                >
                  {calcs.length === 0 ? (
                    <p className="text-xs text-on-surface-variant">
                      Optional. Derive a metric from your measures with a formula, e.g.{' '}
                      <code className="rounded bg-surface-container px-1">won / total</code>.
                    </p>
                  ) : (
                    <p className="text-[11px] text-on-surface-variant">
                      Reference these measure names: {baseAliases.length ? baseAliases.map((a) => (
                        <code key={a} className="mr-1 rounded bg-surface-container px-1">{a}</code>
                      )) : <span className="italic">add measures first</span>}
                    </p>
                  )}
                  {calcs.map((c, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        value={c.alias}
                        onChange={(e) =>
                          setCalcs((prev) => prev.map((row, i) => (i === index ? { ...row, alias: e.target.value.replace(/[^A-Za-z0-9_]/g, '') } : row)))
                        }
                        placeholder="name"
                        className={cn(inputCls, 'w-28')}
                      />
                      <input
                        value={c.formula}
                        onChange={(e) =>
                          setCalcs((prev) => prev.map((row, i) => (i === index ? { ...row, formula: e.target.value } : row)))
                        }
                        placeholder="formula, e.g. sum_amount / count_deal_id"
                        className={cn(inputCls, 'flex-1 font-mono text-xs')}
                      />
                      <RemoveBtn onClick={() => setCalcs((p) => p.filter((_, i) => i !== index))} />
                    </div>
                  ))}
                </Section>

                {/* Dimensions */}
                <Section
                  title="Dimensions (group by)"
                  onAdd={() =>
                    setDimensions((prev) => [...prev, { field: dimensionOpts[0]?.key ?? '' }])
                  }
                >
                  {dimensions.length === 0 && (
                    <p className="text-xs text-on-surface-variant">
                      Optional. No dimension = single aggregate value.
                    </p>
                  )}
                  {dimensions.map((d, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        value={d.field}
                        onChange={(e) =>
                          setDimensions((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, field: e.target.value } : row
                            )
                          )
                        }
                        className={cn(selectCls, 'flex-1')}
                      >
                        {dimensionOpts.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      {dimIsDate(d.field) && (
                        <select
                          value={d.timeGrain ?? ''}
                          onChange={(e) =>
                            setDimensions((prev) =>
                              prev.map((row, i) =>
                                i === index
                                  ? {
                                      ...row,
                                      timeGrain: (e.target.value || undefined) as
                                        | TimeGrain
                                        | undefined,
                                    }
                                  : row
                              )
                            )
                          }
                          className={selectCls}
                        >
                          <option value="">(raw)</option>
                          {TIME_GRAINS.map((g) => (
                            <option key={g.value} value={g.value}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <RemoveBtn
                        onClick={() => setDimensions((p) => p.filter((_, i) => i !== index))}
                      />
                    </div>
                  ))}
                </Section>

                {/* Filters */}
                <Section
                  title="Filters"
                  onAdd={() =>
                    setFilters((prev) => [
                      ...prev,
                      { field: filterOpts[0]?.key ?? '', op: 'eq', value: '' },
                    ])
                  }
                >
                  {filters.length === 0 && (
                    <p className="text-xs text-on-surface-variant">Optional.</p>
                  )}
                  {filters.map((f, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        value={f.field}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, field: e.target.value } : row
                            )
                          )
                        }
                        className={cn(selectCls, 'flex-1')}
                      >
                        {filterOpts.map((fo) => (
                          <option key={fo.key} value={fo.key}>
                            {fo.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={f.op}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, op: e.target.value as FilterOp } : row
                            )
                          )
                        }
                        className={selectCls}
                      >
                        {FILTER_OPS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={f.value}
                        onChange={(e) =>
                          setFilters((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, value: e.target.value } : row
                            )
                          )
                        }
                        placeholder="value"
                        className={cn(inputCls, 'w-24')}
                      />
                      <RemoveBtn onClick={() => setFilters((p) => p.filter((_, i) => i !== index))} />
                    </div>
                  ))}
                </Section>

                <Field label="Row limit (optional)">
                  <input
                    value={limit}
                    onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="e.g. 10"
                    className={cn(inputCls, 'w-28')}
                  />
                </Field>
              </>
            )}
          </div>

          {/* Preview panel */}
          <div className="space-y-3 p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Live preview
            </h3>
            <div className="min-h-[280px] rounded-xl border border-outline-variant bg-surface-container-low/50 p-4">
              {!spec ? (
                <div className="flex h-[260px] items-center justify-center text-sm text-on-surface-variant">
                  Add a measure to preview
                </div>
              ) : preview.isLoading ? (
                <div className="flex h-[260px] items-center justify-center text-sm text-on-surface-variant">
                  Running query…
                </div>
              ) : preview.error ? (
                <div className="flex h-[260px] items-center justify-center text-center text-sm text-error">
                  {(preview.error as Error).message || 'Query failed'}
                </div>
              ) : preview.data ? (
                <WidgetChart chartType={chartType} result={preview.data} height={240} measures={spec?.measures} />
              ) : null}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-outline-variant px-6 py-4">
          <button
            onClick={onCancel}
            className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low"
          >
            Cancel
          </button>
          <button
            disabled={!canSave || saving}
            onClick={() => spec && onSave({ title: title.trim(), chartType, spec })}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50"
          >
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add widget'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  );
}

function Section({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
}): ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {title}
        </span>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-container"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }): ReactElement {
  return (
    <button
      onClick={onClick}
      className="rounded-md p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error"
      title="Remove"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
