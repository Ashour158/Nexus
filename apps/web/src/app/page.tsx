'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gauge,
  LineChart,
  Megaphone,
  Package,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { useAuthStore } from '@/stores/auth.store';

type RoleKey = 'executive' | 'manager' | 'rep' | 'revops' | 'admin';

interface RoleView {
  key: RoleKey;
  label: string;
  headline: string;
  summary: string;
  message: string;
  kpis: Array<{ label: string; value: string; note: string; tone: string }>;
  priorities: Array<{ label: string; value: string; status: string }>;
  queue: Array<{ title: string; meta: string; impact: string }>;
}

const roleViews: RoleView[] = [
  {
    key: 'executive',
    label: 'Executive',
    headline: 'Revenue command center',
    summary: 'Quarter health, board commit, strategic risk, and enterprise expansion.',
    message: 'Every clean follow-up compounds into a stronger quarter.',
    kpis: [
      { label: 'Board Commit', value: '$2.84M', note: '89% of quarterly target', tone: 'blue' },
      { label: 'Weighted Pipeline', value: '$7.42M', note: '+14.8% vs last month', tone: 'emerald' },
      { label: 'Forecast Risk', value: '11%', note: '3 deals need executive cover', tone: 'amber' },
      { label: 'Net Retention', value: '121%', note: 'Expansion motion healthy', tone: 'violet' },
    ],
    priorities: [
      { label: 'Helio Global negotiation', value: '$185K', status: 'Exec sponsor aligned' },
      { label: 'Nova Retail proposal', value: '$76K', status: 'Legal redlines due' },
      { label: 'Atlas Energy expansion', value: '$310K', status: 'Board-ready business case' },
    ],
    queue: [
      { title: 'Approve enterprise discount policy', meta: 'Finance and sales alignment', impact: 'Protects margin' },
      { title: 'Review top 10 at-risk accounts', meta: 'Customer success escalation', impact: '$920K ARR' },
      { title: 'Confirm GCC territory coverage', meta: 'Hiring and quota planning', impact: 'Q3 capacity' },
    ],
  },
  {
    key: 'manager',
    label: 'Sales Manager',
    headline: 'Team execution dashboard',
    summary: 'Pipeline coverage, coaching needs, stalled deals, and activity quality.',
    message: 'Inspect the next action. Coach the moment. Move the quarter.',
    kpis: [
      { label: 'Team Pipeline', value: '$4.12M', note: '3.6x coverage', tone: 'blue' },
      { label: 'Stage Velocity', value: '18d', note: '2d faster than baseline', tone: 'emerald' },
      { label: 'Stalled Deals', value: '9', note: '4 above threshold', tone: 'amber' },
      { label: 'Coaching Alerts', value: '6', note: 'Rep follow-up gaps', tone: 'rose' },
    ],
    priorities: [
      { label: 'Proposal follow-ups', value: '14', status: 'Due today' },
      { label: 'Discovery quality checks', value: '8', status: 'MEDDIC gaps' },
      { label: 'Forecast changes', value: '5', status: 'Needs review' },
    ],
    queue: [
      { title: 'Coach Sara on price objection handling', meta: 'Two late-stage deals', impact: '$261K' },
      { title: 'Reassign unattended inbound leads', meta: 'Lead SLA breach risk', impact: '18 leads' },
      { title: 'Review negotiation stage hygiene', meta: 'Missing close plans', impact: 'Forecast confidence' },
    ],
  },
  {
    key: 'rep',
    label: 'Sales Rep',
    headline: 'Daily selling cockpit',
    summary: 'Your hot leads, next steps, meetings, quotes, and follow-up rhythm.',
    message: 'Win the next conversation. The scoreboard follows the cadence.',
    kpis: [
      { label: 'My Hot Leads', value: '12', note: '4 new since yesterday', tone: 'rose' },
      { label: 'Today Next Steps', value: '23', note: '7 executive touches', tone: 'blue' },
      { label: 'Open Quotes', value: '$238K', note: '3 need follow-up', tone: 'amber' },
      { label: 'This Month Won', value: '$412K', note: '104% of personal target', tone: 'emerald' },
    ],
    priorities: [
      { label: 'Cairo Retail Group', value: '91', status: 'Book commercial call' },
      { label: 'Zenith Manufacturing', value: '86', status: 'Send discovery recap' },
      { label: 'Atlas Energy', value: '72', status: 'Confirm buying committee' },
    ],
    queue: [
      { title: 'Send Nova Retail quote revision', meta: 'Template and tax review ready', impact: 'Close plan' },
      { title: 'Call Orbit Logistics', meta: 'No activity in 6 days', impact: 'SLA recovery' },
      { title: 'Prepare Helio renewal deck', meta: 'Meeting tomorrow', impact: 'Expansion path' },
    ],
  },
  {
    key: 'revops',
    label: 'RevOps',
    headline: 'Operating system health',
    summary: 'Data quality, routing, coding rules, imports, automation, and reporting reliability.',
    message: 'Clean data is quiet leverage. It makes every team faster.',
    kpis: [
      { label: 'Data Quality', value: '94%', note: '2 modules below target', tone: 'emerald' },
      { label: 'Import Jobs', value: '7', note: '1 requires mapping review', tone: 'blue' },
      { label: 'Coding Rules', value: '8', note: 'All active for core modules', tone: 'violet' },
      { label: 'Automation Runs', value: '1.8K', note: '99.2% success rate', tone: 'amber' },
    ],
    priorities: [
      { label: 'Contact account enforcement', value: '42', status: 'Legacy rows to resolve' },
      { label: 'Quote template coverage', value: '3', status: 'Needs activation' },
      { label: 'Duplicate account groups', value: '18', status: 'Review candidates' },
    ],
    queue: [
      { title: 'Activate territory-aware account codes', meta: 'ACC-{TERRITORY}-{YYYY}-{SEQ:6}', impact: 'Governance' },
      { title: 'Validate product import map', meta: 'Price book fields missing', impact: 'CPQ readiness' },
      { title: 'Publish executive dashboard pack', meta: 'Saved report refresh', impact: 'Board cadence' },
    ],
  },
  {
    key: 'admin',
    label: 'System Admin',
    headline: 'Control and compliance center',
    summary: 'Security posture, roles, integrations, templates, coding, and system operations.',
    message: 'Strong systems make good work repeatable.',
    kpis: [
      { label: 'Security Score', value: '97%', note: 'MFA and SSO healthy', tone: 'emerald' },
      { label: 'Active Users', value: '148', note: '12 admins monitored', tone: 'blue' },
      { label: 'Open Audit Items', value: '5', note: '2 high-priority reviews', tone: 'rose' },
      { label: 'Service Health', value: '99.9%', note: 'Preview APIs stable', tone: 'violet' },
    ],
    priorities: [
      { label: 'Role permission review', value: '12', status: 'Pending sign-off' },
      { label: 'Integration checks', value: '6', status: 'Mail and calendar' },
      { label: 'Template approvals', value: '4', status: 'Awaiting activation' },
    ],
    queue: [
      { title: 'Review coding rule change request', meta: 'Territory sequence scope', impact: 'Record governance' },
      { title: 'Confirm backup evidence package', meta: 'ISO control evidence', impact: 'Compliance' },
      { title: 'Audit document export permissions', meta: 'Quote and account templates', impact: 'Data protection' },
    ],
  },
];

