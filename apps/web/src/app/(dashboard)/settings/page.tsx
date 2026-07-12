'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { User, Users, Plug, Bell, Shield, Globe, Key, Loader2, ArrowUpRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { useUsers, useRoles } from '@/hooks/use-users';
import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import { useNotificationSettings, useUpdateNotificationSettings } from '@/hooks/use-notification-settings';
import { useMfaStatus, useSetupMfa, useEnableMfa, useDisableMfa } from '@/hooks/use-security';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/use-api-keys';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/auth.store';

type Tab = 'profile' | 'team' | 'integrations' | 'notifications' | 'security' | 'localization' | 'api';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',       label: 'Profile',       icon: <User className="w-4 h-4" /> },
  { id: 'team',          label: 'Team',           icon: <Users className="w-4 h-4" /> },
  { id: 'notifications', label: 'Notifications',  icon: <Bell className="w-4 h-4" /> },
  { id: 'security',      label: 'Security',       icon: <Shield className="w-4 h-4" /> },
  { id: 'integrations',  label: 'Integrations',   icon: <Plug className="w-4 h-4" /> },
  { id: 'localization',  label: 'Localization',   icon: <Globe className="w-4 h-4" /> },
  { id: 'api',           label: 'API Keys',       icon: <Key className="w-4 h-4" /> },
];

