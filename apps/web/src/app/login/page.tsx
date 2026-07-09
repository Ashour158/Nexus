'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth.store';

/** Decode a JWT payload (base64url) in the browser without a dependency. */
function decodeJwt(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

/**
 * Minimal email/password login that exchanges credentials with `auth-service`
 * (POST /auth/login). Keycloak SSO will layer on top in a later prompt.
 */
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'development' ||
      process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'false'
    ) {
      return;
    }

    setSession({
      accessToken: 'dev-preview-token',
      userId: 'dev.admin@nexus.local',
      tenantId: 'default',
      roles: ['admin'],
      permissions: ['*'],
    });
    document.cookie = 'nexus_session=dev-preview;path=/;max-age=86400;SameSite=Lax';
    router.replace(searchParams.get('redirect') ?? '/');
  }, [router, searchParams, setSession]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const authUrl =
        process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3010/api/v1';
      const res = await axios.post<{
        success: boolean;
        data: { accessToken: string; refreshToken?: string };
      }>(`${authUrl}/auth/login`, { email, password });

      if (!res.data?.success || !res.data.data?.accessToken) {
        throw new Error('Authentication failed');
      }
      const { accessToken, refreshToken } = res.data.data;
      // Identity/roles/permissions live in the JWT claims, not the response body.
      const claims = decodeJwt(accessToken);
      setSession({
        accessToken,
        refreshToken,
        userId: String(claims.sub ?? ''),
        tenantId: String(claims.tenantId ?? ''),
        roles: Array.isArray(claims.roles) ? (claims.roles as string[]) : [],
        permissions: Array.isArray(claims.permissions) ? (claims.permissions as string[]) : [],
      });
      // Coarse-grained session cookie for middleware route protection.
      document.cookie = 'nexus_session=1;path=/;max-age=86400;SameSite=Lax';
      // The access token in a cookie too, so server-side /api/* route handlers
      // (which can't read the client's sessionStorage) can forward it upstream.
      // Middleware injects it as the Authorization header on /api/* requests.
      document.cookie = `nexus_token=${accessToken};path=/;max-age=86400;SameSite=Lax`;
      const redirect = searchParams.get('redirect');
      router.push(redirect ?? '/deals');
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

        <p className="mt-6 text-center text-xs text-slate-400">
          By signing in you agree to our{' '}
          <a href="/legal/terms" className="underline hover:text-slate-600">Terms</a>{' '}and{' '}
          <a href="/legal/privacy" className="underline hover:text-slate-600">Privacy Policy</a>.
        </p>
      </form>
    </main>
  );
}
