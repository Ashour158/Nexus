'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import {
  Briefcase,
  Link,
  Mail,
  Globe,
  Plus,
  Save,
  Shield,
  Upload,
  User,
  X,
} from 'lucide-react';

type Tab = 'personal' | 'professional' | 'security';

const TABS = [
  { id: 'personal' as Tab, label: 'Personal Info', icon: User },
  { id: 'professional' as Tab, label: 'Professional', icon: Briefcase },
  { id: 'security' as Tab, label: 'Account & Security', icon: Shield },
];

function AvatarUpload({ avatarUrl, onUpload }: { avatarUrl?: string | null; onUpload: (url: string) => void }) {
  const token = useAuthStore((s) => s.accessToken);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('module', 'avatars');
      const res = await fetch('/api/storage/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (json.success) {
        onUpload(json.data.url);
        notify.success('Photo updated');
      } else {
        notify.error('Upload failed', json.error);
      }
    } catch {
      notify.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-gray-200 shadow-md">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt="Avatar"
              width={96}
              height={96}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-indigo-100 text-indigo-600">
              <User className="h-10 w-10" />
            </div>
          )}
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-0 end-0 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow hover:bg-indigo-700"
        >
          {uploading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <p className="text-xs text-gray-500">Click photo to change. JPG, PNG up to 5MB.</p>
    </div>
  );
}

function PersonalTab({ profile, user, onSave }: { profile: Record<string, unknown>; user: Record<string, unknown>; onSave: (data: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    firstName: (user.firstName as string) || '',
    lastName: (user.lastName as string) || '',
    phone: (user.phone as string) || '',
    bio: (profile.bio as string) || '',
    dateOfBirth: (profile.dateOfBirth as string)?.split('T')[0] || '',
    nationality: (profile.nationality as string) || '',
    personalEmail: (profile.personalEmail as string) || '',
    linkedInUrl: (profile.linkedInUrl as string) || '',
    twitterHandle: (profile.twitterHandle as string) || '',
    githubHandle: (profile.githubHandle as string) || '',
    country: (profile.country as string) || '',
    city: (profile.city as string) || '',
    address: (profile.address as string) || '',
  });

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <input value={form.firstName} onChange={set('firstName')} placeholder="First Name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input value={form.lastName} onChange={set('lastName')} placeholder="Last Name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <textarea value={form.bio} onChange={set('bio')} rows={3} placeholder="A short bio about yourself..." className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      <div className="grid grid-cols-2 gap-4">
        <input value={form.phone} onChange={set('phone')} placeholder="Phone" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input type="email" value={form.personalEmail} onChange={set('personalEmail')} placeholder="Personal Email" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input value={form.nationality} onChange={set('nationality')} placeholder="Nationality" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-2"><Link className="h-4 w-4 text-indigo-700" /><input value={form.linkedInUrl} onChange={set('linkedInUrl')} placeholder="https://linkedin.com/in/..." className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
        <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-sky-500" /><input value={form.twitterHandle} onChange={set('twitterHandle')} placeholder="@handle" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
            <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-gray-700" /><input value={form.githubHandle} onChange={set('githubHandle')} placeholder="github username" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4 border-t pt-4">
        <input value={form.country} onChange={set('country')} placeholder="Country" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input value={form.city} onChange={set('city')} placeholder="City" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div className="flex justify-end">
        <button type="submit" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Save className="h-4 w-4" /> Save Personal Info</button>
      </div>
    </form>
  );
}

