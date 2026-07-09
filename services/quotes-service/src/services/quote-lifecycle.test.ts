import { describe, it, expect } from 'vitest';
import {
  evaluateTransition,
  timestampFieldFor,
  eventTypeFor,
  buildEventPayload,
} from './quote-lifecycle.js';

describe('quote lifecycle state machine', () => {
  it('allows draft → sent', () => {
    const r = evaluateTransition('DRAFT', 'send');
    expect(r.ok).toBe(true);
    expect(r.to).toBe('SENT');
  });

  it('allows sent → accepted / rejected / expired', () => {
    expect(evaluateTransition('SENT', 'accept').to).toBe('ACCEPTED');
    expect(evaluateTransition('SENT', 'reject').to).toBe('REJECTED');
    expect(evaluateTransition('SENT', 'expire').to).toBe('EXPIRED');
  });

  it('allows viewed → accepted', () => {
    expect(evaluateTransition('VIEWED', 'accept').to).toBe('ACCEPTED');
  });

  it('rejects illegal transition draft → accept', () => {
    const r = evaluateTransition('DRAFT', 'accept');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Illegal transition');
  });

  it('rejects transition out of terminal ACCEPTED', () => {
    expect(evaluateTransition('ACCEPTED', 'send').ok).toBe(false);
    expect(evaluateTransition('ACCEPTED', 'reject').ok).toBe(false);
    expect(evaluateTransition('ACCEPTED', 'expire').ok).toBe(false);
  });

  it('rejects expiring a draft (only in-flight quotes expire)', () => {
    expect(evaluateTransition('DRAFT', 'expire').ok).toBe(false);
  });

  it('allows revise from sent / rejected / expired back to draft', () => {
    expect(evaluateTransition('SENT', 'revise').to).toBe('DRAFT');
    expect(evaluateTransition('REJECTED', 'revise').to).toBe('DRAFT');
    expect(evaluateTransition('EXPIRED', 'revise').to).toBe('DRAFT');
  });

  it('maps transitions to timestamp fields', () => {
    expect(timestampFieldFor('send')).toBe('sentAt');
    expect(timestampFieldFor('accept')).toBe('acceptedAt');
    expect(timestampFieldFor('reject')).toBe('rejectedAt');
    expect(timestampFieldFor('expire')).toBe('expiredAt');
    expect(timestampFieldFor('revise')).toBeNull();
  });

  it('maps transitions to canonical event types', () => {
    expect(eventTypeFor('send')).toBe('quote.sent');
    expect(eventTypeFor('accept')).toBe('quote.accepted');
    expect(eventTypeFor('reject')).toBe('quote.rejected');
    expect(eventTypeFor('expire')).toBe('quote.expired');
  });

  it('builds a consumer-shaped event payload', () => {
    const payload = buildEventPayload({
      id: 'q1',
      dealId: 'd1',
      ownerId: 'o1',
      quoteNumber: 'Q-001',
      status: 'ACCEPTED',
      currency: 'USD',
      total: '1234.50',
      validUntil: null,
      acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(payload.quoteId).toBe('q1');
    expect(payload.dealId).toBe('d1');
    expect(payload.status).toBe('ACCEPTED');
    expect(payload.total).toBe(1234.5);
    expect(payload.source).toBe('quotes-service');
  });
});
