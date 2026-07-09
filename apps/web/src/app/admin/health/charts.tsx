'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function ResponseTimeChart({ data }: { data: Array<{ t: string; p50: number; p95: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <XAxis dataKey="t" hide />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="p50" stroke="#3b82f6" dot={false} />
        <Line type="monotone" dataKey="p95" stroke="#f59e0b" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
