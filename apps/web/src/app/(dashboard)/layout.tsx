import type { ReactNode } from 'react';
import { AnalyticsProvider } from '@/components/analytics-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { FeedbackWidget } from '@/components/feedback-widget';
import { HydrationGate } from '@/components/hydration-gate';
import { AppShell } from '@/components/layout/app-shell';
import { QuickCreateFab } from '@/components/quick-create-fab';

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // HydrationGate defers the authenticated shell until the persisted auth store
  // rehydrates on the client, so permission-gated pages don't mismatch between
  // the empty server store and the populated client store (React #418/#422).
  return (
    <HydrationGate>
      <AppShell>
        <AnalyticsProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
        </AnalyticsProvider>
        <FeedbackWidget />
        <QuickCreateFab />
      </AppShell>
    </HydrationGate>
  );
}