const revenueTrend = [
  { month: 'Jan', revenue: 42, target: 48 },
  { month: 'Feb', revenue: 52, target: 54 },
  { month: 'Mar', revenue: 61, target: 58 },
  { month: 'Apr', revenue: 74, target: 68 },
  { month: 'May', revenue: 67, target: 72 },
  { month: 'Jun', revenue: 86, target: 78 },
];

const pipelineStages = [
  { stage: 'Qualified', deals: 42, value: '$1.2M', pct: 72 },
  { stage: 'Proposal', deals: 28, value: '$2.1M', pct: 58 },
  { stage: 'Negotiation', deals: 16, value: '$1.7M', pct: 43 },
  { stage: 'Commit', deals: 9, value: '$910K', pct: 31 },
];

const quickActions = [
  { label: 'New Deal', href: '/deals/new', icon: BriefcaseBusiness },
  { label: 'New Quote', href: '/quotes/new', icon: FileText },
  { label: 'Add Account', href: '/accounts', icon: Building2 },
  { label: 'Import Data', href: '/settings/migration', icon: ClipboardList },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
];

const toneStyles: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  rose: 'bg-rose-50 text-rose-700 border-rose-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
};

const toneBars: Record<string, string> = {
  blue: 'from-blue-500 to-cyan-400',
  emerald: 'from-emerald-500 to-teal-400',
  amber: 'from-amber-500 to-orange-400',
  rose: 'from-rose-500 to-pink-400',
  violet: 'from-violet-500 to-indigo-400',
};

