import { describe, it, expect, beforeEach } from 'vitest';
import { render, act, fireEvent, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import axe, { type AxeResults } from 'axe-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { server } from '../../test/msw/server';

import DashboardPage from '../../app/(dashboard)/page';
import ReportsPage from '../../app/(dashboard)/reports/page';
import LeadsPage from '../../app/(dashboard)/leads/page';
import DealsPage from '../../app/(dashboard)/deals/page';
import AccountsPage from '../../app/(dashboard)/accounts/page';
import ContactsPage from '../../app/(dashboard)/contacts/page';
import TasksPage from '../../app/(dashboard)/tasks/page';
import ActivitiesPage from '../../app/(dashboard)/activities/page';
import TicketsPage from '../../app/(dashboard)/tickets/page';
import CampaignsPage from '../../app/(dashboard)/campaigns/page';
import KnowledgePage from '../../app/(dashboard)/knowledge/page';
import WhatsNewPage from '../../app/(dashboard)/whats-new/page';

import { CommandPalette } from '../../components/layout/command-palette';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

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

async function violationsOf(ui: React.ReactElement, impacts: string[]) {
  const { container } = render(ui, { wrapper });
  let results: AxeResults | undefined;
  await act(async () => {
    results = await axe.run(container);
  });
  return results!.violations.filter((v) => impacts.includes(v.impact ?? ''));
}

// Top routes to scan. Each entry renders its real page component; a catch-all
// MSW handler (below) returns empty payloads so pages render their loading/empty
// state deterministically without live data.
const ROUTES: Array<[name: string, ui: React.ReactElement]> = [
  ['Dashboard', <DashboardPage />],
  ['Reports', <ReportsPage />],
  ['Leads', <LeadsPage />],
  ['Deals', <DealsPage />],
  ['Accounts', <AccountsPage />],
  ['Contacts', <ContactsPage />],
  ['Tasks', <TasksPage />],
  ['Activities', <ActivitiesPage />],
  ['Tickets', <TicketsPage />],
  ['Campaigns', <CampaignsPage />],
  ['Knowledge', <KnowledgePage />],
  ["What's new", <WhatsNewPage />],
];

describe('Accessibility — axe-core across top routes', () => {
  beforeEach(() => {
    // Empty-but-valid responses for any request a page fires on mount, so the
    // scan focuses on markup rather than data-dependent failures.
    server.use(
      http.all('*', () =>
        HttpResponse.json({ data: [], items: [], meta: { total: 0 }, hits: [] })
      )
    );
  });

  it.each(ROUTES)('%s has no critical accessibility violations', async (_name, ui) => {
    const critical = await violationsOf(ui, ['critical']);
    expect(critical).toHaveLength(0);
  });
});

describe('Accessibility — focus management', () => {
  it('confirm dialog traps Tab focus within the dialog', async () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete record</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline">Cancel</Button>
            <Button variant="destructive">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
      { wrapper }
    );

    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    expect(focusable.length).toBeGreaterThan(1);

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Tabbing forward off the last focusable wraps back to the first.
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    // Shift+Tab off the first wraps to the last.
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('command palette moves focus to its search input on open', async () => {
    render(<CommandPalette open onClose={() => {}} />, { wrapper });
    const input = document.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    // The palette focuses its input shortly after opening.
    await waitFor(() => expect(document.activeElement).toBe(input));
  });
});