/* ── shared primitives ─────────────────────────────────────────────────────── */
function SectionCard({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-xl border border-outline-variant p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-on-surface">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-on-surface-variant">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-on-surface">{label}</label>
      {children}
      {hint && <p className="text-xs text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/60
        focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition ${className ?? ''}`}
    />
  );
}

function SaveButton({ label = 'Save changes', onClick, disabled }: { label?: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-primary hover:bg-primary text-white text-sm font-medium px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
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
        ${enabled ? 'bg-primary' : 'bg-surface-container-highest'}`}
    >
      <span
        className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-surface shadow ring-0 transition-transform duration-200
          ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

/* ── tab panels ───────────────────────────────────────────────────────────── */
function ProfileTab() {
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (profile) {
      const full = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim();
      setName(full);
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

  const email = profile?.email ?? '';

  const handleSave = () => {
    const parts = name.trim().split(' ');
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');
    update.mutate({ firstName, lastName, phone });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionCard title="Personal information" description="Update your name and contact details.">
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading profile…
          </div>
        </SectionCard>
      </div>
    );
  }

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
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
          </Field>
          <Field label="Job title">
            <Input value={profile?.profile?.jobTitle ?? ''} disabled className="opacity-60 cursor-not-allowed" placeholder="Account Executive" />
          </Field>
        </div>
        <SaveButton onClick={handleSave} disabled={update.isPending} />
      </SectionCard>

      <SectionCard title="Profile photo" description="Upload a photo or choose an avatar.">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-tertiary flex items-center justify-center text-white text-xl font-bold">
            {name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="space-y-1">
            <button
              onClick={() => notify.success('Avatar upload is not available yet.')}
              className="text-sm font-medium text-primary hover:text-primary"
            >
              Upload photo
            </button>
            <p className="text-xs text-on-surface-variant">JPG, PNG or GIF · max 2 MB</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Password" description="Change your account password.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <Field label="Current password">
            <Input type="password" placeholder="••••••••" disabled className="opacity-60 cursor-not-allowed" />
          </Field>
          <div />
          <Field label="New password">
            <Input type="password" placeholder="••••••••" disabled className="opacity-60 cursor-not-allowed" />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" placeholder="••••••••" disabled className="opacity-60 cursor-not-allowed" />
          </Field>
        </div>
        <button
          onClick={() => notify.success('Password change is managed via your identity provider.')}
          className="rounded-lg bg-primary hover:bg-primary text-white text-sm font-medium px-4 py-2 transition"
        >
          Update password
        </button>
      </SectionCard>
    </div>
  );
}

function TeamTab() {
  const { data: usersData, isLoading } = useUsers({ limit: 100 });
  const { data: rolesData } = useRoles();
  const users = usersData?.data ?? [];
  const roles = rolesData?.data ?? [];

  return (
    <div className="space-y-6">
      <SectionCard title="Team members" description="Manage who has access to your workspace.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="text-start font-medium text-on-surface-variant py-2 pe-4">Member</th>
                <th className="text-start font-medium text-on-surface-variant py-2 pe-4">Role</th>
                <th className="text-start font-medium text-on-surface-variant py-2 pe-4">Status</th>
                <th className="text-start font-medium text-on-surface-variant py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="py-4 text-sm text-on-surface-variant">Loading team members…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-sm text-on-surface-variant">No team members found.</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b border-outline-variant last:border-0">
                    <td className="py-3 pe-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary
 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                          {(u.firstName?.[0] ?? u.email[0]).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-on-surface">{u.firstName} {u.lastName}</p>
                          <p className="text-xs text-on-surface-variant">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pe-4">
                      <select className="text-sm border border-outline-variant rounded-lg px-2 py-1 text-on-surface">
                        {roles.map((r) => <option key={r.id} selected={u.roles?.some((ur) => ur.id === r.id)}>{r.name}</option>)}
                      </select>
                    </td>
                    <td className="py-3 pe-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                        ${u.isActive ? 'bg-success-container text-success' : 'bg-warning-container text-warning'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3">
                      <button className="text-xs text-error hover:text-error font-medium">Remove</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="pt-2 flex items-center gap-3">
          <Input placeholder="colleague@company.com" className="max-w-xs" />
          <button className="rounded-lg bg-primary hover:bg-primary text-white text-sm font-medium px-4 py-2 transition whitespace-nowrap">
            Invite member
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Roles & permissions" description="Configure what each role can do.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="text-start font-medium text-on-surface-variant py-2 pe-4 w-48">Permission</th>
                {(roles.length ? roles : [{ id: 'admin', name: 'Admin' }, { id: 'manager', name: 'Manager' }, { id: 'rep', name: 'Rep' }, { id: 'viewer', name: 'Viewer' }]).map((r) => (
                  <th key={r.id} className="text-center font-medium text-on-surface-variant py-2 px-3">{r.name}</th>
                ))}
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
                ['Contract access', true, false, false, false],
              ].map(([label, ...perms]) => (
                <tr key={String(label)} className="border-b border-outline-variant last:border-0">
                  <td className="py-2.5 pe-4 text-on-surface">{label}</td>
                  {perms.map((p, i) => (
                    <td key={i} className="py-2.5 px-3 text-center">
                      <span className={`text-base ${p ? 'text-success' : 'text-outline'}`}>{p ? '✓' : '✕'}</span>
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
  const { data: prefs, isLoading } = useNotificationSettings();
  const update = useUpdateNotificationSettings();

  const [localPrefs, setLocalPrefs] = useState({
    dealWon: true, dealLost: false, taskDue: true, newLead: true,
    emailOpen: false, callMissed: true, weeklyDigest: true, systemAlerts: true,
  });

  useEffect(() => {
    if (prefs) {
      setLocalPrefs(prev => ({ ...prev, ...prefs }));
    }
  }, [prefs]);

  const toggle = (k: keyof typeof localPrefs) => {
    const next = { ...localPrefs, [k]: !localPrefs[k] };
    setLocalPrefs(next);
    update.mutate(next);
  };

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionCard title="Deal activity">
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading preferences…
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <SectionCard key={g.title} title={g.title}>
          <div className="space-y-3">
            {g.items.map(item => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-on-surface">{item.label}</p>
                  <p className="text-xs text-on-surface-variant">{item.desc}</p>
                </div>
                <Toggle enabled={Boolean(localPrefs[item.key])} onChange={() => toggle(item.key)} />
              </div>
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

function SecurityTab() {
  const { data: mfaStatus, isLoading: mfaLoading } = useMfaStatus();
  const setupMfa = useSetupMfa();
  const enableMfa = useEnableMfa();
  const disableMfa = useDisableMfa();

  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
  const [mfaDisableDialogOpen, setMfaDisableDialogOpen] = useState(false);
  const [mfaQrUrl, setMfaQrUrl] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  const handleEnable = async () => {
    try {
      const setup = await setupMfa.mutateAsync();
      setMfaQrUrl(setup.qrCodeUrl ?? '');
      setMfaCode('');
      setMfaDialogOpen(true);
    } catch {
      // errors already toasted by mutation hooks
    }
  };

  const confirmEnable = async () => {
    if (!mfaCode) return;
    try {
      await enableMfa.mutateAsync({ code: mfaCode });
      setMfaDialogOpen(false);
      setMfaCode('');
    } catch {
      // errors already toasted by mutation hooks
    }
  };

  const handleDisable = () => {
    setMfaCode('');
    setMfaDisableDialogOpen(true);
  };

  const confirmDisable = async () => {
    if (!mfaCode) return;
    try {
      await disableMfa.mutateAsync({ code: mfaCode });
      setMfaDisableDialogOpen(false);
      setMfaCode('');
    } catch {
      // errors already toasted by mutation hooks
    }
  };

  const mfaEnabled = mfaStatus?.enabled ?? false;

  return (
    <div className="space-y-6">
      <SectionCard title="Two-factor authentication" description="Add an extra layer of security to your account.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-on-surface">Authenticator app</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {mfaLoading
                ? 'Loading MFA status…'
                : mfaEnabled
                  ? 'MFA is currently enabled'
                  : 'Use Google Authenticator or Authy'}
            </p>
          </div>
          <button
            onClick={mfaEnabled ? handleDisable : () => void handleEnable()}
            disabled={mfaLoading || setupMfa.isPending || enableMfa.isPending || disableMfa.isPending}
            className="rounded-lg border border-outline-variant hover:border-primary text-sm font-medium px-4 py-2 text-on-surface transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mfaLoading ? 'Loading…' : mfaEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </SectionCard>

      {/* MFA Enable Dialog */}
      <Dialog open={mfaDialogOpen} onOpenChange={setMfaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code with Google Authenticator or Authy, then enter the 6-digit code.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {mfaQrUrl && (
              <div className="flex justify-center">
                <img src={mfaQrUrl} alt="MFA QR Code" className="h-40 w-40 rounded-lg border border-outline-variant" />
              </div>
            )}
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit code"
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value)}
              maxLength={6}
              className="text-center text-lg tracking-widest font-mono"
              onKeyDown={e => { if (e.key === 'Enter') void confirmEnable(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMfaDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void confirmEnable()} disabled={mfaCode.length < 6 || enableMfa.isPending}>Verify & Enable</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MFA Disable Dialog */}
      <Dialog open={mfaDisableDialogOpen} onOpenChange={setMfaDisableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>
              Enter your current 6-digit MFA code to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit code"
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value)}
              maxLength={6}
              className="text-center text-lg tracking-widest font-mono"
              onKeyDown={e => { if (e.key === 'Enter') void confirmDisable(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMfaDisableDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDisable()} disabled={mfaCode.length < 6 || disableMfa.isPending}>Disable MFA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IntegrationsTab() {
  const accessToken = useAuthStore(s => s.accessToken);

  const { data: emailConn, refetch: refetchEmail } = useQuery({
    queryKey: ['email-connection'],
    queryFn: async () => {
      const res = await fetch('/api/email/connection', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return { connected: false };
      return res.json() as Promise<{ connected: boolean }>;
    },
    enabled: !!accessToken,
    staleTime: 30_000,
  });

  const { data: esignConn } = useQuery({
    queryKey: ['esign-connection'],
    queryFn: async () => {
      const res = await fetch('/api/esign/connection', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return { connected: false };
      return res.json() as Promise<{ connected: boolean }>;
    },
    enabled: !!accessToken,
    staleTime: 30_000,
  });

  const emailConnected = emailConn?.connected ?? false;
  const esignConnected = esignConn?.connected ?? false;

  // Still handle the OAuth callback redirect param.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    // The redirect sets the param — the next query refetch will show the real state.
    // Remove the param from the URL to keep it clean.
    if (connected) {
      const url = new URL(window.location.href);
      url.searchParams.delete('connected');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const integrations = [
    { name: 'Google Calendar', desc: 'Sync meetings and follow-ups', icon: '📅', connected: true },
    {
      name: 'Gmail',
      desc: 'Sync your Gmail inbox to read and reply from NEXUS',
      icon: '✉️',
      connected: emailConnected,
      onConnect: () => {
        window.location.href = '/api/email/oauth/gmail/init';
      },
      onDisconnect: async () => {
        await fetch('/api/email/connection', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        void refetchEmail();
      },
    },
    { name: 'Slack', desc: 'Get deal alerts in your channels', icon: '💬', connected: false },
    { name: 'Microsoft Teams', desc: 'Notifications and deal updates', icon: '🔵', connected: false },
    { name: 'Outlook / Microsoft 365', desc: 'Email and calendar sync', icon: '📨', connected: false },
    { name: 'WhatsApp Business', desc: 'Message contacts from NEXUS', icon: '📱', connected: false },
    {
      name: 'DocuSign',
      desc: 'Send contracts for e-signature directly from deals',
      icon: '📝',
      connected: esignConnected,
      onConnect: () => {
        window.location.href = '/api/esign/docusign/init';
      },
    },
    { name: 'Zapier', desc: 'Connect to 5,000+ apps', icon: '⚡', connected: false },
    { name: 'HubSpot', desc: 'Import contacts and deals', icon: '🔶', connected: false },
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="Connected apps" description="Connect NEXUS to the tools your team already uses.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {integrations.map(int => (
            <div key={int.name} className="flex items-center justify-between p-3 rounded-xl border border-outline-variant hover:border-outline-variant transition">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{int.icon}</span>
                <div>
                  <p className="text-sm font-medium text-on-surface">{int.name}</p>
                  <p className="text-xs text-on-surface-variant">{int.desc}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (int.connected && int.onDisconnect) {
                    void int.onDisconnect();
                    return;
                  }
                  if (!int.connected && int.onConnect) {
                    int.onConnect();
                  }
                }}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                  int.connected
                    ? 'border border-outline-variant text-on-surface-variant hover:border-error/40 hover:text-error'
                    : 'bg-primary hover:bg-primary text-white'
                }`}
              >
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
            <select className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
              <option value="en">English</option>
              <option value="ar">العربية (Arabic)</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
              <option value="de">Deutsch</option>
              <option value="pt">Português</option>
            </select>
          </Field>
          <Field label="Timezone">
            <select className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
              <option>UTC+03:00 — Riyadh</option>
              <option>UTC+04:00 — Dubai</option>
              <option>UTC+00:00 — London</option>
              <option>UTC-05:00 — New York</option>
              <option>UTC-08:00 — Los Angeles</option>
            </select>
          </Field>
          <Field label="Date format">
            <select className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
              <option>DD/MM/YYYY</option>
              <option>MM/DD/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          </Field>
          <Field label="Currency">
            <select className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none">
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

      <SectionCard title="Layout direction" description="RTL support for Arabic and other end-to-left languages.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-on-surface">Right-to-left (RTL) mode</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Automatically enabled when Arabic is selected</p>
          </div>
          <Toggle enabled={false} onChange={() => {}} />
        </div>
      </SectionCard>
    </div>
  );
}

function ApiKeysTab() {
  const { data: apiKeysData, isLoading } = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState('');
  const apiKeys = apiKeysData?.data ?? [];

  const handleCreate = async () => {
    const name = newKeyName.trim();
    if (!name) {
      notify.error('Please enter a name for the API key');
      return;
    }
    try {
      const created = await create.mutateAsync({ name });
      setNewKeyName('');
      setCreatedKey(created.key ?? '');
      setNewKeyDialogOpen(true);
    } catch {
      // error already toasted
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title="API keys" description="Use these keys to authenticate requests to the NEXUS API.">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Key name (e.g. Production)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="max-w-xs"
          />
          <button
            onClick={handleCreate}
            disabled={create.isPending}
            className="rounded-lg bg-primary hover:bg-primary text-white text-sm font-medium px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {create.isPending ? 'Creating…' : 'Generate key'}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading API keys…
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-on-surface-variant">No API keys yet.</p>
            <p className="mt-1 text-xs text-on-surface-variant">Generate a key above to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="text-start font-medium text-on-surface-variant py-2 pe-4">Name</th>
                  <th className="text-start font-medium text-on-surface-variant py-2 pe-4">Prefix</th>
                  <th className="text-start font-medium text-on-surface-variant py-2 pe-4">Scopes</th>
                  <th className="text-start font-medium text-on-surface-variant py-2 pe-4">Expires</th>
                  <th className="text-start font-medium text-on-surface-variant py-2" />
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr key={key.id} className="border-b border-outline-variant last:border-0">
                    <td className="py-3 pe-4 font-medium text-on-surface">{key.name}</td>
                    <td className="py-3 pe-4 text-on-surface-variant font-mono text-xs">{key.keyPrefix}…</td>
                    <td className="py-3 pe-4 text-on-surface-variant">{key.scopes.join(', ') || 'All'}</td>
                    <td className="py-3 pe-4 text-on-surface-variant">
                      {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => revoke.mutate(key.id)}
                        disabled={revoke.isPending}
                        className="text-xs text-error hover:text-error font-medium disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Webhooks" description="Receive real-time event notifications to your endpoints.">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <p className="text-sm text-on-surface-variant">
            Create subscriptions, manage signing secrets, and inspect delivery logs
            in the webhook console.
          </p>
          <Link
            href="/settings/integrations/webhooks"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary"
          >
            Manage webhooks
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </SectionCard>

      <Dialog open={newKeyDialogOpen} onOpenChange={setNewKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy this key now — it won't be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
              <code className="flex-1 font-mono text-sm break-all text-on-surface">{createdKey}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { void navigator.clipboard.writeText(createdKey); notify.success('Copied!'); }}
              >
                Copy
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setNewKeyDialogOpen(false); setCreatedKey(''); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TAB_COMPONENTS: Record<Tab, React.FC> = {
  profile: ProfileTab,
  team: TeamTab,
  notifications: NotificationsTab,
  security: SecurityTab,
  integrations: IntegrationsTab,
  localization: LocalizationTab,
  api: ApiKeysTab,
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const ActiveComponent = TAB_COMPONENTS[activeTab];
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-on-surface">Settings</h1>
      <div className="mb-6 flex flex-wrap gap-2 border-b border-outline-variant pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              activeTab === tab.id
                ? 'bg-inverse-surface text-white'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <ActiveComponent />
    </div>
  );
}
