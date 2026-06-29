import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RFQDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'rfq-nova-cx' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/stores/auth.store', () => {
  const state = {
    accessToken: 'seller-token',
    tenantId: 'tenant-1',
    userId: 'seller-1',
    roles: ['seller'],
    permissions: ['quotes:read'],
    hasPermission: (permission: string) => state.permissions.includes(permission),
  };
  const useAuthStore = (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state;
  useAuthStore.getState = () => state;
  return { useAuthStore };
});

const mocks = vi.hoisted(() => ({
  useRFQ: vi.fn(),
}));

vi.mock('@/hooks/use-rfqs', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-rfqs')>('@/hooks/use-rfqs');
  return {
    ...actual,
    useRFQ: mocks.useRFQ,
    useSendRFQ: () => ({ mutate: vi.fn(), isPending: false }),
    useConvertRFQToQuote: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RFQDetailPage />
    </QueryClientProvider>
  );
}

describe('RFQDetailPage lifecycle surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the preview RFQ detail with hardened lifecycle copy', async () => {
    mocks.useRFQ.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        id: 'rfq-nova-cx',
        tenantId: 'tenant-1',
        rfqNumber: 'RFQ-2026-000003',
        title: 'Nova Retail CX Platform Request',
        status: 'DRAFT',
        currency: 'USD',
        ownerId: 'seller-1',
        createdAt: '2026-05-20T10:00:00.000Z',
        updatedAt: '2026-05-20T10:00:00.000Z',
        lineItems: [],
      },
    });

    renderWithClient();

    expect((await screen.findAllByText('RFQ-2026-000003')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send RFQ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convert after review' })).toBeDisabled();
    expect(screen.getByText(/finance-service transitions/i)).toBeInTheDocument();
  });

  it('shows a stable missing-RFQ error state', async () => {
    mocks.useRFQ.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error('RFQ not found'),
      data: undefined,
    });

    renderWithClient();

    expect(await screen.findByText('RFQ not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to RFQs' })).toHaveAttribute('href', '/rfqs');
  });
});
