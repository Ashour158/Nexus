import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';

/**
 * First-run onboarding state — calls the Next.js BFF at `/api/onboarding`
 * (per-tenant JSON store). Progress + completion persist server-side so the
 * wizard resumes and the dashboard checklist hides once onboarding is done.
 */

export interface OnboardingState {
  completed: boolean;
  steps: Record<string, boolean>;
  updatedAt: string;
}

export interface OnboardingPatch {
  completed?: boolean;
  steps?: Record<string, boolean>;
}

export const onboardingKeys = {
  state: ['onboarding', 'state'] as const,
};

function useHeaders(): Record<string, string> {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  return {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    'x-tenant-id': tenantId ?? 'default',
    'Content-Type': 'application/json',
  };
}

export function useOnboarding() {
  const h = useHeaders();
  return useQuery<OnboardingState>({
    queryKey: onboardingKeys.state,
    queryFn: async () => {
      const res = await fetch('/api/onboarding', { headers: h });
      if (!res.ok) throw new Error('Failed to load onboarding state');
      return (await res.json()) as OnboardingState;
    },
    staleTime: 30_000,
  });
}

export function useUpdateOnboarding() {
  const qc = useQueryClient();
  const h = useHeaders();
  return useMutation<OnboardingState, Error, OnboardingPatch>({
    mutationFn: async (patch) => {
      const res = await fetch('/api/onboarding', {
        method: 'PUT',
        headers: h,
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      return (await res.json()) as OnboardingState;
    },
    onSuccess: (data) => qc.setQueryData(onboardingKeys.state, data),
  });
}
