'use client';

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function ActivityBreakdownChart({ data }: { data: Array<{ week: string; calls: number; emails: number; meetings: number; demos: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="calls" fill="#2563eb" />
        <Bar dataKey="emails" fill="#0891b2" />
        <Bar dataKey="meetings" fill="#16a34a" />
        <Bar dataKey="demos" fill="#f59e0b" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueQuotaChart({ data }: { data: Array<{ week: string; carlos: number; sofia: number; marcus: number; quota: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line dataKey="carlos" stroke="#2563eb" strokeWidth={2} />
        <Line dataKey="sofia" stroke="#16a34a" strokeWidth={2} />
        <Line dataKey="marcus" stroke="#f59e0b" strokeWidth={2} />
        <Line dataKey="quota" stroke="#64748b" strokeDasharray="6 4" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WinLossPieChart({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={75} fill="#2563eb" />
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function LostReasonsChart({ data }: { data: Array<{ reason: string; count: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="reason" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="count" fill="#dc2626" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ResponseTimeChart({ data }: { data: Array<{ name: string; responseHrs: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="responseHrs" fill="#7c3aed" />
      </BarChart>
    </ResponsiveContainer>
  );
}
