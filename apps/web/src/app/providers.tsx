'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useUiStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { connectSocket, disconnectSocket } from '@/lib/socket';

/**
 * Top-level client providers — React Query + global toast rendering.
 * Kept intentionally small; we'll layer on Auth/Feature-flag providers as the
 * respective systems come online.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: { retry: 0 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <DevAuthBootstrap />
      <RealtimeBridge />
      {children}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          duration: 4000,
          classNames: {
            toast: 'font-sans text-sm',
            error: 'border-red-200',
            success: 'border-green-200',
          },
        }}
      />
      <CustomToastViewport />
    </QueryClientProvider>
  );
}

function DevAuthBootstrap() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);
  const tenantId = useAuthStore((s) => s.tenantId);
  const roles = useAuthStore((s) => s.roles);
  const permissions = useAuthStore((s) => s.permissions);
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    const hasCompleteDevSession =
      accessToken === 'dev-preview-token' &&
      userId === 'dev.admin@nexus.local' &&
      tenantId === 'default' &&
      roles.includes('admin') &&
      permissions.includes('*');

    if (
      process.env.NODE_ENV !== 'development' ||
      process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'false' ||
      hasCompleteDevSession
    ) {
      return;
    }

    document.cookie = 'nexus_session=dev-preview;path=/;max-age=86400;SameSite=Lax';
    setSession({
      accessToken: 'dev-preview-token',
      userId: 'dev.admin@nexus.local',
      tenantId: 'default',
      roles: ['admin'],
      permissions: ['*'],
    });
  }, [accessToken, permissions, roles, setSession, tenantId, userId]);

  return null;
}

function RealtimeBridge() {
  const token = useAuthStore((s) => s.accessToken);
  useEffect(() => {
    if (token) connectSocket();
    return () => disconnectSocket();
  }, [token]);
  return null;
}

function CustomToastViewport() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((t) => {
        const tone =
          t.variant === 'error'
            ? 'border-red-300 bg-red-50 text-red-900'
            : t.variant === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : t.variant === 'warning'
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-slate-300 bg-white text-slate-900';
        return (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-md border p-3 shadow-sm ${tone}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description ? (
                  <p className="mt-1 text-xs opacity-80">{t.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-xs font-semibold underline-offset-2 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
