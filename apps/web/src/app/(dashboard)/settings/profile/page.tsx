'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClients } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUpdateUser, useUsers } from '@/hooks/use-users';

const TIMEZONES = ['UTC', 'Africa/Cairo', 'Europe/London', 'America/New_York', 'Asia/Dubai'];
const LANGUAGES = ['en', 'ar', 'fr', 'de', 'es'];

export default function SettingsProfilePage(): JSX.Element {
  const userId = useAuthStore((s) => s.userId);
  const usersQuery = useUsers({ limit: 200 });
  const updateUser = useUpdateUser();

  const me = useMemo(
    () => (usersQuery.data?.data ?? []).find((u) => u.id === userId),
    [usersQuery.data, userId]
  );

  const [firstName, setFirstName] = useState(me?.firstName ?? '');
  const [lastName, setLastName] = useState(me?.lastName ?? '');
  const [phone, setPhone] = useState(me?.phone ?? '');
  const [timezone, setTimezone] = useState(me?.timezone ?? 'UTC');
  const [language, setLanguage] = useState(me?.language ?? 'en');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  return (
    <main className="space-y-4 px-6 py-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-600">Update your personal information and password.</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white">
            {(firstName?.[0] ?? 'U').toUpperCase()}
            {(lastName?.[0] ?? '').toUpperCase()}
          </div>
          <Button type="button" variant="secondary">
            Upload avatar (coming soon)
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          <Input placeholder="Email" value={me?.email ?? ''} readOnly />
          <Input placeholder="Phone" value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} />
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            isLoading={updateUser.isPending}
            onClick={() => {
              if (!userId) return;
              updateUser.mutate({
                id: userId,
                data: {
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  phone: phone.trim() || undefined,
                  timezone,
                  language,
                },
              });
            }}
          >
            Save
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              if (newPassword !== confirmPassword || !newPassword) return;
              await apiClients.auth.post('/auth/reset-password', {
                token: 'self-service',
                newPassword,
              });
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
            }}
          >
            Update password
          </Button>
        </div>
      </section>
    </main>
  );
}
