'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { StatCard } from '@/components/dashboard/StatCard';

const EARNINGS = [
  { month: 'Jan', base: 4200, accelerator: 0, spiff: 300 },
  { month: 'Feb', base: 5100, accelerator: 900, spiff: 0 },
  { month: 'Mar', base: 5600, accelerator: 1300, spiff: 600 },
  { month: 'Apr', base: 5900, accelerator: 1700, spiff: 400 },
  { month: 'May', base: 6100, accelerator: 2100, spiff: 900 },
];

const DEAL_ROWS = [
  { deal: 'Globex Expansion', closeDate: '2026-04-02', amount: 48000, rate: 0.08, accelerator: true, spiff: 500 },
  { deal: 'Apex Rollout', closeDate: '2026-04-09', amount: 72000, rate: 0.09, accelerator: true, spiff: 700 },
  { deal: 'Nexa Migration', closeDate: '2026-04-16', amount: 39000, rate: 0.07, accelerator: false, spiff: 0 },
  { deal: 'Northwind Renewal', closeDate: '2026-04-22', amount: 31000, rate: 0.07, accelerator: false, spiff: 200 },
];

export default function CommissionsPage() {
  const [extraRevenue, setExtraRevenue] = useState(20000);
  const [discount, setDiscount] = useState(12);
  const commissionPlan = { quota: 180000, baseRate: 0.08, acceleratorRate: 0.1 };
  const closedRevenue = 220000;

  const baseCommission = 17600;
  const accelerator = 6000;
  const spiff = 2300;
  const totalPayout = baseCommission + accelerator + spiff;

  const whatIfCurve = useMemo(() => {
    if (!commissionPlan) return [];
    const base = closedRevenue ?? 0;
    return Array.from({ length: 10 }, (_, i) => {
      const extra = (i + 1) * 5000;
      const discounted = extra * (1 - discount / 100);
      const total = base + discounted;
      const rate =
        total > (commissionPlan.quota ?? 1)
          ? (commissionPlan.acceleratorRate ?? commissionPlan.baseRate ?? 0.1)
          : (commissionPlan.baseRate ?? 0.1);
      return { extra, payout: Math.round(total * rate) };
    });
  }, [commissionPlan, closedRevenue, discount]);

  const projected = useMemo(() => {
    const discounted = extraRevenue * (1 - discount / 100);
    return Math.round(totalPayout + discounted * 0.08);
  }, [discount, extraRevenue, totalPayout]);

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Commissions</h1>
          <p className="text-sm text-slate-500">Track payout drivers and run what-if scenarios.</p>
        </div>
        <DateRangePicker />
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Base commission" value={baseCommission} format="currency" icon={<span className="text-lg">??</span>} iconBg="bg-blue-100 text-blue-700" />
        <StatCard label="Accelerator bonuses" value={accelerator} format="currency" icon={<span className="text-lg">??</span>} iconBg="bg-emerald-100 text-emerald-700" />
        <StatCard label="SPIFF bonuses" value={spiff} format="currency" icon={<span className="text-lg">??</span>} iconBg="bg-amber-100 text-amber-700" />
        <StatCard label="Estimated payout" value={totalPayout} format="currency" icon={<span className="text-lg">??</span>} iconBg="bg-violet-100 text-violet-700" />
        <StatCard label="Payout date" value="May 30" icon={<span className="text-lg">??</span>} iconBg="bg-slate-100 text-slate-700" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Earnings timeline</h2>
        <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={EARNINGS}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="base" stackId="a" fill="#2563eb" /><Bar dataKey="accelerator" stackId="a" fill="#16a34a" /><Bar dataKey="spiff" stackId="a" fill="#f59e0b" /></BarChart></ResponsiveContainer></div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Deal commission breakdown</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Deal</th><th className="px-2 py-2">Close date</th><th className="px-2 py-2">Amount</th><th className="px-2 py-2">Commission %</th><th className="px-2 py-2">Commission $</th><th className="px-2 py-2">Accelerator</th><th className="px-2 py-2">SPIFF</th></tr></thead>
            <tbody>
              {DEAL_ROWS.map((row) => {
                const commission = row.amount * row.rate;
                return (
                  <tr key={row.deal} className="border-t border-slate-100">
                    <td className="px-2 py-2 font-medium">{row.deal}</td>
                    <td className="px-2 py-2">{row.closeDate}</td>
                    <td className="px-2 py-2">${row.amount.toLocaleString()}</td>
                    <td className="px-2 py-2">{(row.rate * 100).toFixed(1)}%</td>
                    <td className="px-2 py-2">${commission.toLocaleString()}</td>
                    <td className="px-2 py-2">{row.accelerator ? 'Yes' : 'No'}</td>
                    <td className="px-2 py-2">${row.spiff.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">What-if calculator</h2>
          <label className="block text-sm">If I close ${extraRevenue.toLocaleString()} more this month
            <input type="range" min={0} max={100000} step={5000} value={extraRevenue} onChange={(e) => setExtraRevenue(Number(e.target.value))} className="mt-2 w-full cursor-pointer accent-blue-600" />
            <div className="mt-1 flex justify-between text-xs text-gray-400">
              <span>$0</span>
              <span className="font-medium text-blue-700">+${extraRevenue.toLocaleString()}</span>
              <span>$100k</span>
            </div>
          </label>
          <label className="mt-4 block text-sm">at {discount}% average discount
            <input type="range" min={0} max={40} step={1} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="mt-2 w-full" />
          </label>
          <p className="mt-3 text-sm font-semibold text-slate-900">Projected payout: ${projected.toLocaleString()}</p>
          <div className="mt-3 h-44">
            {whatIfCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={whatIfCurve}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="extra" tickFormatter={(v) => `+$${(Number(v) / 1000).toFixed(0)}k`} />
                  <YAxis tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, 'Projected payout']} />
                  <Line dataKey="payout" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Commission plan summary</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            <li>Base commission: <strong>8%</strong> of closed won revenue</li>
            <li>Quota: <strong>$180,000</strong></li>
            <li>Accelerator tiers:</li>
            <li className="ms-4">0ù100% quota: 8%</li>
            <li className="ms-4">100ù120% quota: 10%</li>
            <li className="ms-4">&gt;120% quota: 12%</li>
            <li>Active SPIFFs: Enterprise multi-year (+$500), Security add-on (+$250)</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
