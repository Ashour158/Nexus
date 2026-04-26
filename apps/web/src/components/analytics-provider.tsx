'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { identifyUser, initPostHog } from '@/lib/posthog';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { userId, tenantId, roles } = useAuthStore((s) => ({
    userId: s.userId,
    tenantId: s.tenantId,
    roles: s.roles,
  }));

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (userId) {
      identifyUser(userId, {
        tenantId,
        roles,
      });
    }
  }, [roles, tenantId, userId]);

  return <>{children}</>;
}
