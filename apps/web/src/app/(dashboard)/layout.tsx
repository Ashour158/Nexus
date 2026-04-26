import type { ReactNode } from 'react';
import { AnalyticsProvider } from '@/components/analytics-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { FeedbackWidget } from '@/components/feedback-widget';
import { AppShell } from '@/components/layout/app-shell';
import { QuickCreateFab } from '@/components/quick-create-fab';

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AppShell>
      <AnalyticsProvider>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AnalyticsProvider>
      <FeedbackWidget />
      <QuickCreateFab />
    </AppShell>
  );
}
