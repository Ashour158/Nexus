'use client';

import { useState, type JSX } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/format';
import { useOrders, ORDER_STATUSES, type SalesOrderStatus } from '@/hooks/use-orders';
import { ExportButton } from '@/components/export/ExportButton';

const PAGE_SIZE = 25;

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  FULFILLING: 'bg-indigo-100 text-indigo-700',
  FULFILLED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700 line-through',
  CLOSED: 'bg-slate-100 text-slate-400',
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
    <main className="space-y-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Orders</h1>
          <p className="text-sm text-slate-500">{total} total sales orders</p>
        </div>
        <ExportButton module="orders" filters={{ status: statusFilter }} />
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(['ALL', ...ORDER_STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Table */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {ordersQuery.isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : ordersQuery.isError ? (
          <div className="p-8 text-center text-sm text-red-600">Could not load orders.</div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon="📦"
            title="No orders found"
            description={
              statusFilter === 'ALL'
                ? 'Sales orders confirmed from quotes will appear here.'
                : `No orders with status ${statusFilter.replace('_', ' ')}. Try a different filter.`
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Order #</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Account</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Total</th>
                <th className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                    <Link href={`/orders/${order.id}`} className="hover:underline">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <Link href={`/orders/${order.id}`} className="hover:underline">
                      {order.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{order.accountId.slice(0, 10)}…</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[order.status] ?? ''}`}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {formatCurrency(order.total, order.currency)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
