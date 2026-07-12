'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface WidgetConfig {
  title: string;
  widgetType: 'metric' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'table';
  data?: Record<string, unknown>[];
  metric?: { value: number | string; label: string; trend?: number };
  colors?: string[];
}

interface DashboardWidgetRendererProps {
  config: WidgetConfig;
}

const DEFAULT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function DashboardWidgetRenderer({ config }: DashboardWidgetRendererProps) {
  const { widgetType, data = [], metric, colors = DEFAULT_COLORS } = config;

  const chartData = useMemo(() => {
    return data.map((row) => {
      const keys = Object.keys(row);
      const numericKeys = keys.filter((k) => typeof row[k] === 'number');
      const labelKey = keys.find((k) => typeof row[k] === 'string') ?? keys[0];
      return {
        name: String(row[labelKey] ?? ''),
        ...numericKeys.reduce((acc, k) => {
          acc[k] = row[k];
          return acc;
        }, {} as Record<string, unknown>),
      };
    });
  }, [data]);

  const numericKeys = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]).filter((k) => typeof data[0][k] === 'number');
  }, [data]);

  switch (widgetType) {
    case 'metric':
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-outline-variant bg-surface p-6">
          <span className="text-3xl font-bold text-on-surface">
            {metric?.value ?? '—'}
          </span>
          <span className="mt-1 text-sm text-on-surface-variant">{metric?.label ?? config.title}</span>
          {metric?.trend !== undefined && (
            <span
              className={`mt-1 text-xs font-medium ${
                metric.trend >= 0 ? 'text-success' : 'text-error'
              }`}
            >
              {metric.trend >= 0 ? '↑' : '↓'} {Math.abs(metric.trend)}%
            </span>
          )}
        </div>
      );

    case 'bar_chart':
      return (
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-on-surface">{config.title}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {numericKeys.map((key, i) => (
                <Bar key={key} dataKey={key} fill={colors[i % colors.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'line_chart':
      return (
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-on-surface">{config.title}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {numericKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );

    case 'pie_chart':
      return (
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-on-surface">{config.title}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey={numericKeys[0] ?? 'value'}
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {chartData.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );

    case 'table':
      return (
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-on-surface">{config.title}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-outline-variant bg-surface-container-low">
                <tr>
                  {data.length > 0 &&
                    Object.keys(data[0]).map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-start font-medium capitalize text-on-surface-variant"
                      >
                        {col.replace(/_/g, ' ')}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-surface-container-low">
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-3 py-2 text-on-surface">
                        {val === null || val === undefined ? '—' : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    default:
      return (
        <div className="flex items-center justify-center rounded-xl border border-outline-variant bg-surface p-6 text-sm text-on-surface-variant">
          Unknown widget type: {widgetType}
        </div>
      );
  }
}
