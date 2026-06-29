import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuditLogPage from './page';

describe('Admin audit page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders sanitized internal operation audit records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              records: [
                {
                  auditId: 'audit-1',
                  operationType: 'quoteProjection.replay',
                  operationId: 'op-1',
                  operatorId: 'operator-1',
                  sourceService: 'deals-service',
                  targetProjection: 'quoteProjection',
                  dryRun: false,
                  executed: true,
                  reason: 'repair projection',
                  filtersSummary: { aggregateId: 'quote-1' },
                  counts: { processed: 2, created: 1 },
                  status: 'completed',
                  warnings: ['duplicate skipped'],
                  errors: [],
                  correlationId: 'corr-1',
                  createdAt: '2026-05-20T10:00:00.000Z',
                  rawPayload: { customerEmail: 'private@example.com' },
                },
              ],
              pageInfo: { limit: 100, returned: 1, nextCursor: null },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    render(<AuditLogPage />);

    expect(await screen.findByText('quoteProjection.replay')).toBeInTheDocument();
    expect(screen.getByText('op-1')).toBeInTheDocument();
    expect(screen.getAllByText('deals-service').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('completed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('processed: 2 · created: 1')).toBeInTheDocument();
    expect(screen.getByText('duplicate skipped')).toBeInTheDocument();
    expect(screen.queryByText('private@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('rawPayload')).not.toBeInTheDocument();
  });

  it('forwards filter changes through the BFF and shows empty state', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { records: [], pageInfo: { limit: 100, returned: 0, nextCursor: null } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AuditLogPage />);

    expect(await screen.findByText('No internal operation audit records found.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Operation type'), 'financeTimeline.replay');
    await user.selectOptions(screen.getByLabelText('Status'), 'completed');

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown[][];
      const lastCall = String(calls.at(-1)?.[0] ?? '');
      expect(lastCall).toContain('operationType=financeTimeline.replay');
      expect(lastCall).toContain('status=completed');
    });
  });

  it('applies quick filters and forwards the existing BFF filter keys', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { records: [], pageInfo: { limit: 100, returned: 0, nextCursor: null } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AuditLogPage />);

    await screen.findByText('No internal operation audit records found.');

    await user.click(screen.getByRole('button', { name: 'Backfill executions' }));
    await waitFor(() => {
      const lastCall = String((fetchMock.mock.calls as unknown[][]).at(-1)?.[0] ?? '');
      expect(lastCall).toContain('operationType=financeTimeline.idempotency_backfill_execute');
    });

    await user.click(screen.getByRole('button', { name: 'Failed operations' }));
    await waitFor(() => {
      const lastCall = String((fetchMock.mock.calls as unknown[][]).at(-1)?.[0] ?? '');
      expect(lastCall).toContain('status=failed');
    });

    await user.selectOptions(screen.getByLabelText('Source service'), 'crm-service');
    await user.selectOptions(screen.getByLabelText('Target'), 'financeTimeline');
    await user.selectOptions(screen.getByLabelText('Time range'), '24h');

    await waitFor(() => {
      const lastCall = String((fetchMock.mock.calls as unknown[][]).at(-1)?.[0] ?? '');
      expect(lastCall).toContain('sourceService=crm-service');
      expect(lastCall).toContain('targetDomain=financeTimeline');
      expect(lastCall).toContain('from=');
    });
  });

  it('renders page-window summaries from sanitized records and exports only safe columns', async () => {
    const createObjectURL = vi.fn((_blob: unknown) => 'blob:audit-export');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              records: [
                {
                  auditId: 'audit-1',
                  operationType: 'financeTimeline.idempotency_backfill_execute',
                  operationId: 'op-1',
                  operatorId: 'operator-1',
                  sourceService: 'crm-service',
                  targetProjection: 'financeTimeline',
                  dryRun: false,
                  executed: true,
                  reason: 'operator approved backfill',
                  counts: { updated: 2, blockedMissingSourceEventId: 1 },
                  status: 'completed_with_warnings',
                  warnings: ['one row blocked'],
                  errors: [],
                  correlationId: 'corr-1',
                  createdAt: '2026-05-20T10:00:00.000Z',
                  rawActivityCustomFields: { customerEmail: 'private@example.com' },
                },
                {
                  auditId: 'audit-2',
                  operationType: 'cpq.transition.reconcile',
                  operationId: 'op-2',
                  operatorId: 'operator-2',
                  sourceService: 'finance-service',
                  targetDomain: 'cpq',
                  dryRun: false,
                  executed: true,
                  reason: 'timeout recovery',
                  counts: { failed: 1 },
                  status: 'failed',
                  warnings: [],
                  errors: ['timeout'],
                  correlationId: 'corr-2',
                  createdAt: '2026-05-20T11:00:00.000Z',
                },
              ],
              pageInfo: { limit: 100, returned: 2, nextCursor: null },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
    const user = userEvent.setup();

    render(<AuditLogPage />);

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getByText('1 failed')).toBeInTheDocument();
    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.queryByText('private@example.com')).not.toBeInTheDocument();

    class CapturedBlob {
      constructor(public readonly parts: unknown[]) {}
    }
    vi.stubGlobal('Blob', CapturedBlob);
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const exportedBlob = createObjectURL.mock.calls[0][0] as CapturedBlob;
    const exportedText = exportedBlob.parts.join('\n');
    expect(exportedText).toContain('financeTimeline.idempotency_backfill_execute');
    expect(exportedText).toContain('blockedMissingSourceEventId');
    expect(exportedText).not.toContain('private@example.com');
    expect(exportedText).not.toContain('rawActivityCustomFields');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
