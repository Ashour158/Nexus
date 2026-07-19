'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth.store';
import { establishSession } from '@/lib/auth-session';

/**
 * Public self-registration (trial finding #2). Creates a brand-new workspace
 * (tenant) with the submitting user as its SUPER_ADMIN and signs them straight
 * in — POST /auth/register returns the same token shape as /auth/login, so we
 * reuse the exact shared post-auth sequence and land the new admin in the
 * first-run onboarding wizard.
 */
export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    if (password !== confirmPassword) {
      setFieldError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const authUrl =
        process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3010/api/v1';
      const res = await axios.post<{
        success: boolean;
        data: { accessToken: string; refreshToken?: string };
        error?: string;
      }>(`${authUrl}/auth/register`, {
        companyName,
        email,
        password,
        firstName,
        lastName,
      });

      if (!res.data?.success || !res.data.data?.accessToken) {
        throw new Error(res.data?.error ?? 'Registration failed');
      }
      const { accessToken, refreshToken } = res.data.data;
      // Same post-auth sequence as /login — see @/lib/auth-session.
      await establishSession({ accessToken, refreshToken }, setSession);
      // Land the new SUPER_ADMIN in the first-run wizard.
      router.push('/onboarding');
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : err instanceof Error
            ? err.message
            : 'Unable to create your workspace right now';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full rounded-lg border border-outline-variant bg-surface p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-on-surface">Create your workspace</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Set up a new Nexus workspace and become its administrator.
        </p>

        <div className="mt-6 space-y-4">
          <FormField label="Company / Workspace name" required>
            {({ id }) => (
              <Input
                id={id}
                type="text"
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            )}
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="First name" required>
              {({ id }) => (
                <Input
                  id={id}
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              )}
            </FormField>
            <FormField label="Last name" required>
              {({ id }) => (
                <Input
                  id={id}
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              )}
            </FormField>
          </div>
          <FormField label="Work email" required>
            {({ id }) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
          </FormField>
          <FormField label="Password" required>
            {({ id }) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
          </FormField>
          <FormField
            label="Confirm password"
            required
            error={fieldError ?? undefined}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                aria-describedby={describedBy}
                invalid={Boolean(fieldError)}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            )}
          </FormField>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-error">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating workspace…' : 'Create workspace'}
          </Button>
        </div>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-primary underline">
            Sign in
          </a>
        </p>
      </form>
    </main>
  );
}
