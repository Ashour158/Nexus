'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { identifyUser, initPostHog } from '@/lib/posthog';
import { CONSENT_EVENT } from '@/lib/consent';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { userId, tenantId, roles } = useAuthStore((s) => ({
    userId: s.userId,
    tenantId: s.tenantId,
    roles: s.roles,
  }));

  useEffect(() => {
    // initPostHog is a no-op until the user consents; re-run it when the consent
    // choice changes so accepting starts capture without a full reload.
    initPostHog();
    const onConsent = () => initPostHog();
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
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
