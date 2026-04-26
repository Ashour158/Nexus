'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Briefcase,
  Calendar,
  DollarSign,
  Mail,
  Phone,
  Percent,
  Target,
  TrendingUp,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { Sparkline } from '@/components/dashboard/Sparkline';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import { useAuthStore } from '@/stores/auth.store';

const REVENUE_TREND = [
  { day: 'Mon', won: 12000, pipeline: 150000 },
  { day: 'Tue', won: 18000, pipeline: 152000 },
  { day: 'Wed', won: 22000, pipeline: 149000 },
  { day: 'Thu', won: 16000, pipeline: 158000 },
  { day: 'Fri', won: 28000, pipeline: 166000 },
  { day: 'Sat', won: 9000, pipeline: 164000 },
  { day: 'Sun', won: 14000, pipeline: 170000 },
];

const STAGE_DISTRIBUTION = [
  { name: 'Qualification', count: 14, value: 84000 },
  { name: 'Proposal', count: 9, value: 102000 },
  { name: 'Negotiation', count: 6, value: 79000 },
  { name: 'Commit', count: 4, value: 54000 },
];

const TASKS = [
  { id: 't1', title: 'Follow up Acme renewal', contact: 'Nina Volkov', time: '09:30', priority: 'high' },
  { id: 't2', title: 'Prepare Q2 pricing deck', contact: 'Carlos Mendez', time: '11:00', priority: 'medium' },
  { id: 't3', title: 'Send legal redlines', contact: 'Marcus Chen', time: '14:15', priority: 'low' },
];

const STALE_DEALS = [
  { id: 'd1', name: 'Globex Expansion', value: 48000, days: 10 },
  { id: 'd2', name: 'Apex Rollout', value: 72000, days: 13 },
  { id: 'd3', name: 'Nexa Migration', value: 39000, days: 9 },
  { id: 'd4', name: 'Northwind Renewal', value: 31000, days: 8 },
  { id: 'd5', name: 'Octane Pilot', value: 27000, days: 16 },
];

const MEETINGS = [
  { id: 'm1', title: 'Acme discovery', time: '10:00 - 10:45', attendees: ['NV', 'CM'], link: 'https://meet.google.com/' },
  { id: 'm2', title: 'Quarterly forecast review', time: '13:00 - 13:45', attendees: ['AR', 'MK'], link: 'https://meet.google.com/' },
  { id: 'm3', title: 'Procurement negotiation', time: 'Tomorrow 09:00', attendees: ['RS', 'LT'], link: 'https://meet.google.com/' },
];

const TEAM_ROWS = [
  { name: 'Carlos Mendez', won: 12, revenue: 182000, winRate: 44, quota: 91, trend: [8, 12, 9, 13, 14, 16, 18] },
  { name: 'Sofia Rodriguez', won: 11, revenue: 168000, winRate: 41, quota: 86, trend: [6, 8, 10, 9, 12, 14, 16] },
  { name: 'Marcus Chen', won: 9, revenue: 151000, winRate: 39, quota: 78, trend: [5, 7, 8, 8, 11, 12, 13] },
  { name: 'Nina Volkov', won: 8, revenue: 130000, winRate: 36, quota: 71, trend: [4, 6, 7, 7, 9, 10, 11] },
];

function badgeForRank(index: number) {
  if (index === 0) return '??';
  if (index === 1) return '??';
  if (index === 2) return '??';
  return `${index + 1}`;
}

