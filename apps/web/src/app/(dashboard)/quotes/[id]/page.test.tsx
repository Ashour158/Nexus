import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuoteDetailPage from './page';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  useQuoteTemplates: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'quote-nova-cpq-v1' }),
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
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

vi.mock('@/hooks/use-quotes', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-quotes')>('@/hooks/use-quotes');
  return {
    ...actual,
    useQuote: () => ({
      isLoading: false,
      isError: false,
      data: {
        id: 'quote-nova-cpq-v1',
        tenantId: 'tenant-1',
        dealId: 'deal-nova-proposal',
        ownerId: 'seller-1',
        accountId: 'account-nova',
        quoteNumber: 'Q-2026-000003',
        name: 'Nova Retail Customer 360 and CPQ Rollout',
        status: 'DRAFT',
        version: 1,
        currency: 'USD',
        subtotal: '67500',
        discountTotal: '3500',
        taxTotal: '3200',
        total: '67200',
        approvalRequired: false,
        createdAt: '2026-05-20T10:00:00.000Z',
        updatedAt: '2026-05-20T10:00:00.000Z',
        lineItems: [],
      },
    }),
    useSendQuote: () => ({ mutate: vi.fn(), isPending: false }),
    useVoidQuote: () => ({ mutate: vi.fn(), isPending: false }),
    useDuplicateQuote: () => ({ mutate: vi.fn(), isPending: false }),
    useCreateDiscountRequest: () => ({ mutate: vi.fn(), isPending: false }),
    useDiscountRequests: () => ({
      isLoading: false,
      data: { data: [], total: 0, page: 1, limit: 25, totalPages: 1 },
    }),
    useDiscountReasons: () => ({ data: [{ code: 'COMPETITIVE_MATCH', label: 'Competitive match' }] }),
    useConvertQuoteToOrder: () => ({ mutate: vi.fn(), isPending: false }),
    useQuoteDocuments: () => ({ isLoading: false, data: [] }),
    useQuoteESignEnvelopes: () => ({ isLoading: false, data: [] }),
    useQuoteRevisions: () => ({
      isLoading: false,
      data: [
        {
          id: 'qrev-nova-v1',
          quoteId: 'quote-nova-cpq-v1',
          version: 1,
          reason: 'Initial quote',
          status: 'DRAFT',
          snapshot: {},
          createdAt: '2026-05-20T10:00:00.000Z',
        },
      ],
    }),
    useQuoteTemplates: mocks.useQuoteTemplates,
    useRenderQuoteDocument: () => ({ mutate: vi.fn(), isPending: false }),
    useSendQuoteForSignature: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <QuoteDetailPage />
    </QueryClientProvider>
  );
}

describe('QuoteDetailPage CPQ surface separation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useQuoteTemplates.mockReturnValue({ data: [], isLoading: false });
  });

  it('keeps template rendering governance out of the seller quote surface', async () => {
    renderWithClient();

    expect(await screen.findByText('Q-2026-000003')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Render package' })).not.toBeInTheDocument();
    expect(screen.queryByText('Default active template')).not.toBeInTheDocument();
    expect(screen.getByText('Managed by admin settings')).toBeInTheDocument();
    expect(mocks.useQuoteTemplates).toHaveBeenCalledWith({ enabled: false });
  });

  it('shows the current quote revision binding for DRQ submission', async () => {
    renderWithClient();

    expect(
      await screen.findByText('DRQ applies to current quote revision v1 (qrev-nova-v1).')
    ).toBeInTheDocument();
  });
});