export default function HomePage() {
  const [activeRole, setActiveRole] = useState<RoleKey>('executive');
  const userId = useAuthStore((s) => s.userId);
  const displayName = userId
    ? userId
        .split(/[._@-]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'User';
  const view = useMemo(
    () => roleViews.find((role) => role.key === activeRole) ?? roleViews[0],
    [activeRole]
  );

  return (
    <AppShell className="bg-[#f9f9ff]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
        <section className="overflow-hidden rounded-lg border border-[#dbe7f3] bg-white shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-blue-600 via-emerald-500 to-amber-400" />
          <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-200">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-blue-700">Hi, {displayName}</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
                  {view.headline}
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">{view.message}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.map(({ label, href, icon: Icon }) => (
                <Link
                  key={label}
                  href={href}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-[#e7edf3] bg-white p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Role dashboards</p>
              <p className="mt-1 text-sm text-slate-600">
                Switch the cockpit to match each user role and daily responsibility.
              </p>
            </div>
            <div className="mt-4 grid gap-2">
              {roleViews.map((role) => (
                <button
                  key={role.key}
                  type="button"
                  aria-pressed={activeRole === role.key}
                  onClick={() => setActiveRole(role.key)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-3 text-start text-sm transition ${
                    activeRole === role.key
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-semibold">{role.label}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ))}
            </div>
            <div className="mt-5 rounded-lg border border-slate-200 bg-[#f9f9ff] p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Megaphone className="h-4 w-4 text-blue-600" />
                Hi, {displayName}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Your CRM is not a database. It is the operating rhythm of revenue.
              </p>
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <section className="rounded-lg border border-[#e7edf3] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {view.label} view
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">{view.summary}</h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Live preview ready
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {view.kpis.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="overflow-hidden rounded-lg border border-[#e7edf3] bg-[#f9f9ff]"
                  >
                    <div className={`h-1.5 bg-gradient-to-r ${toneBars[kpi.tone]}`} />
                    <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">{kpi.label}</p>
                      <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${toneStyles[kpi.tone]}`}>
                        Live
                      </span>
                    </div>
                    <p className="mt-3 text-2xl font-bold text-slate-950">{kpi.value}</p>
                    <p className="mt-1 text-sm text-slate-500">{kpi.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-lg border border-[#e7edf3] bg-white p-4 shadow-sm xl:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Revenue performance</h2>
                    <p className="mt-1 text-sm text-slate-500">Actual revenue against quarter target.</p>
                  </div>
                  <LineChart className="h-5 w-5 text-blue-600" />
                </div>
                <div className="mt-6 grid h-72 grid-cols-6 items-end gap-3 border-b border-slate-200 px-1">
                  {revenueTrend.map((item) => (
                    <div key={item.month} className="flex h-full min-w-0 flex-col justify-end gap-2">
                      <div className="flex flex-1 items-end gap-1">
                        <div
                          className="w-full rounded-t-lg bg-blue-600"
                          style={{ height: `${item.revenue}%` }}
                          aria-label={`${item.month} revenue ${item.revenue}`}
                        />
                        <div
                          className="w-full rounded-t-lg bg-slate-200"
                          style={{ height: `${item.target}%` }}
                          aria-label={`${item.month} target ${item.target}`}
                        />
                      </div>
                      <span className="text-center text-xs font-semibold text-slate-500">{item.month}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-4 rounded bg-blue-600" />
                    Actual
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-4 rounded bg-slate-200" />
                    Target
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-[#e7edf3] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Pipeline by stage</h2>
                    <p className="mt-1 text-sm text-slate-500">Value concentration and deal count.</p>
                  </div>
                  <Gauge className="h-5 w-5 text-blue-600" />
                </div>
                <div className="mt-5 space-y-5">
                  {pipelineStages.map((stage) => (
                    <div key={stage.stage}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-slate-800">{stage.stage}</span>
                        <span className="text-slate-500">{stage.deals} deals</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${stage.pct}%` }} />
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{stage.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-lg border border-[#e7edf3] bg-white shadow-sm xl:col-span-2">
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-600" />
                    <h2 className="text-base font-bold text-slate-950">Role priorities</h2>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-start font-semibold">Priority</th>
                        <th className="px-4 py-3 text-start font-semibold">Value</th>
                        <th className="px-4 py-3 text-start font-semibold">Status</th>
                        <th className="px-4 py-3 text-end font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {view.priorities.map((priority) => (
                        <tr key={priority.label} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">{priority.label}</td>
                          <td className="px-4 py-3 text-slate-600">{priority.value}</td>
                          <td className="px-4 py-3 text-slate-600">{priority.status}</td>
                          <td className="px-4 py-3 text-end">
                            <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-[#e7edf3] bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  <h2 className="text-base font-bold text-slate-950">Work queue</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {view.queue.map((item) => (
                    <div key={item.title} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
                      <p className="mt-2 inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {item.impact}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <SignalCard
                icon={<Users className="h-5 w-5" />}
                title="Customer pulse"
                value="38 accounts"
                detail="Need executive, sales, or success attention this week."
              />
              <SignalCard
                icon={<Package className="h-5 w-5" />}
                title="CPQ readiness"
                value="94%"
                detail="Product, tax, and template coverage across active quotes."
              />
              <SignalCard
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Governance"
                value="Ready"
                detail="Coding rules, imports, exports, and audit controls visible."
              />
            </section>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SignalCard({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-[#e7edf3] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="text-xl font-bold text-slate-950">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}
