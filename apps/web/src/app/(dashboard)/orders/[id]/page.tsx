'use client';

import { useState, type JSX } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Loader2, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  useOrder,
  useCreateInvoiceFromOrder,
  type OrderLineItem,
} from '@/hooks/use-orders';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-indigo-100 text-indigo-700',
  FULFILLING: 'bg-indigo-100 text-indigo-700',
  FULFILLED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700 line-through',
  CLOSED: 'bg-slate-100 text-slate-400',
};

// Invoicing an order only makes sense once it is committed.
const INVOICEABLE = new Set(['CONFIRMED', 'FULFILLING', 'FULFILLED']);

function lineLabel(item: OrderLineItem, i: number): string {
  return item.description || (item.productId ? `Product ${item.productId}` : `Line ${i + 1}`);
}

export default function OrderDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const orderQuery = useOrder(id);
  const createInvoice = useCreateInvoiceFromOrder();
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);

  const order = orderQuery.data;

  function handleCreateInvoice() {
    createInvoice.mutate(
      { id },
      {
        onSuccess: (invoice) => {
          setCreatedInvoiceId(invoice.id);
          router.push(`/invoices/${invoice.id}`);
        },
      }
    );
  }

  return (
    <main className="space-y-4 p-4">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      {orderQuery.isLoading ? (
        <CardSkeleton />
      ) : orderQuery.isError || !order ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-red-600">
          Could not load this order.
        </div>
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-slate-900">{order.name}</h1>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[order.status] ?? ''}`}>
                  {order.status.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-slate-500">
                {order.orderNumber} · {formatDate(order.createdAt)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button
                variant="primary"
                onClick={handleCreateInvoice}
                disabled={createInvoice.isPending || !INVOICEABLE.has(order.status)}
                title={INVOICEABLE.has(order.status) ? undefined : 'Order must be confirmed before invoicing'}
              >
                {createInvoice.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ReceiptText className="h-4 w-4" />
                )}
                Create Invoice
              </Button>
              {!INVOICEABLE.has(order.status) && (
                <span className="text-xs text-slate-400">Invoiceable once confirmed</span>
              )}
              {createdInvoiceId && (
                <Link href={`/invoices/${createdInvoiceId}`} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                  <FileText className="h-3.5 w-3.5" /> View invoice
                </Link>
              )}
            </div>
          </header>

          {/* Links */}
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Account', value: order.accountId, href: `/accounts/${order.accountId}` },
              order.dealId ? { label: 'Deal', value: order.dealId, href: `/deals/${order.dealId}` } : null,
              order.quoteId ? { label: 'Quote', value: order.quoteId, href: `/quotes/${order.quoteId}` } : null,
              order.contactId ? { label: 'Contact', value: order.contactId, href: `/contacts/${order.contactId}` } : null,
            ]
              .filter((x): x is { label: string; value: string; href: string } => Boolean(x))
              .map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-400">{link.label}</p>
                  <p className="mt-1 truncate font-mono text-xs text-slate-700">{link.value}</p>
                </Link>
              ))}
          </section>

          {/* Line items */}
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
            </div>
            {order.lineItems.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">No line items on this order.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Unit price</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.lineItems.map((item, i) => (
                    <tr key={item.id ?? i}>
                      <td className="px-4 py-2 text-slate-700">{lineLabel(item, i)}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{item.quantity ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-600">
                        {item.unitPrice != null ? formatCurrency(item.unitPrice, order.currency) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-slate-900">
                        {item.total != null ? formatCurrency(item.total, order.currency) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Totals */}
          <section className="ml-auto w-full max-w-xs space-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <Row label="Subtotal" value={formatCurrency(order.subtotal, order.currency)} />
            <Row label="Discount" value={`- ${formatCurrency(order.discountAmount, order.currency)}`} />
            <Row label="Tax" value={formatCurrency(order.taxAmount, order.currency)} />
            <div className="mt-2 border-t border-slate-200 pt-2">
              <Row label="Total" value={formatCurrency(order.total, order.currency)} bold />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-semibold text-slate-900' : 'text-slate-500'}>{label}</span>
      <span className={bold ? 'text-base font-bold text-slate-900' : 'text-slate-700'}>{value}</span>
    </div>
  );
}
