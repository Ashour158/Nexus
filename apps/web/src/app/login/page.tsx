'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth.store';
import { establishSession } from '@/lib/auth-session';

interface Workspace {
  tenantId: string;
  slug: string;
  name: string;
}

/**
 * Minimal email/password login that exchanges credentials with `auth-service`
 * (POST /auth/login). Keycloak SSO will layer on top in a later prompt.
 *
 * Multi-workspace: on submit we first look up which workspaces the email has an
 * account in (GET /auth/workspaces). 0–1 workspaces log in straight through
 * (the single slug, if any); >1 reveals an inline picker and asks the user to
 * choose before the login POST goes out with the selected `workspaceSlug`.
 */
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');

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

  const authUrl =
    process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3010/api/v1';

  /** POST /auth/login (optionally scoped to a workspace) and run the shared
   * post-auth sequence. Returns nothing; throws are handled by the caller. */
  const doLogin = async (workspaceSlug?: string) => {
    const res = await axios.post<{
      success: boolean;
      data: { accessToken: string; refreshToken?: string };
    }>(`${authUrl}/auth/login`, {
      email,
      password,
      ...(workspaceSlug ? { workspaceSlug } : {}),
    });

    if (!res.data?.success || !res.data.data?.accessToken) {
      throw new Error('Authentication failed');
    }
    const { accessToken, refreshToken } = res.data.data;
    await establishSession({ accessToken, refreshToken }, setSession);
    const redirect = searchParams.get('redirect');
    router.push(redirect ?? '/deals');
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // If the picker is already showing, the user has resolved which workspace
      // to sign into — go straight to the scoped login.
      if (workspaces.length > 1) {
        if (!selectedSlug) {
          setError('Select a workspace to continue.');
          return;
        }
        await doLogin(selectedSlug);
        return;
      }

      // Resolve which workspace(s) this email belongs to before authenticating.
      // Always 200; degrade gracefully to a plain login if the lookup fails.
      let found: Workspace[] = [];
      try {
        const wsRes = await axios.get<{
          success: boolean;
          data: { workspaces: Workspace[] };
        }>(`${authUrl}/auth/workspaces`, { params: { email } });
        found = wsRes.data?.data?.workspaces ?? [];
      } catch {
        found = [];
      }

      if (found.length > 1) {
        // Reveal the picker and ask the user to choose + resubmit.
        setWorkspaces(found);
        setSelectedSlug(found[0]?.slug ?? '');
        return;
      }

      // 0 or 1 workspace: log in as today (single slug when known).
      await doLogin(found[0]?.slug);
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : err instanceof Error
            ? err.message
            : 'Unable to sign in right now';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const multiWorkspace = workspaces.length > 1;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full rounded-lg border border-outline-variant bg-surface p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-on-surface">Sign in to Nexus</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  // Email changed — the resolved workspace list no longer applies.
                  if (workspaces.length > 0) {
                    setWorkspaces([]);
                    setSelectedSlug('');
                  }
                }}
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

          {multiWorkspace ? (
            <FormField
              label="Workspace"
              required
              hint="Your email has access to multiple workspaces — choose one."
            >
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  value={selectedSlug}
                  onChange={(e) => setSelectedSlug(e.target.value)}
                  required
                  className="flex h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1 text-sm text-on-surface focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <option value="" disabled>
                    Select a workspace…
                  </option>
                  {workspaces.map((ws) => (
                    <option key={ws.tenantId} value={ws.slug}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-error">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting
              ? 'Signing in…'
              : multiWorkspace
                ? 'Continue'
                : 'Sign in'}
          </Button>
        </div>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          Need a workspace?{' '}
          <a href="/register" className="font-medium text-primary underline">
            Create an account
          </a>
        </p>

        <p className="mt-4 text-center text-xs text-on-surface-variant">
          By signing in you agree to our{' '}
          <a href="/legal/terms" className="underline hover:text-on-surface-variant">Terms</a>{' '}and{' '}
          <a href="/legal/privacy" className="underline hover:text-on-surface-variant">Privacy Policy</a>.
        </p>
      </form>
    </main>
  );
}
