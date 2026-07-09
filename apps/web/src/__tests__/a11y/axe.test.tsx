import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import axe, { type AxeResults } from 'axe-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '../../app/(dashboard)/page';
import ReportsPage from '../../app/(dashboard)/reports/page';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('Accessibility — axe-core', () => {
  it('Dashboard has no critical accessibility violations', async () => {
    const { container } = render(<DashboardPage />, { wrapper });
    let results: AxeResults | undefined;
    await act(async () => {
      results = await axe.run(container);
    });
    const criticalViolations = results!.violations.filter((v) => v.impact === 'critical');
    expect(criticalViolations).toHaveLength(0);
  });

  it('Reports page has no serious accessibility violations', async () => {
    const { container } = render(<ReportsPage />, { wrapper });
    let results: AxeResults | undefined;
    await act(async () => {
      results = await axe.run(container);
    });
    const seriousViolations = results!.violations.filter((v) => v.impact === 'serious');
    expect(seriousViolations).toHaveLength(0);
  });
});
