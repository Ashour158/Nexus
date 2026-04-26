'use client';

import { useState } from 'react';
import { User, Users, CreditCard, Plug, Bell, Shield, Globe, Key } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

type Tab = 'profile' | 'team' | 'billing' | 'integrations' | 'notifications' | 'security' | 'localization' | 'api';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',       label: 'Profile',       icon: <User className="w-4 h-4" /> },
  { id: 'team',          label: 'Team',           icon: <Users className="w-4 h-4" /> },
  { id: 'notifications', label: 'Notifications',  icon: <Bell className="w-4 h-4" /> },
  { id: 'security',      label: 'Security',       icon: <Shield className="w-4 h-4" /> },
  { id: 'billing',       label: 'Billing',        icon: <CreditCard className="w-4 h-4" /> },
  { id: 'integrations',  label: 'Integrations',   icon: <Plug className="w-4 h-4" /> },
  { id: 'localization',  label: 'Localization',   icon: <Globe className="w-4 h-4" /> },
  { id: 'api',           label: 'API Keys',       icon: <Key className="w-4 h-4" /> },
];

/* ── shared primitives ─────────────────────────────────────────────────────── */
function SectionCard({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400
        focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
    />
  );
}

function SaveButton({ label = 'Save changes' }: { label?: string }) {
  return (
    <button className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 transition">
      {label}
    </button>
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200
        ${enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
    >
      <span
        className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow ring-0 transition-transform duration-200
          ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

/* ── tab panels ───────────────────────────────────────────────────────────── */
function ProfileTab() {
  const userId = useAuthStore((s) => s.userId);
  const [name, setName] = useState(userId ?? '');
  const [email] = useState(userId ? `${userId}@nexuscrm.app` : '');

  return (
    <div className="space-y-6">
      <SectionCard title="Personal information" description="Update your name and contact details.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </Field>
          <Field label="Email address">
            <Input value={email} disabled className="opacity-60 cursor-not-allowed" />
          </Field>
          <Field label="Phone number">
            <Input placeholder="+1 555 000 0000" />
          </Field>
          <Field label="Job title">
            <Input placeholder="Account Executive" />
          </Field>
        </div>
        <SaveButton />
      </SectionCard>

      <SectionCard title="Profile photo" description="Upload a photo or choose an avatar.">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
            {name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="space-y-1">
            <button className="text-sm font-medium text-blue-600 hover:text-blue-700">Upload photo</button>
            <p className="text-xs text-gray-400">JPG, PNG or GIF · max 2 MB</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Password" description="Change your account password.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <Field label="Current password">
            <Input type="password" placeholder="••••••••" />
          </Field>
          <div />
          <Field label="New password">
            <Input type="password" placeholder="••••••••" />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" placeholder="••••••••" />
          </Field>
        </div>
        <SaveButton label="Update password" />
      </SectionCard>
    </div>
  );
}

function TeamTab() {
  const members = [
    { name: 'Sarah Chen', email: 'sarah@nexus.io', role: 'Admin', status: 'Active' },
    { name: 'Marcus Rodriguez', email: 'marcus@nexus.io', role: 'Manager', status: 'Active' },
    { name: 'Aisha Patel', email: 'aisha@nexus.io', role: 'Rep', status: 'Active' },
    { name: 'Tom Wilson', email: 'tom@nexus.io', role: 'Rep', status: 'Invited' },
  ];
  const ROLES = ['Admin', 'Manager', 'Rep', 'Viewer'];

  return (
    <div className="space-y-6">
      <SectionCard title="Team members" description="Manage who has access to your workspace.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-start font-medium text-gray-500 py-2 pe-4">Member</th>
                <th className="text-start font-medium text-gray-500 py-2 pe-4">Role</th>
                <th className="text-start font-medium text-gray-500 py-2 pe-4">Status</th>
                <th className="text-start font-medium text-gray-500 py-2" />
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.email} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 pe-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500
                        flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {m.name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{m.name}</p>
                        <p className="text-xs text-gray-400">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pe-4">
                    <select className="text-sm border border-gray-200 rounded-lg px-2 py-1 text-gray-700">
                      {ROLES.map(r => <option key={r} selected={r === m.role}>{r}</option>)}
                    </select>
                  </td>
                  <td className="py-3 pe-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                      ${m.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="py-3">
                    <button className="text-xs text-red-500 hover:text-red-600 font-medium">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pt-2 flex items-center gap-3">
          <Input placeholder="colleague@company.com" className="max-w-xs" />
          <button className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 transition whitespace-nowrap">
            Invite member
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Roles & permissions" description="Configure what each role can do.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-start font-medium text-gray-500 py-2 pe-4 w-48">Permission</th>
                {ROLES.map(r => <th key={r} className="text-center font-medium text-gray-500 py-2 px-3">{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                ['View contacts', true, true, true, true],
                ['Edit contacts', true, true, true, false],
                ['Delete contacts', true, true, false, false],
                ['Manage pipelines', true, true, false, false],
                ['View reports', true, true, true, true],
                ['Manage team', true, false, false, false],
                ['Billing access', true, false, false, false],
              ].map(([label, ...perms]) => (
                <tr key={String(label)} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 pe-4 text-gray-700">{label}</td>
                  {perms.map((p, i) => (
                    <td key={i} className="py-2.5 px-3 text-center">
                      <span className={`text-base ${p ? 'text-green-500' : 'text-gray-200'}`}>{p ? '✓' : '✕'}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    dealWon: true, dealLost: false, taskDue: true, newLead: true,
    emailOpen: false, callMissed: true, weeklyDigest: true, systemAlerts: true,
  });
  const toggle = (k: keyof typeof prefs) => setPrefs(p => ({ ...p, [k]: !p[k] }));

  const groups = [
    {
      title: 'Deal activity',
      items: [
        { key: 'dealWon' as const,  label: 'Deal won',     desc: 'When a deal moves to Closed Won' },
        { key: 'dealLost' as const, label: 'Deal lost',    desc: 'When a deal moves to Closed Lost' },
        { key: 'newLead' as const,  label: 'New lead',     desc: 'When a new lead is assigned to you' },
      ],
    },
    {
      title: 'Tasks & reminders',
      items: [
        { key: 'taskDue' as const,    label: 'Task due',       desc: 'Remind me 1 hour before a task is due' },
        { key: 'callMissed' as const, label: 'Missed call',    desc: 'When an inbound call is not answered' },
        { key: 'emailOpen' as const,  label: 'Email opened',   desc: 'When a prospect opens your email' },
      ],
    },
    {
      title: 'Digest & system',
      items: [
        { key: 'weeklyDigest' as const,  label: 'Weekly digest',  desc: 'Summary of your activity every Monday' },
        { key: 'systemAlerts' as const,  label: 'System alerts',  desc: 'Downtime, maintenance, security events' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <SectionCard key={g.title} title={g.title}>
          <div className="space-y-3">
            {g.items.map(item => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
                <Toggle enabled={prefs[item.key]} onChange={() => toggle(item.key)} />
              </div>
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

function SecurityTab() {
  return (
    <div className="space-y-6">
      <SectionCard title="Two-factor authentication" description="Add an extra layer of security to your account.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Authenticator app</p>
            <p className="text-xs text-gray-400 mt-0.5">Use Google Authenticator or Authy</p>
          </div>
          <button className="rounded-lg border border-gray-300 hover:border-blue-500 text-sm font-medium px-4 py-2 text-gray-700 transition">
            Enable
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Active sessions" description="Manage devices currently signed in.">
        {[
          { device: 'Chrome on macOS', ip: '192.168.1.12', last: 'Current session', current: true },
          { device: 'Safari on iPhone', ip: '10.0.0.5', last: '2 hours ago', current: false },
          { device: 'Firefox on Windows', ip: '172.16.0.3', last: '3 days ago', current: false },
        ].map(s => (
          <div key={s.ip} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-800">{s.device}</p>
              <p className="text-xs text-gray-400">{s.ip} · {s.last}</p>
            </div>
            {s.current
              ? <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">Active</span>
              : <button className="text-xs text-red-500 hover:text-red-600 font-medium">Revoke</button>
            }
          </div>
        ))}
        <button className="text-sm text-red-500 hover:text-red-600 font-medium pt-1">
          Sign out all other sessions
        </button>
      </SectionCard>

      <SectionCard title="Login history" description="Recent sign-in activity on your account.">
        <div className="space-y-2">
          {[
            { date: 'Today, 9:41 AM', device: 'Chrome / macOS', status: 'Success' },
            { date: 'Yesterday, 6:02 PM', device: 'iPhone / iOS 17', status: 'Success' },
            { date: '3 days ago, 11:15 AM', device: 'Chrome / Windows', status: 'Failed' },
          ].map(l => (
            <div key={l.date} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{l.date} · {l.device}</span>
              <span className={l.status === 'Success' ? 'text-green-600' : 'text-red-500'}>{l.status}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function BillingTab() {
  return (
    <div className="space-y-6">
      <SectionCard title="Current plan" description="You are on the Professional plan.">
        <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
          <div>
            <p className="text-lg font-bold text-blue-700">Professional</p>
            <p className="text-sm text-blue-600">$49 / seat / month · 12 seats</p>
          </div>
          <button className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2">
            Upgrade plan
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[['Contacts', '8,420 / 50k'], ['Storage', '12 GB / 100 GB'], ['API calls', '142k / 500k']].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">{k}</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Payment method" description="Manage your payment information.">
        <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="h-8 w-12 bg-blue-600 rounded flex items-center justify-center text-white text-xs font-bold">VISA</div>
            <div>
              <p className="text-sm font-medium text-gray-800">Visa ending in 4242</p>
              <p className="text-xs text-gray-400">Expires 12/2027</p>
            </div>
          </div>
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">Update</button>
        </div>
      </SectionCard>

      <SectionCard title="Billing history" description="Download past invoices.">
        <div className="space-y-2">
          {[
            { date: 'Apr 1, 2026', amount: '$588.00', status: 'Paid' },
            { date: 'Mar 1, 2026', amount: '$588.00', status: 'Paid' },
            { date: 'Feb 1, 2026', amount: '$588.00', status: 'Paid' },
          ].map(inv => (
            <div key={inv.date} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm text-gray-800">{inv.date}</p>
                <p className="text-xs text-gray-400">{inv.amount}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">{inv.status}</span>
                <button className="text-xs text-blue-600 hover:text-blue-700 font-medium">Download</button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function IntegrationsTab() {
  const integrations = [
    { name: 'Google Calendar', desc: 'Sync meetings and follow-ups', icon: '📅', connected: true },
    { name: 'Gmail / Google Workspace', desc: 'Track emails and conversations', icon: '✉️', connected: true },
    { name: 'Slack', desc: 'Get deal alerts in your channels', icon: '💬', connected: false },
    { name: 'Microsoft Teams', desc: 'Notifications and deal updates', icon: '🔵', connected: false },
    { name: 'Outlook / Microsoft 365', desc: 'Email and calendar sync', icon: '📨', connected: false },
    { name: 'WhatsApp Business', desc: 'Message contacts from NEXUS', icon: '📱', connected: false },
    { name: 'Stripe', desc: 'Sync invoices and payments', icon: '💳', connected: true },
    { name: 'DocuSign', desc: 'Send contracts for e-signature', icon: '📝', connected: false },
    { name: 'Zapier', desc: 'Connect to 5,000+ apps', icon: '⚡', connected: false },
    { name: 'HubSpot', desc: 'Import contacts and deals', icon: '🔶', connected: false },
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="Connected apps" description="Connect NEXUS to the tools your team already uses.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {integrations.map(int => (
            <div key={int.name} className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-gray-300 transition">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{int.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{int.name}</p>
                  <p className="text-xs text-gray-400">{int.desc}</p>
                </div>
              </div>
              <button className={`text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                int.connected
                  ? 'border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-500'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}>
                {int.connected ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function LocalizationTab() {
  return (
    <div className="space-y-6">
      <SectionCard title="Language & region" description="Set your preferred language, timezone, and date format.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <Field label="Language">
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
              <option value="en">English</option>
              <option value="ar">العربية (Arabic)</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
              <option value="de">Deutsch</option>
              <option value="pt">Português</option>
            </select>
          </Field>
          <Field label="Timezone">
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
              <option>UTC+03:00 — Riyadh</option>
              <option>UTC+04:00 — Dubai</option>
              <option>UTC+00:00 — London</option>
              <option>UTC-05:00 — New York</option>
              <option>UTC-08:00 — Los Angeles</option>
            </select>
          </Field>
          <Field label="Date format">
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
              <option>DD/MM/YYYY</option>
              <option>MM/DD/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          </Field>
          <Field label="Currency">
            <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
              <option>SAR — Saudi Riyal</option>
              <option>AED — UAE Dirham</option>
              <option>USD — US Dollar</option>
              <option>EUR — Euro</option>
              <option>GBP — British Pound</option>
            </select>
          </Field>
        </div>
        <SaveButton />
      </SectionCard>

      <SectionCard title="Layout direction" description="RTL support for Arabic and other right-to-left languages.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Right-to-left (RTL) mode</p>
            <p className="text-xs text-gray-400 mt-0.5">Automatically enabled when Arabic is selected</p>
          </div>
          <Toggle enabled={false} onChange={() => {}} />
        </div>
      </SectionCard>
    </div>
  );
}

function ApiKeysTab() {
  const keys = [
    { name: 'Production API Key', created: 'Jan 15, 2026', last: '2 hours ago', key: 'nxs_live_••••••••••••4f2a' },
    { name: 'Development API Key', created: 'Feb 3, 2026', last: '5 days ago', key: 'nxs_test_••••••••••••9c1b' },
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="API keys" description="Use these keys to authenticate requests to the NEXUS API.">
        <div className="space-y-3">
          {keys.map(k => (
            <div key={k.name} className="p-4 rounded-xl border border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{k.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Created {k.created} · Last used {k.last}</p>
                </div>
                <button className="text-xs text-red-500 hover:text-red-600 font-medium">Revoke</button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 font-mono text-gray-600">
                  {k.key}
                </code>
                <button className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1.5 border border-blue-200 rounded-lg">
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
        <button className="rounded-lg border border-gray-300 hover:border-blue-500 text-sm font-medium px-4 py-2 text-gray-700 transition">
          Generate new API key
        </button>
      </SectionCard>

      <SectionCard title="Webhooks" description="Receive real-time event notifications to your endpoints.">
        <div className="space-y-3">
          <div className="p-3 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">https://app.example.com/webhooks/nexus</p>
                <p className="text-xs text-gray-400 mt-0.5">deal.won, deal.lost, contact.created</p>
              </div>
              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">Active</span>
            </div>
          </div>
          <button className="rounded-lg border border-gray-300 hover:border-blue-500 text-sm font-medium px-4 py-2 text-gray-700 transition">
            Add webhook endpoint
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

/* ── main page ────────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const [active, setActive] = useState<Tab>('profile');

  const panel = {
    profile:       <ProfileTab />,
    team:          <TeamTab />,
    notifications: <NotificationsTab />,
    security:      <SecurityTab />,
    billing:       <BillingTab />,
    integrations:  <IntegrationsTab />,
    localization:  <LocalizationTab />,
    api:           <ApiKeysTab />,
  }[active];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your account, team, billing and integrations.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6">
        {/* sidebar nav */}
        <nav className="sm:w-48 shrink-0">
          <ul className="space-y-0.5">
            {TABS.map(t => (
              <li key={t.id}>
                <button
                  onClick={() => setActive(t.id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition
                    ${active === t.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
                >
                  {t.icon}
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* content */}
        <div className="flex-1 min-w-0">
          {panel}
        </div>
      </div>
    </div>
  );
}