export default function DashboardPage() {
  const [doneTasks, setDoneTasks] = useState<string[]>([]);
  const userId = useAuthStore((s) => s.userId) ?? 'Teammate';
  const roles = useAuthStore((s) => s.roles);
  const firstName = userId.split(/[._-]/)[0] || 'there';

  const todayDate = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
    []
  );

  const revenue = 119000;
  const pipelineValue = 319000;
  const won = 19;
  const lost = 11;
  const winRate = (won / (won + lost)) * 100;
  const avgDealSize = won > 0 ? revenue / won : 0;
  const activitiesToday = 34;
  const openDealsCount = 33;
  const tasksDueToday = TASKS.length - doneTasks.length;
  const showLeaderboard = roles.includes('manager') || roles.includes('admin');

  return (
    <main className="mx-auto max-w-7xl space-y-6 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
      <OnboardingChecklist />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Good morning, {firstName} ??</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {todayDate} ? {openDealsCount} open deals ? {tasksDueToday} tasks due today
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker />
          <Link href="/deals/new" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">+ New Deal</Link>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Revenue" value={revenue} format="currency" delta={12.4} icon={<DollarSign className="h-5 w-5" />} iconBg="bg-emerald-100 text-emerald-700" />
        <StatCard label="Pipeline Value" value={pipelineValue} format="currency" delta={4.8} icon={<Briefcase className="h-5 w-5" />} iconBg="bg-blue-100 text-blue-700" />
        <StatCard label="Win Rate" value={winRate} format="percent" delta={-1.2} icon={<Percent className="h-5 w-5" />} iconBg="bg-violet-100 text-violet-700" />
        <StatCard label="Avg Deal Size" value={avgDealSize} format="currency" delta={6.1} icon={<Target className="h-5 w-5" />} iconBg="bg-amber-100 text-amber-700" />
        <StatCard label="Activities Today" value={activitiesToday} format="number" delta={9.3} icon={<TrendingUp className="h-5 w-5" />} iconBg="bg-slate-100 text-slate-700" />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[60%_40%]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-3">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Revenue over time</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REVENUE_TREND}>
                <defs>
                  <linearGradient id="wonFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="won" name="Closed Won" stroke="#2563eb" fill="url(#wonFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="pipeline" name="Pipeline Value" stroke="#64748b" fill="transparent" strokeDasharray="6 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Pipeline by stage</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={STAGE_DISTRIBUTION} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} fill="#2563eb" />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2 text-sm">
            {STAGE_DISTRIBUTION.map((stage) => (
              <li key={stage.name} className="flex items-center justify-between">
                <span>{stage.name} ({stage.count})</span>
                <span className="font-medium">${stage.value.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">My Tasks today</h3>
            <Link href="/tasks" className="text-xs text-blue-700 hover:underline">View all tasks</Link>
          </div>
          <ul className="space-y-2">
            {TASKS.map((task) => (
              <li key={task.id} className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-2">
                <input type="checkbox" checked={doneTasks.includes(task.id)} onChange={() => setDoneTasks((prev) => prev.includes(task.id) ? prev.filter((id) => id !== task.id) : [...prev, task.id])} />
                <span className={`h-2 w-2 rounded-full ${task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-slate-500"><Link href="/contacts" className="hover:underline">{task.contact}</Link> ? {task.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">My deals - activity needed</h3>
          <ul className="space-y-2">
            {STALE_DEALS.map((deal) => (
              <li key={deal.id} className="rounded-md border border-slate-100 p-2">
                <p className="text-sm font-medium">{deal.name}</p>
                <p className="text-xs text-slate-500">${deal.value.toLocaleString()} ? {deal.days} days since last touch</p>
                <div className="mt-2 flex gap-2">
                  <button className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"><Phone className="h-3.5 w-3.5" /></button>
                  <button className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"><Mail className="h-3.5 w-3.5" /></button>
                  <button className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"><Calendar className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Upcoming meetings</h3>
          <ul className="space-y-2">
            {MEETINGS.map((meeting) => (
              <li key={meeting.id} className="rounded-md border border-slate-100 p-2">
                <p className="text-sm font-medium">{meeting.title}</p>
                <p className="text-xs text-slate-500">{meeting.time}</p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {meeting.attendees.map((attendee) => (
                      <span key={attendee} className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white bg-slate-200 text-[10px] font-semibold">{attendee}</span>
                    ))}
                  </div>
                  <a href={meeting.link} target="_blank" rel="noreferrer" className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white">Join</a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {showLeaderboard ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Team Leaderboard</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">Rank</th>
                  <th className="px-2 py-2">Rep</th>
                  <th className="px-2 py-2">Deals won</th>
                  <th className="px-2 py-2">Revenue</th>
                  <th className="px-2 py-2">Win rate</th>
                  <th className="px-2 py-2">Quota %</th>
                  <th className="px-2 py-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {TEAM_ROWS.map((row, index) => (
                  <tr key={row.name} className="border-b border-gray-50 even:bg-gray-50/50 transition-colors hover:bg-blue-50/40">
                    <td className="px-2 py-2">{badgeForRank(index)}</td>
                    <td className="px-2 py-2 font-medium">{row.name}</td>
                    <td className="px-2 py-2">{row.won}</td>
                    <td className="px-2 py-2">${row.revenue.toLocaleString()}</td>
                    <td className="px-2 py-2">{row.winRate}%</td>
                    <td className="px-2 py-2">{row.quota}%</td>
                    <td className="px-2 py-2"><Sparkline data={row.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