function ProfessionalTab({ profile, onSave }: { profile: Record<string, unknown>; onSave: (data: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    jobTitle: (profile.jobTitle as string) || '',
    department: (profile.department as string) || '',
    employeeId: (profile.employeeId as string) || '',
    startDate: (profile.startDate as string)?.split('T')[0] || '',
  });
  const [skills, setSkills] = useState<string[]>((profile.skills as string[]) || []);
  const [skillInput, setSkillInput] = useState('');
  const [certs, setCerts] = useState<Array<{ name: string; issuer: string; year: string }>>((profile.certifications as Array<{ name: string; issuer: string; year: string }>) || []);

  function addSkill() {
    if (skillInput.trim() && !skills.includes(skillInput.trim())) {
      setSkills((s) => [...s, skillInput.trim()]);
      setSkillInput('');
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ ...form, skills, certifications: certs }); }} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <input value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} placeholder="Job Title" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="Department" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} placeholder="Employee ID" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div className="border-t pt-4">
        <div className="mb-2 flex flex-wrap gap-2">{skills.map((skill) => <span key={skill} className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{skill}<button type="button" onClick={() => setSkills((s) => s.filter((x) => x !== skill))}><X className="h-3 w-3" /></button></span>)}</div>
        <div className="flex gap-2">
          <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())} placeholder="Add a skill" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <button type="button" onClick={addSkill} className="rounded-lg bg-gray-100 px-3 py-2"><Plus className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="space-y-2 border-t pt-4">
        {certs.map((cert, i) => (
          <div key={`${cert.name}-${i}`} className="grid grid-cols-[1fr_1fr_80px_24px] gap-2">
            <input value={cert.name} onChange={(e) => setCerts((all) => all.map((c, idx) => idx === i ? { ...c, name: e.target.value } : c))} placeholder="Certification" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={cert.issuer} onChange={(e) => setCerts((all) => all.map((c, idx) => idx === i ? { ...c, issuer: e.target.value } : c))} placeholder="Issuer" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={cert.year} onChange={(e) => setCerts((all) => all.map((c, idx) => idx === i ? { ...c, year: e.target.value } : c))} placeholder="Year" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button type="button" onClick={() => setCerts((all) => all.filter((_, idx) => idx !== i))}><X className="h-4 w-4 text-gray-500" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setCerts((all) => [...all, { name: '', issuer: '', year: '' }])} className="text-sm text-indigo-600">Add Certification</button>
      </div>
      <div className="flex justify-end"><button type="submit" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Save className="h-4 w-4" /> Save Professional Info</button></div>
    </form>
  );
}

function SecurityTab({ user }: { user: Record<string, unknown> }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Login Email</h3>
        <p className="text-sm text-gray-500">{user.email as string}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Password</h3>
        <a href="/api/auth/change-password" className="inline-flex rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900">Change Password via SSO</a>
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs text-gray-500">Last login: {user.lastLoginAt ? new Date(user.lastLoginAt as string).toLocaleString() : 'Never'}</p>
      </div>
    </div>
  );
}

export default function ProfileSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('personal');
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => fetch('/api/auth/profile/me', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch('/api/auth/profile/me', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        notify.success('Profile saved');
        qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      } else notify.error('Save failed', res.error);
    },
    onError: () => notify.error('Save failed'),
  });

  const uploadAvatar = useMutation({
    mutationFn: (avatarUrl: string) =>
      fetch('/api/auth/profile/me/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', 'me'] }),
  });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>;

  const user = data?.data || {};
  const profile = user.profile || {};

  const panels: Record<Tab, React.ReactNode> = {
    personal: <PersonalTab profile={profile} user={user} onSave={save.mutate} />,
    professional: <ProfessionalTab profile={profile} onSave={save.mutate} />,
    security: <SecurityTab user={user} />,
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-6 bg-gradient-to-r from-indigo-600 to-indigo-600 px-8 py-6">
          <AvatarUpload avatarUrl={user.avatarUrl as string | undefined} onUpload={(url) => uploadAvatar.mutate(url)} />
          <div className="text-white">
            <h2 className="text-xl font-bold">{user.firstName as string} {user.lastName as string}</h2>
            <p className="mt-1 text-xs text-indigo-200">{user.email as string}</p>
          </div>
        </div>
        <div className="flex border-b border-gray-200 bg-gray-50">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-medium ${activeTab === tab.id ? 'border-indigo-600 bg-white text-indigo-600' : 'border-transparent text-gray-600'}`}>
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="p-8">{panels[activeTab]}</div>
      </div>
    </div>
  );
}
