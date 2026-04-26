'use client';

import Link from 'next/link';
import { useState, type JSX } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiClients } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  useQuote,
  useSendQuote,
  useVoidQuote,
  useDuplicateQuote,
  type Quote,
  type QuoteLine,
} from '@/hooks/use-quotes';
import { useUiStore } from '@/stores/ui.store';

export default function QuoteDetailPage(): JSX.Element {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const quoteId = params?.id ?? '';
  const pushToast = useUiStore((s) => s.pushToast);
  const q = useQuote(quoteId);
  const sendQuote = useSendQuote();
  const voidQuote = useVoidQuote();
  const duplicateQuote = useDuplicateQuote();
  const [voidReason, setVoidReason] = useState('');
  const [showVoid, setShowVoid] = useState(false);
  const [portalLink, setPortalLink] = useState('');

  async function downloadPdf(): Promise<void> {
    const base = process.env.NEXT_PUBLIC_DOCUMENT_URL ?? 'http://localhost:3016';
    const res = await fetch(`${base}/api/v1/documents/quotes/${quote.id}/pdf`);
    if (!res.ok) {
      pushToast({ variant: 'error', title: 'PDF download failed' });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quote-${quote.quoteNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function sharePortalLink(): Promise<void> {
    const token = await apiClients.portal.post<{ token: string }>('/api/v1/portal/tokens', {
      entityType: 'QUOTE',
      entityId: quote.id,
      expiresInDays: 30,
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const link = `${appUrl}/portal/${token.token}`;
    setPortalLink(link);
    await navigator.clipboard?.writeText(link).catch(() => undefined);
    pushToast({ variant: 'success', title: 'Portal link copied' });
  }

  if (q.isLoading) {
    return (
      <main className="px-6 py-6">
        <p className="text-sm text-slate-500">Loading quote…</p>
      </main>
    );
  }

  if (q.isError || q.data === undefined) {
    return (
      <main className="px-6 py-6">
        <p className="text-sm text-red-600">
          {q.error instanceof Error ? q.error.message : 'Quote not found'}
        </p>
        <Link href="/quotes" className="mt-2 inline-block text-sm underline">
          Back to quotes
        </Link>
      </main>
    );
  }

  const quote: Quote = q.data;
  const lines: QuoteLine[] = Array.isArray(quote.lineItems) ? quote.lineItems : [];
  const subtotal = Number(quote.subtotal);
  const total = Number(quote.total);

  function onSend() {
    sendQuote.mutate(quote.id, {
      onSuccess: () => pushToast({ variant: 'success', title: 'Quote sent' }),
      onError: (e) =>
        pushToast({
          variant: 'error',
          title: 'Send failed',
          description: e.message,
        }),
    });
  }

  function onVoid(e: React.FormEvent) {
    e.preventDefault();
    const reason = voidReason.trim() || 'Voided';
    voidQuote.mutate(
      { id: quote.id, reason },
      {
        onSuccess: () => {
          pushToast({ variant: 'success', title: 'Quote voided' });
          setShowVoid(false);
          setVoidReason('');
        },
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Void failed',
            description: err.message,
          }),
      }
    );
  }

  function onDuplicate() {
    duplicateQuote.mutate(quote.id, {
      onSuccess: (dup) => {
        pushToast({ variant: 'success', title: 'Duplicate created' });
        router.push(`/quotes/${dup.id}`);
      },
      onError: (e) =>
        pushToast({
          variant: 'error',
          title: 'Duplicate failed',
          description: e.message,
        }),
    });
  }

  const canSend = quote.status === 'DRAFT' || quote.status === 'APPROVED';
  const canVoid =
    quote.status !== 'VOID' &&
    quote.status !== 'CONVERTED' &&
    quote.status !== 'ACCEPTED';

  return (
    <main className="space-y-6 px-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">
            <Link href="/quotes" className="hover:text-slate-800">
              Quotes
            </Link>
            <span> / </span>
            <span className="font-mono text-xs">{quote.quoteNumber}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{quote.name}</h1>
          <p className="text-sm text-slate-600">
            Status: <strong>{quote.status}</strong> · v{quote.version} ·{' '}
            {quote.currency}
          </p>
          <p className="mt-1 text-sm">
            <Link
              href={`/deals/${quote.dealId}`}
              className="text-blue-700 hover:underline"
            >
              Open deal
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSend ? (
            <Button
              type="button"
              onClick={onSend}
              disabled={sendQuote.isPending}
            >
              {sendQuote.isPending ? 'Sending…' : 'Send quote'}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button type="button" variant="secondary" onClick={() => void downloadPdf()}>
            Download PDF
          </Button>
          <Button type="button" variant="secondary" onClick={() => void sharePortalLink()}>
            Share Portal Link
          </Button>
          {canVoid ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowVoid((s) => !s)}
            >
              Void
            </Button>
          ) : null}
        </div>
      </header>

      {showVoid ? (
        <form
          onSubmit={onVoid}
          className="max-w-md space-y-2 rounded-lg border border-red-200 bg-red-50/40 p-4"
        >
          <label className="block text-sm">
            <span className="text-xs font-medium text-red-800">Reason</span>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={2}
              className="mt-1"
              placeholder="Why void this quote?"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={voidQuote.isPending}>
              Confirm void
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowVoid(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {portalLink ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
          <p className="font-medium text-blue-900">Portal link copied</p>
          <Input className="mt-2" readOnly value={portalLink} onFocus={(e) => e.currentTarget.select()} />
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Subtotal" value={formatCurrency(subtotal, quote.currency)} />
        <Metric label="Discount" value={formatCurrency(Number(quote.discountTotal), quote.currency)} />
        <Metric label="Tax" value={formatCurrency(Number(quote.taxTotal), quote.currency)} />
        <Metric label="Total" value={formatCurrency(total, quote.currency)} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Unit</th>
                <th className="px-4 py-2 text-right">Disc %</th>
                <th className="px-4 py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, idx) => (
                <tr key={line.id ?? `${line.productId}-${idx}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">
                      {line.productName ?? line.productId.slice(0, 8)}
                    </div>
                    {line.description ? (
                      <p className="text-xs text-slate-500">{line.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {line.unitPrice}
                  </td>
                  <td className="px-4 py-2 text-right">{line.discountPercent}%</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {line.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No line items.</p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 className="font-semibold text-slate-900">Terms & dates</h2>
          <dl className="mt-3 space-y-2 text-slate-600">
            <div className="flex justify-between gap-2">
              <dt>Payment terms</dt>
              <dd className="font-mono text-xs">{quote.paymentTerms ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Valid until</dt>
              <dd>{formatDate(quote.validUntil ?? quote.expiresAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Promos</dt>
              <dd>{(quote.appliedPromos ?? []).join(', ') || '—'}</dd>
            </div>
          </dl>
          {quote.notes ? (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium uppercase text-slate-500">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{quote.notes}</p>
            </div>
          ) : null}
        </div>
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-800">PDF preview</p>
          <p className="mt-2">
            Downloadable PDF generation can be wired to storage/comms when the
            backend endpoint is available.
          </p>
          <Input
            type="text"
            disabled
            value="Quote PDF — coming soon"
            className="mt-4 cursor-not-allowed bg-white text-center text-xs"
            readOnly
          />
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
