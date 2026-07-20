'use client';

import { useState, type JSX } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, PackageCheck } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  CRMEmptyState,
  CRMErrorState,
  CRMFilterPills,
  CRMModuleShell,
  CRMPageHeader,
  CRMStatusBadge,
  CRMTableShell,
  CRMToolbar,
} from '@/components/ui/crm';
import { formatCurrency, formatDate } from '@/lib/format';
import { useOrders, ORDER_STATUSES, type SalesOrderStatus } from '@/hooks/use-orders';
import { ExportButton } from '@/components/export/ExportButton';

const PAGE_SIZE = 25;

const STATUS_TONES: Record<string, 'slate' | 'amber' | 'blue' | 'emerald' | 'rose'> = {
  DRAFT: 'slate',
  PENDING_APPROVAL: 'amber',
  CONFIRMED: 'blue',
  FULFILLING: 'blue',
  FULFILLED: 'emerald',
  CANCELLED: 'rose',
  CLOSED: 'slate',
};

export default function OrdersPage(): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<'ALL' | SalesOrderStatus>('ALL');
  const [page, setPage] = useState(1);

  const ordersQuery = useOrders({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    page,
    limit: PAGE_SIZE,
  });

  const orders = ordersQuery.data?.data ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <CRMModuleShell>
      <CRMPageHeader
        icon={PackageCheck}
        title="Orders"
        description={`${total} total sales orders`}
        actions={<ExportButton module="orders" filters={{ status: statusFilter }} />}
      />

      {/* Filters */}
      <CRMToolbar>
        <CRMFilterPills
          value={statusFilter}
          options={(['ALL', ...ORDER_STATUSES] as const).map((value) => ({ value, label: value.replace('_', ' ') }))}
          onChange={(value) => { setStatusFilter(value); setPage(1); }}
        />
      </CRMToolbar>

      {/* Table */}
      <CRMTableShell>
        {ordersQuery.isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : ordersQuery.isError ? (
          <CRMErrorState title="Could not load orders." />
        ) : orders.length === 0 ? (
          <CRMEmptyState
            icon={PackageCheck}
            title="No orders found"
            description={
              statusFilter === 'ALL'
                ? 'Sales orders confirmed from quotes will appear here.'
                : `No orders with status ${statusFilter.replace('_', ' ')}. Try a different filter.`
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-start text-xs uppercase tracking-wide text-on-surface-variant">
              <tr>
                <th className="px-4 py-3 text-left">Order #</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Account</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Total</th>
                <th className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {orders.map((order) => (
                <tr key={order.id} className="cursor-pointer hover:bg-surface-container-low">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-on-surface">
                    <Link href={`/orders/${order.id}`} className="hover:underline">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    <Link href={`/orders/${order.id}`} className="hover:underline">
                      {order.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-on-surface-variant">{order.accountId.slice(0, 10)}…</td>
                  <td className="px-4 py-3">
                    <CRMStatusBadge
                      tone={STATUS_TONES[order.status] ?? 'slate'}
                      className={order.status === 'CANCELLED' ? 'line-through' : undefined}
                    >
                      {order.status.replace('_', ' ')}
                    </CRMStatusBadge>
                  </td>
                  <td className="px-4 py-3 font-semibold text-on-surface">
                    {formatCurrency(order.total, order.currency)}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CRMTableShell>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-on-surface-variant">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </CRMModuleShell>
  );
}
