'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  useRFQ,
  useSendRFQ,
  useConvertRFQToQuote,
  type RFQLineItem,
} from '@/hooks/use-rfqs';
import { formatCurrency, formatDate } from '@/lib/format';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

export default function RFQDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('quotes:read');
  const detail = useRFQ(id);
  const send = useSendRFQ();
  const convert = useConvertRFQToQuote();

  const rfq = detail.data;

  if (!canRead) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You do not have permission to view RFQs.
        </div>
      </main>
    );
  }

  if (detail.isLoading) {
    return (
      <main className="p-6">
        <TableSkeleton rows={4} cols={4} />
      </main>
    );
  }

  if (!rfq) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          RFQ not found.
        </div>
        <Link href="/rfqs" className="mt-2 inline-block text-sm underline">
          Back to RFQs
        </Link>
      </main>
    );
  }

  const lineItems = Array.isArray(rfq.lineItems) ? rfq.lineItems : [];

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">
            <Link href="/rfqs" className="hover:text-slate-800">
              RFQs
            </Link>
            <span> / </span>
            <span className="font-mono text-xs">{rfq.rfqNumber}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{rfq.title}</h1>
          <p className="text-sm text-slate-600">
            Status: <strong>{rfq.status}</strong> · {rfq.currency}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rfq.status !== 'SENT' && rfq.status !== 'CONVERTED' && (
            <Button
              type="button"
              onClick={() =>
                send.mutate(rfq.id, {
                  onSuccess: () => notify.success('RFQ sent'),
                  onError: (err) => notify.error('Send failed', err.message),
                })
              }
              disabled={send.isPending}
            >
              {send.isPending ? 'Sending…' : 'Send RFQ'}
            </Button>
          )}
          {rfq.status !== 'CONVERTED' && (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                convert.mutate(rfq.id, {
                  onSuccess: (res) => {
                    notify.success('Converted to quote');
                    router.push(`/quotes/${res.quoteId}`);
                  },
                  onError: (err) => notify.error('Convert failed', err.message),
                })
              }
              disabled={convert.isPending}
            >
              {convert.isPending ? 'Converting…' : 'Convert to Quote'}
            </Button>
          )}
          {rfq.convertedQuoteId && (
            <Link href={`/quotes/${rfq.convertedQuoteId}`}>
              <Button type="button" variant="secondary">
                View Quote
              </Button>
            </Link>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="RFQ Number" value={rfq.rfqNumber} />
        <Metric label="Status" value={rfq.status} />
        <Metric label="Currency" value={rfq.currency} />
        <Metric label="Required By" value={rfq.requiredByDate ? formatDate(rfq.requiredByDate) : '—'} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Items requested</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-end">Qty</th>
                <th className="px-4 py-2 text-end">Unit Price</th>
                <th className="px-4 py-2 text-end">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineItems.map((item: RFQLineItem, idx: number) => {
                const qty = item.quantity ?? 1;
                const unit = item.unitPrice ?? 0;
                const total = item.total ?? qty * unit;
                return (
                  <tr key={idx}>
                    <td className="px-4 py-2 font-medium text-slate-900">
                      {item.description ?? 'Item'}
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums">{qty}</td>
                    <td className="px-4 py-2 text-end font-mono text-xs">
                      {formatCurrency(unit, rfq.currency)}
                    </td>
                    <td className="px-4 py-2 text-end font-mono text-xs">
                      {formatCurrency(total, rfq.currency)}
                    </td>
                  </tr>
                );
              })}
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    No items requested.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {rfq.internalNotes && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold text-slate-900">Internal notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{rfq.internalNotes}</p>
        </section>
      )}
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
