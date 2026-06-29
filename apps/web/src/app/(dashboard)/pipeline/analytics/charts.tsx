'use client';

import { Bar, BarChart, CartesianGrid, Funnel, FunnelChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function PipelineFunnelChart({ data }: { data: Array<{ stage: string; deals: number; value: number; conversion: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <FunnelChart>
        <Tooltip />
        <Funnel dataKey="deals" data={data} isAnimationActive>
          <LabelList position="right" fill="#0f172a" stroke="none" dataKey="stage" />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

export function DealFlowChart({ data }: { data: Array<{ week: string; newDeals: number; won: number; lost: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="newDeals" stackId="a" fill="#2563eb" />
        <Bar dataKey="won" stackId="a" fill="#16a34a" />
        <Bar dataKey="lost" stackId="a" fill="#dc2626" />
      </BarChart>
    </ResponsiveContainer>
  );
}
