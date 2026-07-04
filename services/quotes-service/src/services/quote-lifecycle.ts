import type { QuoteStatus } from '../../../../node_modules/.prisma/quotes-client/index.js';

/**
 * Quote lifecycle state machine (additive, guarded).
 *
 * quotes-service is legacy/read-authoritative (mutations moved to
 * finance-service), but this local Quote table still boots and serves reads.
 * This module encodes the *sales-facing* customer lifecycle so that the local
 * lifecycle transition endpoints and the expiry poller share one canonical
 * transition matrix, one timestamp-stamping rule, and one event-payload shape.
 *
 * The matrix is deliberately conservative: it only allows the customer-facing
 * arcs (draft → sent → accepted / rejected / expired / revised). Internal CPQ
 * arcs (approval, conversion) remain finance-service authority and are not
 * modelled here.
 */

export type QuoteTransition =
  | 'send'
  | 'view'
  | 'accept'
  | 'reject'
  | 'expire'
  | 'revise';

/**
 * Allowed source statuses for each transition and the resulting status.
 * A transition is legal iff the quote's current status is in `from`.
 */
interface TransitionSpec {
  from: QuoteStatus[];
  to: QuoteStatus;
}

export const TRANSITIONS: Record<QuoteTransition, TransitionSpec> = {
  // A quote can be sent once it is drafted or approved (post-approval send).
  send: { from: ['DRAFT', 'APPROVED'], to: 'SENT' },
  // Customer opened the quote. Idempotent-ish: only meaningful from SENT.
  view: { from: ['SENT'], to: 'VIEWED' },
  // Customer accepts — from an in-flight (sent/viewed) quote.
  accept: { from: ['SENT', 'VIEWED'], to: 'ACCEPTED' },
  // Customer rejects — from an in-flight (sent/viewed) quote.
  reject: { from: ['SENT', 'VIEWED'], to: 'REJECTED' },
  // Validity window elapsed — only in-flight quotes can expire.
  expire: { from: ['SENT', 'VIEWED'], to: 'EXPIRED' },
  // Author revises a quote that hasn't been accepted; returns to DRAFT for edit.
  revise: { from: ['SENT', 'VIEWED', 'REJECTED', 'EXPIRED'], to: 'DRAFT' },
};

/** Terminal statuses that can never transition further via this machine. */
export const TERMINAL_STATUSES: readonly QuoteStatus[] = ['ACCEPTED', 'CONVERTED'];

export interface TransitionResult {
  ok: boolean;
  /** Present when ok === true. */
  to?: QuoteStatus;
  /** Present when ok === false. */
  reason?: string;
}

/**
 * Guarded evaluation of a transition. Never throws.
 * Returns the target status when legal, or a human-readable reason when not.
 */
export function evaluateTransition(
  current: QuoteStatus,
  transition: QuoteTransition
): TransitionResult {
  const spec = TRANSITIONS[transition];
  if (!spec) {
    return { ok: false, reason: `Unknown transition "${transition}"` };
  }
  if (!spec.from.includes(current)) {
    return {
      ok: false,
      reason: `Illegal transition "${transition}" from status ${current}; allowed from ${spec.from.join(', ')}`,
    };
  }
  return { ok: true, to: spec.to };
}

/** The timestamp column a transition stamps, if any. */
export function timestampFieldFor(transition: QuoteTransition): string | null {
  switch (transition) {
    case 'send':
      return 'sentAt';
    case 'view':
      return 'viewedAt';
    case 'accept':
      return 'acceptedAt';
    case 'reject':
      return 'rejectedAt';
    case 'expire':
      return 'expiredAt';
    default:
      return null;
  }
}

/** Maps a transition to the canonical outbound event type (matches finance/consumers). */
export function eventTypeFor(transition: QuoteTransition): string {
  switch (transition) {
    case 'send':
      return 'quote.sent';
    case 'view':
      return 'quote.viewed';
    case 'accept':
      return 'quote.accepted';
    case 'reject':
      return 'quote.rejected';
    case 'expire':
      return 'quote.expired';
    case 'revise':
      return 'quote.revision_created';
    default:
      return 'quote.updated';
  }
}

/**
 * Builds the canonical event payload consumed by analytics-service,
 * crm-service finance-timeline, deals-service quote-projections, and
 * finance/billing acceptance handoff. Keyed fields match those consumers
 * (`quoteId`, `dealId`, `ownerId`, `status`, `total`, `currency`).
 */
export function buildEventPayload(quote: {
  id: string;
  dealId: string;
  ownerId: string;
  quoteNumber: string;
  status: QuoteStatus;
  currency: string;
  total: unknown;
  validUntil?: Date | null;
  acceptedAt?: Date | null;
}): Record<string, unknown> {
  return {
    quoteId: quote.id,
    dealId: quote.dealId,
    ownerId: quote.ownerId,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    currency: quote.currency,
    total: quote.total != null ? Number(quote.total as any) : 0,
    totalAmount: quote.total != null ? Number(quote.total as any) : 0,
    validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
    acceptedAt: quote.acceptedAt ? quote.acceptedAt.toISOString() : null,
    source: 'quotes-service',
  };
}
