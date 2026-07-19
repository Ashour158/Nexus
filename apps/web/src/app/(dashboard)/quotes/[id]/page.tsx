'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent, type JSX } from 'react';
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
  useCreateDiscountRequest,
  useDiscountReasons,
  useDiscountRequests,
  useConvertQuoteToOrder,
  useQuoteDocuments,
  useQuoteESignEnvelopes,
  useQuoteRevisions,
  useQuoteTemplates,
  useRenderQuoteDocument,
  useSendQuoteForSignature,
  type Quote,
  type QuoteLine,
} from '@/hooks/use-quotes';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

export default function QuoteDetailPage(): JSX.Element {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const quoteId = params?.id ?? '';
  const [isHydrated, setIsHydrated] = useState(false);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const roles = useAuthStore((s) => s.roles);
  const canRead = hasPermission('quotes:read');
  const canManageQuotePackages =
    roles.some((role) => role.toLowerCase() === 'admin') ||
    hasPermission('quotes:templates') ||
    hasPermission('admin:*');
  const q = useQuote(quoteId);
  const sendQuote = useSendQuote();
  const voidQuote = useVoidQuote();
  const duplicateQuote = useDuplicateQuote();
  const createDiscountRequest = useCreateDiscountRequest();
  const convertQuoteToOrder = useConvertQuoteToOrder();
  const discountRequests = useDiscountRequests(quoteId);
  const discountReasons = useDiscountReasons();
  const revisions = useQuoteRevisions(quoteId);
  const templates = useQuoteTemplates({ enabled: canManageQuotePackages });
  const documents = useQuoteDocuments(quoteId);
  const envelopes = useQuoteESignEnvelopes(quoteId);
  const renderDocument = useRenderQuoteDocument();
  const sendSignature = useSendQuoteForSignature();
  const [voidReason, setVoidReason] = useState('');
  const [showVoid, setShowVoid] = useState(false);
  const [portalLink, setPortalLink] = useState('');
  const [requestedDiscountPercent, setRequestedDiscountPercent] = useState('12');
  const [discountReasonCode, setDiscountReasonCode] = useState('COMPETITIVE_MATCH');
  const [winningProbability, setWinningProbability] = useState('65');
  const [discountNotes, setDiscountNotes] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [documentFormat, setDocumentFormat] = useState<'HTML' | 'PDF' | 'DOCX'>('PDF');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return (
      <main className="px-6 py-6">
        <p className="text-sm text-on-surface-variant">Loading quote...</p>
      </main>
    );
  }

  if (!canRead) {
    return (
      <main className="px-6 py-6">
        <div className="rounded-xl border border-warning/30 bg-warning-container p-4 text-sm text-on-warning-container">
          You do not have permission to view quotes.
        </div>
      </main>
    );
  }

  async function downloadPdf(): Promise<void> {
    const base = process.env.NEXT_PUBLIC_DOCUMENT_URL ?? 'http://localhost:3016';
    const res = await fetch(`${base}/api/v1/documents/quotes/${quote.id}/pdf`);
    if (!res.ok) {
      notify.error('PDF download failed');
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
    notify.success('Portal link copied');
  }

  function onConvertToOrder() {
    if (!quote) return;
    convertQuoteToOrder.mutate(
      quote.id,
      {
        onSuccess: () => {
          notify.success('Converted to order');
          router.push(`/accounts/${quote.accountId}`);
        },
        onError: (err) => notify.error('Conversion failed', err.message),
      }
    );
  }

  if (q.isLoading) {
    return (
      <main className="px-6 py-6">
        <p className="text-sm text-on-surface-variant">Loading quote…</p>
      </main>
    );
  }

  if (q.isError || q.data === undefined) {
    return (
      <main className="px-6 py-6">
        <p className="text-sm text-error">
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
  const discountValue = Number(quote.discountAmount ?? quote.discountTotal ?? 0);
  const taxValue = Number(quote.taxAmount ?? quote.taxTotal ?? 0);
  const latestDocument = (documents.data ?? [])[0];
  const latestRevision = (revisions.data ?? [])[0];

  function onSend() {
    sendQuote.mutate(quote.id, {
      onSuccess: () => notify.success('Quote sent'),
      onError: (e) => notify.error('Send failed', e.message),
    });
  }

  function onVoid(e: FormEvent) {
    e.preventDefault();
    const reason = voidReason.trim() || 'Voided';
    voidQuote.mutate(
      { id: quote.id, reason },
      {
        onSuccess: () => {
          notify.success('Quote voided');
          setShowVoid(false);
          setVoidReason('');
        },
        onError: (err) => notify.error('Void failed', err.message),
      }
    );
  }

  function onSubmitDiscountRequest(e: FormEvent) {
    e.preventDefault();
    if (!latestRevision?.id) {
      notify.error('Discount request blocked', 'A current quote revision is required before requesting a discount.');
      return;
    }
    const notes = discountNotes.trim() || 'Discount approval requested from quote detail.';
    createDiscountRequest.mutate({
      quoteId: quote.id,
      quoteRevisionId: latestRevision.id,
      requestedDiscountPercent: Number(requestedDiscountPercent),
      reasonCode: discountReasonCode as never,
      reasonNotes: notes,
      winningProbabilityIfApproved: Number(winningProbability),
      businessImpact: notes,
      customFields: {},
    });
  }

  function onDuplicate() {
    duplicateQuote.mutate(quote.id, {
      onSuccess: (dup) => {
        notify.success('Duplicate created');
        router.push(`/quotes/${dup.id}`);
      },
      onError: (e) => notify.error('Duplicate failed', e.message),
    });
  }

  const canSend = quote.status === 'DRAFT' || quote.status === 'APPROVED';
  const canVoid =
    quote.status !== 'VOID' &&
    quote.status !== 'CONVERTED' &&
    quote.status !== 'ACCEPTED';
  const canConvert = quote.status === 'ACCEPTED' || quote.status === 'APPROVED';

  return (
    <main className="space-y-6 px-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-on-surface-variant">
            <Link href="/quotes" className="hover:text-on-surface">
              Quotes
            </Link>
            <span> / </span>
            <span className="font-mono text-xs">{quote.quoteNumber}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-on-surface">{quote.name}</h1>
          <p className="text-sm text-on-surface-variant">
            Status: <strong>{quote.status}</strong> · v{quote.version} ·{' '}
            {quote.currency}
          </p>
          <p className="mt-1 text-sm">
            <Link
              href={`/deals/${quote.dealId}`}
              className="text-primary hover:underline"
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
          {canConvert && (
            <Button
              type="button"
              variant="secondary"
              onClick={onConvertToOrder}
              disabled={convertQuoteToOrder.isPending}
            >
              {convertQuoteToOrder.isPending ? 'Converting...' : 'Convert to order'}
            </Button>
          )}
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
          className="max-w-md space-y-2 rounded-lg border border-error/30 bg-error-container/40 p-4"
        >
          <label className="block text-sm">
            <span className="text-xs font-medium text-on-error-container">Reason</span>
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
        <div className="rounded-lg border border-primary/40 bg-primary-container p-4 text-sm">
          <p className="font-medium text-on-primary-container">Portal link copied</p>
          <Input className="mt-2" readOnly value={portalLink} onFocus={(e) => e.currentTarget.select()} />
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Gross subtotal (before discount)" value={formatCurrency(subtotal, quote.currency)} />
        <Metric label="Line discounts" value={formatCurrency(discountValue, quote.currency)} />
        <Metric label="Tax on net" value={formatCurrency(taxValue, quote.currency)} />
        <Metric label="Total" value={formatCurrency(total, quote.currency)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-outline-variant bg-surface p-4">
          <h2 className="text-sm font-semibold text-on-surface">Quote package</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Seller view keeps package artifacts read-only; template governance stays with admin quote settings.
          </p>
          {canManageQuotePackages ? (
            <div className="mt-3 grid gap-3">
              <label className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                Template
                <select
                  className="mt-1 h-9 w-full rounded-md border border-outline-variant bg-surface px-3 text-sm normal-case text-on-surface"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="">Default active template</option>
                  {(templates.data ?? []).map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} v{template.version} {template.isDefault ? '(default)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                Export format
                <select
                  className="mt-1 h-9 w-full rounded-md border border-outline-variant bg-surface px-3 text-sm normal-case text-on-surface"
                  value={documentFormat}
                  onChange={(e) => setDocumentFormat(e.target.value as 'HTML' | 'PDF' | 'DOCX')}
                >
                  <option value="PDF">PDF</option>
                  <option value="DOCX">DOCX</option>
                  <option value="HTML">HTML</option>
                </select>
              </label>
              <Button
                type="button"
                onClick={() => renderDocument.mutate({ quoteId: quote.id, templateId: templateId || undefined, format: documentFormat })}
                isLoading={renderDocument.isPending}
              >
                Render package
              </Button>
            </div>
          ) : (
            <dl className="mt-3 space-y-2 text-sm text-on-surface-variant">
              <div className="flex justify-between gap-2">
                <dt>Latest package</dt>
                <dd className="text-right">{latestDocument?.fileName ?? 'No package rendered'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Format</dt>
                <dd>{latestDocument?.format ?? '-'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Template policy</dt>
                <dd className="text-right">Managed by admin settings</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="rounded-lg border border-outline-variant bg-surface p-4">
          <h2 className="text-sm font-semibold text-on-surface">E-sign lifecycle</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Send the latest rendered quote document for signature and track the envelope state.
          </p>
          <div className="mt-3 grid gap-3">
            <Input placeholder="Signer name" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            <Input placeholder="Signer email" type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
            <Button
              type="button"
              variant="secondary"
              disabled={!signerName.trim() || !signerEmail.trim() || !['SENT', 'VIEWED', 'ACCEPTED'].includes(quote.status)}
              isLoading={sendSignature.isPending}
              onClick={() =>
                sendSignature.mutate({
                  quoteId: quote.id,
                  documentId: latestDocument?.id,
                  recipientName: signerName,
                  recipientEmail: signerEmail,
                  expiresAt: quote.expiresAt ?? quote.validUntil ?? undefined,
                })
              }
            >
              Send for signature
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-outline-variant bg-surface p-4">
          <h2 className="text-sm font-semibold text-on-surface">Governance state</h2>
          <dl className="mt-3 space-y-2 text-sm text-on-surface-variant">
            <div className="flex justify-between gap-2">
              <dt>Expiry date</dt>
              <dd>{formatDate(quote.expiresAt ?? quote.validUntil)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Revisions</dt>
              <dd>{revisions.data?.length ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Documents</dt>
              <dd>{documents.data?.length ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>E-sign envelopes</dt>
              <dd>{envelopes.data?.length ?? 0}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-outline-variant bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-on-surface">Discount requests</h2>
              <p className="text-xs text-on-surface-variant">
                DRQ workflow captures reason, requested discount, probability uplift, and approval state.
              </p>
            </div>
            <span className="rounded-full bg-warning-container px-2 py-1 text-xs font-semibold text-warning">
              {quote.approvalStatus ?? 'NOT_SUBMITTED'}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {(discountRequests.data?.data ?? []).map((request) => (
              <div key={request.id} className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-on-surface">{request.reasonLabel}</p>
                    <p className="text-xs text-on-surface-variant">
                      {request.requestedDiscountPercent}% requested · win probability {request.winningProbabilityIfApproved}%
                    </p>
                  </div>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-on-surface">
                    {request.status}
                  </span>
                </div>
                {request.reasonNotes ? (
                  <p className="mt-2 text-xs text-on-surface-variant">{request.reasonNotes}</p>
                ) : null}
                <p className="mt-2 text-xs text-on-surface-variant">
                  Approval ref: {request.approvalRequestId ?? 'Pending workflow assignment'}
                </p>
              </div>
            ))}
            {!discountRequests.isLoading && (discountRequests.data?.data ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-sm text-on-surface-variant">
                No discount request submitted for this quote.
              </p>
            ) : null}
          </div>
        </div>

        <form onSubmit={onSubmitDiscountRequest} className="rounded-lg border border-outline-variant bg-surface p-4">
          <h2 className="text-sm font-semibold text-on-surface">Create DRQ</h2>
          <div className="mt-2 rounded-md border border-outline-variant bg-surface-container-low p-3 text-xs text-on-surface-variant">
            {latestRevision?.id ? (
              <p>
                DRQ applies to current quote revision v{latestRevision.version} ({latestRevision.id}).
              </p>
            ) : (
              <p className="text-warning">
                Current quote revision is missing; discount submission is blocked until a revision exists.
              </p>
            )}
          </div>
          <div className="mt-3 grid gap-3">
            <label className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
              Discount %
              <Input
                className="mt-1"
                type="number"
                min="0.01"
                max="80"
                step="0.01"
                value={requestedDiscountPercent}
                onChange={(e) => setRequestedDiscountPercent(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
              Prevalidated reason
              <select
                className="mt-1 h-9 w-full rounded-md border border-outline-variant bg-surface px-3 text-sm normal-case text-on-surface"
                value={discountReasonCode}
                onChange={(e) => setDiscountReasonCode(e.target.value)}
              >
                {(discountReasons.data ?? []).map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
              Winning probability if approved
              <Input
                className="mt-1"
                type="number"
                min="0"
                max="100"
                value={winningProbability}
                onChange={(e) => setWinningProbability(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
              Business reason
              <Textarea
                className="mt-1"
                rows={3}
                value={discountNotes}
                onChange={(e) => setDiscountNotes(e.target.value)}
                placeholder="Why this discount improves the win path..."
              />
            </label>
            <Button
              type="submit"
              disabled={createDiscountRequest.isPending || !['DRAFT', 'PENDING_APPROVAL'].includes(quote.status)}
              isLoading={createDiscountRequest.isPending}
            >
              Submit DRQ
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-outline-variant bg-surface">
        <div className="border-b border-outline-variant px-4 py-3">
          <h2 className="text-sm font-semibold text-on-surface">Line items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-start text-xs uppercase text-on-surface-variant">
              <tr>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2 text-end">Qty</th>
                <th className="px-4 py-2 text-end">List price</th>
                <th className="px-4 py-2 text-end">Line discount</th>
                <th className="px-4 py-2 text-end">Net unit price</th>
                <th className="px-4 py-2 text-end">Net line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {lines.map((line, idx) => {
                const pricing = quoteLinePricing(line);
                return (
                <tr key={line.id ?? `${line.productId}-${idx}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-on-surface">
                      {line.productName ?? line.productId.slice(0, 8)}
                    </div>
                    {line.description ? (
                      <p className="text-xs text-on-surface-variant">{line.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">{line.quantity}</td>
                  <td className="px-4 py-2 text-end font-mono text-xs">
                    {formatCurrency(pricing.listPrice, quote.currency)}
                  </td>
                  <td className="px-4 py-2 text-end font-mono text-xs">
                    {formatCurrency(pricing.lineDiscount, quote.currency)}
                    <span className="ml-1 text-on-surface-variant">({pricing.discountPct}%)</span>
                  </td>
                  <td className="px-4 py-2 text-end font-mono text-xs">
                    {formatCurrency(pricing.netUnitPrice, quote.currency)}
                  </td>
                  <td className="px-4 py-2 text-end font-mono text-xs">
                    {formatCurrency(pricing.netLineTotal, quote.currency)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {lines.length === 0 ? (
            <p className="p-6 text-center text-sm text-on-surface-variant">No line items.</p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-outline-variant bg-surface p-4">
          <h2 className="text-sm font-semibold text-on-surface">Immutable revisions</h2>
          <div className="mt-3 space-y-2">
            {(revisions.data ?? []).map((revision) => (
              <div key={revision.id} className="rounded-md border border-outline-variant bg-surface-container-low p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>v{revision.version}</strong>
                  <span className="text-xs text-on-surface-variant">{formatDate(revision.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant">{revision.reason} - {revision.status}</p>
              </div>
            ))}
            {!revisions.isLoading && (revisions.data ?? []).length === 0 ? (
              <p className="text-sm text-on-surface-variant">No revision snapshots yet.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-outline-variant bg-surface p-4">
          <h2 className="text-sm font-semibold text-on-surface">Rendered documents</h2>
          <div className="mt-3 space-y-2">
            {(documents.data ?? []).map((document) => (
              <div key={document.id} className="rounded-md border border-outline-variant bg-surface-container-low p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{document.fileName}</strong>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-on-surface">{document.format}</span>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {document.status} - {formatDate(document.createdAt)}
                  {document.contentSize ? ` - ${Math.ceil(document.contentSize / 1024)} KB` : ''}
                </p>
                {document.checksum ? (
                  <p className="mt-1 truncate font-mono text-[11px] text-on-surface-variant">SHA-256 {document.checksum}</p>
                ) : null}
                <a
                  className="mt-2 inline-flex h-8 items-center rounded-md border border-outline-variant bg-surface px-3 text-xs font-semibold text-primary hover:bg-primary-container"
                  href={`/api/quote-documents/${document.id}/download`}
                >
                  Download package
                </a>
              </div>
            ))}
            {!documents.isLoading && (documents.data ?? []).length === 0 ? (
              <p className="text-sm text-on-surface-variant">No rendered documents yet.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-outline-variant bg-surface p-4">
          <h2 className="text-sm font-semibold text-on-surface">Signature envelopes</h2>
          <div className="mt-3 space-y-2">
            {(envelopes.data ?? []).map((envelope) => (
              <div key={envelope.id} className="rounded-md border border-outline-variant bg-surface-container-low p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{envelope.recipientName}</strong>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-on-surface">{envelope.status}</span>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant">{envelope.recipientEmail}</p>
              </div>
            ))}
            {!envelopes.isLoading && (envelopes.data ?? []).length === 0 ? (
              <p className="text-sm text-on-surface-variant">No signature envelope yet.</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-outline-variant bg-surface p-4 text-sm">
          <h2 className="font-semibold text-on-surface">Terms & dates</h2>
          <dl className="mt-3 space-y-2 text-on-surface-variant">
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
            <div className="mt-4 border-t border-outline-variant pt-3">
              <p className="text-xs font-medium uppercase text-on-surface-variant">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-on-surface">{quote.notes}</p>
            </div>
          ) : null}
        </div>
        <div className="rounded-lg border border-outline-variant bg-surface p-4 text-sm">
          <h2 className="font-semibold text-on-surface">Document controls</h2>
          <p className="mt-2 text-on-surface-variant">
            Quote packages are generated from governed templates, stored with
            content size and checksum, and downloaded from the quote document
            endpoint for audit-ready traceability.
          </p>
          <dl className="mt-4 space-y-2 text-on-surface-variant">
            <div className="flex justify-between gap-2">
              <dt>Latest document</dt>
              <dd className="text-right">{latestDocument?.fileName ?? 'None rendered'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Latest format</dt>
              <dd>{latestDocument?.format ?? '-'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Integrity</dt>
              <dd>{latestDocument?.checksum ? 'Checksum captured' : 'Pending render'}</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-on-surface">{value}</p>
    </div>
  );
}

function quoteLinePricing(line: QuoteLine) {
  const quantity = finiteAmount(line.quantity);
  const netUnitPrice = finiteAmount(line.unitPrice);
  const discountPct = Math.min(100, Math.max(0, finiteAmount(line.discountPercent)));
  const explicitList = Number(line.listPrice);
  const listPrice = Number.isFinite(explicitList)
    ? explicitList
    : discountPct < 100
      ? netUnitPrice / (1 - discountPct / 100)
      : netUnitPrice;
  const explicitDiscount = Number(line.discountAmount);
  const lineDiscount = Number.isFinite(explicitDiscount)
    ? explicitDiscount * quantity
    : Math.max(0, listPrice - netUnitPrice) * quantity;
  const explicitTotal = Number(line.total);
  return {
    listPrice,
    lineDiscount,
    netUnitPrice,
    netLineTotal: Number.isFinite(explicitTotal) ? explicitTotal : netUnitPrice * quantity,
    discountPct,
  };
}

function finiteAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}
