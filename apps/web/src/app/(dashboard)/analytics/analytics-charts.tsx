'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/format';

const STAGE_COLORS = ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#EF4444'];

export function ChartBar({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill="#0f172a" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PieWrap({ won, lost, dormant }: { won: number; lost: number; dormant: number }) {
  const data = [
    { name: 'WON', value: won, color: '#059669' },
    { name: 'LOST', value: lost, color: '#dc2626' },
    { name: 'DORMANT', value: dormant, color: '#d97706' },
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={90}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function FunnelWrap({
  data,
}: {
  data: Array<{ label: string; value: number; count: number }>;
}) {
  const shaped = data.map((d) => ({ name: d.label, value: d.count }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <FunnelChart>
        <Tooltip />
        <Funnel dataKey="value" data={shaped} isAnimationActive>
          {shaped.map((_, index) => (
            <Cell key={`funnel-cell-${index}`} fill={STAGE_COLORS[index % STAGE_COLORS.length]} />
          ))}
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

export function RepBar({
  data,
}: {
  data: Array<{ ownerId: string; totalRevenue: number }>;
}) {
  const rows = [...data].sort((a, b) => b.totalRevenue - a.totalRevenue);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="ownerId" tickFormatter={(v: string | number) => String(v).slice(0, 6)} />
        <YAxis />
        <Tooltip />
        <Bar dataKey="totalRevenue" fill="#1d4ed8" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ActivityTypeChart({
  data,
}: {
  data: Array<{ activityType: string; count: number; completionRate: number }>;
}) {
  const rows = [...data].sort((a, b) => b.count - a.count);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis dataKey="activityType" type="category" width={100} tick={{ fontSize: 10 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#0369a1" name="Count" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ActivityArea({
  data,
}: {
  data: Array<{ activityType: string; count: number; completionRate: number }>;
}) {
  const rows = data.map((d) => ({
    type: d.activityType,
    count: d.count,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="type" tick={{ fontSize: 10 }} interval={0} angle={-20} height={60} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Area type="monotone" dataKey="count" stroke="#0ea5e9" fill="#7dd3fc" name="Created" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function VelocityLine({
  data,
  avgClose,
}: {
  data: Array<{ stage: string; days: number }>;
  avgClose: number;
}) {
  const withAvg = data.map((d) => ({ ...d, avgClose }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={withAvg.length ? withAvg : [{ stage: 'n/a', days: 0, avgClose }]}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="stepAfter" dataKey="days" stroke="#0f172a" name="Days in stage" dot />
        <Line
          type="monotone"
          dataKey="avgClose"
          stroke="#ea580c"
          strokeDasharray="4 4"
          name="Avg days to close (deal)"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ConversionLine({
  data,
}: {
  data: Array<{ label: string; conversionRate: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis unit="%" />
        <Tooltip />
        <Line type="monotone" dataKey="conversionRate" stroke="#4f46e5" name="Conversion %" dot />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ForecastBar({
  data,
}: {
  data: Array<{ month: string; weighted: number; total: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis tickFormatter={(v) => `$${Number(v) / 1000}k`} />
        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
        <Legend />
        <Bar dataKey="total" name="Total Pipeline" fill="#94a3b8" />
        <Bar dataKey="weighted" name="Weighted Pipeline" fill="#2563eb" />
      </BarChart>
    </ResponsiveContainer>
  );
}
