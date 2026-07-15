'use client';

import { type ReactElement, useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { ChartType, QueryResult } from '@/lib/bi-types';
import { formatCurrency } from '@/lib/format';

const PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#f97316',
];

function isCurrency(type?: string) {
  return type === 'currency';
}

function fmt(value: unknown, type?: string): string {
  if (value == null) return '—';
  if (typeof value === 'number') {
    if (isCurrency(type)) return formatCurrency(value);
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value);
}

export function WidgetChart({
  chartType,
  result,
  height = 260,
}: {
  chartType: ChartType;
  result: QueryResult;
  height?: number;
}): ReactElement {
  const { columns, rows } = result;
  // A dimension column is a string/date; everything else is a measure. When no
  // string/date column exists (e.g. a single aggregate for a KPI), there is no
  // dimension and every column is a measure.
  const dimCol = columns.find((c) => c.type === 'string' || c.type === 'date');
  const measureCols = columns.filter((c) => c.key !== dimCol?.key);
  const primaryMeasure = measureCols[0];

  const data = useMemo(
    () =>
      rows.map((row) => {
        const out: Record<string, unknown> = { ...row };
        if (dimCol) out[dimCol.key] = fmt(row[dimCol.key], dimCol.type);
        return out;
      }),
    [rows, dimCol]
  );

  if (!rows.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-outline-variant text-sm text-on-surface-variant"
        style={{ height }}
      >
        No data for this configuration
      </div>
    );
  }

  // ---- KPI ----
  if (chartType === 'kpi') {
    const value = primaryMeasure ? rows[0]?.[primaryMeasure.key] : undefined;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 py-6">
        <span className="text-4xl font-bold text-on-surface">
          {fmt(value, primaryMeasure?.type)}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          {primaryMeasure?.label ?? 'Value'}
        </span>
      </div>
    );
  }

  // ---- Table ----
  if (chartType === 'table') {
    return (
      <div className="overflow-x-auto" style={{ maxHeight: height + 40 }}>
        <table className="w-full min-w-[320px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-surface-container-low">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="border-b border-outline-variant px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {rows.map((row, index) => (
              <tr key={index} className="hover:bg-surface-container-low">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-on-surface">
                    {fmt(row[col.key], col.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const tooltipFormatter = (value: number) =>
    fmt(value, primaryMeasure?.type);

  // ---- Pie ----
  if (chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip formatter={tooltipFormatter} />
          <Legend />
          <Pie
            data={data}
            dataKey={primaryMeasure?.key}
            nameKey={dimCol?.key}
            cx="50%"
            cy="50%"
            outerRadius={height / 2.8}
            label
          >
            {data.map((_, index) => (
              <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // ---- Funnel ----
  if (chartType === 'funnel') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <FunnelChart>
          <Tooltip formatter={tooltipFormatter} />
          <Funnel dataKey={primaryMeasure?.key} data={data} isAnimationActive>
            <LabelList position="right" fill="#0f172a" stroke="none" dataKey={dimCol?.key} />
            {data.map((_, index) => (
              <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    );
  }

  // ---- Line ----
  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={dimCol?.key} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={tooltipFormatter} />
          {measureCols.length > 1 && <Legend />}
          {measureCols.map((m, index) => (
            <Line
              key={m.key}
              type="monotone"
              dataKey={m.key}
              name={m.label}
              stroke={PALETTE[index % PALETTE.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // ---- Area ----
  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={dimCol?.key} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={tooltipFormatter} />
          {measureCols.length > 1 && <Legend />}
          {measureCols.map((m, index) => (
            <Area
              key={m.key}
              type="monotone"
              dataKey={m.key}
              name={m.label}
              stroke={PALETTE[index % PALETTE.length]}
              fill={PALETTE[index % PALETTE.length]}
              fillOpacity={0.2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // ---- Donut ----
  if (chartType === 'donut') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip formatter={tooltipFormatter} />
          <Legend />
          <Pie
            data={data}
            dataKey={primaryMeasure?.key}
            nameKey={dimCol?.key}
            cx="50%"
            cy="50%"
            innerRadius={height / 5}
            outerRadius={height / 2.8}
            paddingAngle={2}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // ---- Combo (bars + lines) ----
  if (chartType === 'combo') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey={dimCol?.key} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={tooltipFormatter} />
          <Legend />
          {measureCols.map((m, index) =>
            index === 0 ? (
              <Bar key={m.key} dataKey={m.key} name={m.label} fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
            ) : (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={PALETTE[index % PALETTE.length]}
                strokeWidth={2}
                dot={false}
              />
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // ---- Scatter (measure[0] vs measure[1]) ----
  if (chartType === 'scatter' && measureCols.length >= 2) {
    const [mx, my] = measureCols;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis type="number" dataKey={mx.key} name={mx.label} tick={{ fontSize: 11 }} />
          <YAxis type="number" dataKey={my.key} name={my.label} tick={{ fontSize: 11 }} />
          <ZAxis range={[60, 61]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={tooltipFormatter} />
          <Scatter data={data} fill={PALETTE[3]} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // ---- Radar ----
  if (chartType === 'radar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} outerRadius={height / 2.6}>
          <PolarGrid />
          <PolarAngleAxis dataKey={dimCol?.key} tick={{ fontSize: 11 }} />
          <PolarRadiusAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={tooltipFormatter} />
          {measureCols.length > 1 && <Legend />}
          {measureCols.map((m, index) => (
            <Radar
              key={m.key}
              dataKey={m.key}
              name={m.label}
              stroke={PALETTE[index % PALETTE.length]}
              fill={PALETTE[index % PALETTE.length]}
              fillOpacity={0.3}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  // ---- Treemap ----
  if (chartType === 'treemap') {
    const tmData = data.map((row, index) => ({
      name: String(row[dimCol?.key ?? ''] ?? '—'),
      size: Number(row[primaryMeasure?.key ?? ''] ?? 0),
      fill: PALETTE[index % PALETTE.length],
    }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <Treemap data={tmData} dataKey="size" nameKey="name" stroke="#fff" isAnimationActive>
          <Tooltip formatter={tooltipFormatter} />
        </Treemap>
      </ResponsiveContainer>
    );
  }

  // ---- Radial gauge ----
  if (chartType === 'radial') {
    const rData = data.map((row, index) => ({
      name: String(row[dimCol?.key ?? ''] ?? '—'),
      value: Number(row[primaryMeasure?.key ?? ''] ?? 0),
      fill: PALETTE[index % PALETTE.length],
    }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart data={rData} cx="50%" cy="50%" innerRadius="20%" outerRadius="100%" startAngle={90} endAngle={-270}>
          <RadialBar dataKey="value" background cornerRadius={4} />
          <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11 }} />
          <Tooltip formatter={tooltipFormatter} />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  }

  // ---- Bar family (bar | stacked_bar | hbar) ----
  const stacked = chartType === 'stacked_bar';
  const horizontal = chartType === 'hbar';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 12, bottom: 4, left: horizontal ? 24 : 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey={dimCol?.key} tick={{ fontSize: 11 }} width={90} />
          </>
        ) : (
          <>
            <XAxis dataKey={dimCol?.key} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
          </>
        )}
        <Tooltip formatter={tooltipFormatter} />
        {measureCols.length > 1 && <Legend />}
        {measureCols.map((m, index) => (
          <Bar
            key={m.key}
            dataKey={m.key}
            name={m.label}
            fill={PALETTE[index % PALETTE.length]}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            stackId={stacked ? 'a' : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
