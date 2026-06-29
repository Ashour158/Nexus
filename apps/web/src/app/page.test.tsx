import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import HomePage from './page';

vi.mock('@/components/notifications/notification-bell', () => ({
  NotificationBell: () => <button type="button" aria-label="Notifications" />,
}));

describe('HomePage enterprise dashboard', () => {
  it('shows a motivational system message and role-aware dashboard content', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HomePage />
      </QueryClientProvider>
    );

    expect(screen.getByText('Revenue command center')).toBeInTheDocument();
    expect(screen.getAllByText('Hi, Test User').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Every clean follow-up compounds into a stronger quarter.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Executive' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Board Commit')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sales Rep' }));

    expect(screen.getByRole('button', { name: 'Sales Rep' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('My Hot Leads')).toBeInTheDocument();
    expect(screen.getByText('Today Next Steps')).toBeInTheDocument();
  });
});
