'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useConfirm } from '@/hooks/use-confirm';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DualDateDisplay } from '@/components/ui/DualDateDisplay';
import {
  useInvoice,
  useInvoicePayments,
  useRecordPayment,
  useVoidInvoice,
  type InvoiceLineItem,
} from '@/hooks/use-invoices';
import { formatCurrency } from '@/lib/format';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('invoices:read');
  const { confirm, ConfirmDialog } = useConfirm();
  const invoiceQuery = useInvoice(id);
  const paymentsQuery = useInvoicePayments(id);
  const recordPayment = useRecordPayment();
  const voidInvoice = useVoidInvoice();

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'BANK_TRANSFER',
    reference: '',
    notes: '',
  });
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const invoice = invoiceQuery.data;
  const payments = paymentsQuery.data ?? [];

  if (!canRead) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You do not have permission to view invoices.
        </div>
      </main>
    );
  }

  if (invoiceQuery.isLoading) {
    return (
      <main className="space-y-4 p-6">
        <TableSkeleton rows={6} cols={4} />
      </main>
    );
  }

  if (!invoice) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Invoice not found.
        </div>
      </main>
    );
  }

  const inv = invoice;
  const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems : [];
  const canPay = inv.status === 'DRAFT' || inv.status === 'SENT' || inv.status === 'OVERDUE' || inv.status === 'PARTIAL';
  const canVoid = inv.status !== 'VOID' && inv.status !== 'PAID';

  function onRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) {
      notify.error('Invalid amount');
      return;
    }
    recordPayment.mutate(
      {
        id,
        data: {
          amount,
          currency: inv.currency,
          method: paymentForm.method as 'BANK_TRANSFER' | 'CREDIT_CARD' | 'ACH' | 'CHECK' | 'WIRE' | 'CRYPTO' | 'OTHER',
          reference: paymentForm.reference || undefined,
          notes: paymentForm.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          setShowPaymentForm(false);
          setPaymentForm({ amount: '', method: 'BANK_TRANSFER', reference: '', notes: '' });
        },
      }
    );
  }

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">
            <Link href="/invoices" className="hover:text-slate-800">
              Invoices
            </Link>
            <span> / </span>
            <span className="font-mono text-xs">{invoice.invoiceNumber}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {inv.invoiceNumber}
          </h1>
          <p className="text-sm text-slate-600">
            Status: <strong>{inv.status}</strong> · {inv.currency}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/finance/invoices/${inv.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            download
          >
            Download PDF
          </a>
          {canPay && (
            <Button
              type="button"
              onClick={() => setShowPaymentForm((s) => !s)}
            >
              Record Payment
            </Button>
          )}
          {canVoid && (
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (await confirm('Void this invoice?', 'Void Invoice')) voidInvoice.mutate(id);
              }}
            >
              Void
            </Button>
          )}
        </div>
      </header>

      {showPaymentForm && (
        <form
          onSubmit={onRecordPayment}
          className="max-w-md space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">Record payment</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500">Amount</label>
              <input
                type="number"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Method</label>
              <select
                value={paymentForm.method}
                onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CREDIT_CARD">Credit Card</option>
                <option value="ACH">ACH</option>
                <option value="CHECK">Check</option>
                <option value="WIRE">Wire</option>
                <option value="CRYPTO">Crypto</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500">Reference</label>
            <input
              value={paymentForm.reference}
              onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Notes</label>
            <textarea
              value={paymentForm.notes}
              onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={recordPayment.isPending}>
              {recordPayment.isPending ? 'Saving…' : 'Save payment'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPaymentForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Subtotal" value={formatCurrency(Number(inv.subtotal), inv.currency)} />
        <Metric label="Tax" value={formatCurrency(Number(inv.taxAmount ?? 0), inv.currency)} />
        <Metric label="Total" value={formatCurrency(Number(inv.total), inv.currency)} />
        <Metric label="Paid" value={formatCurrency(Number(inv.paidAmount ?? 0), inv.currency)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-start text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2 text-end">Qty</th>
                    <th className="px-4 py-2 text-end">Unit</th>
                    <th className="px-4 py-2 text-end">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineItems.map((item: InvoiceLineItem, idx: number) => (
                    <tr key={idx}>
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-900">
                          {item.description ?? 'Item'}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums">
                        {item.quantity ?? 1}
                      </td>
                      <td className="px-4 py-2 text-end font-mono text-xs">
                        {formatCurrency(item.unitPrice ?? 0, invoice.currency)}
                      </td>
                      <td className="px-4 py-2 text-end font-mono text-xs">
                        {formatCurrency(item.total ?? 0, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                  {lineItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                        No line items.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="font-semibold text-slate-900">Invoice details</h2>
            <dl className="mt-3 space-y-2 text-slate-600">
              <div className="flex justify-between gap-2">
                <dt>Account</dt>
                <dd className="font-mono text-xs">
                  <Link href={`/accounts/${inv.accountId}`} className="text-blue-700 hover:underline">
                    {inv.accountId.slice(0, 10)}…
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Due date</dt>
                <dd>
                  {inv.dueDate ? (
                    <DualDateDisplay date={inv.dueDate} showHijri className="text-slate-800" />
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Created</dt>
                <dd>
                  <DualDateDisplay date={inv.createdAt} showHijri className="text-slate-800" />
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="font-semibold text-slate-900">Payment history</h2>
            {paymentsQuery.isLoading ? (
              <p className="mt-2 text-xs text-slate-500">Loading…</p>
            ) : payments.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No payments recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                    <div>
                      <p className="font-medium text-slate-900">
                        {formatCurrency(Number(p.amount), p.currency)}
                      </p>
                      <p className="text-xs text-slate-500">{p.method}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '—'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </section>
      {ConfirmDialog}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
