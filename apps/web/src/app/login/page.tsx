'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Minimal email/password login that exchanges credentials with `auth-service`
 * (POST /auth/login). Keycloak SSO will layer on top in a later prompt.
 */
export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const authUrl =
        process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3010/api/v1';
      const res = await axios.post<{
        success: boolean;
        data: {
          accessToken: string;
          user: { id: string; tenantId: string };
          roles: string[];
          permissions: string[];
        };
      }>(`${authUrl}/auth/login`, { email, password });

      if (!res.data?.success) {
        throw new Error('Authentication failed');
      }
      const { accessToken, user, roles, permissions } = res.data.data;
      setSession({
        accessToken,
        userId: user.id,
        tenantId: user.tenantId,
        roles,
        permissions,
      });
      router.push('/deals');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to sign in right now';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-slate-900">Sign in to Nexus</h1>
        <p className="mt-1 text-sm text-slate-600">
          Use your corporate email and password.
        </p>

        <div className="mt-6 space-y-4">
          <FormField label="Email" required>
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
          </FormField>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
    </main>
  );
}
