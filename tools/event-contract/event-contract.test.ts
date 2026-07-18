/**
 * EVENT CONTRACT GUARDRAIL
 *
 * Statically scans `services/​*​/src/**` for published and subscribed domain-event
 * type string literals (see scan.ts — no services or Kafka are booted) and asserts
 * the two halves of the event backbone stay wired:
 *
 *   1. Every PUBLISHED event type has at least one consumer, OR is explicitly
 *      listed in KNOWN_FIRE_AND_FORGET.
 *   2. Every SUBSCRIBED event type has at least one publisher, OR is explicitly
 *      listed in KNOWN_EXTERNAL_PUBLISHERS.
 *
 * A NEW dead event (published, nobody consumes) or orphan subscription
 * (subscribed, nobody publishes) fails this test until the author wires the
 * other side or consciously allow-lists it (with a reason) in allowlist.ts.
 *
 * The allow-lists are also asserted to be free of stale entries, so an exception
 * cannot silently outlive the code it was covering.
 */
import { describe, expect, it } from 'vitest';
import { scanRepo } from './scan.js';
import { KNOWN_FIRE_AND_FORGET, KNOWN_EXTERNAL_PUBLISHERS } from './allowlist.js';

const scan = scanRepo();

function fmt(event: string, files: string[]): string {
  return `\n    - "${event}"  (${files.slice(0, 4).join(', ')}${files.length > 4 ? ', …' : ''})`;
}

describe('event contract: publishers ↔ consumers', () => {
  it('scanned a plausible number of events (guards against a broken scanner)', () => {
    // If the scanner silently stops matching, every assertion below passes
    // vacuously. Pin a floor so a regression in scan.ts is itself caught.
    expect(scan.publishedTypes.size).toBeGreaterThan(100);
    expect(scan.consumedTypes.size).toBeGreaterThan(60);
  });

  it('every PUBLISHED event has a consumer or is KNOWN_FIRE_AND_FORGET', () => {
    const dead = [...scan.publishedTypes]
      .filter((e) => !scan.consumedTypes.has(e))
      .filter((e) => !(e in KNOWN_FIRE_AND_FORGET))
      .sort();

    const message =
      dead.length === 0
        ? ''
        : `Found ${dead.length} DEAD event(s) — published but no consumer.on(...) handler and not allow-listed.\n` +
          `Fix: add a consumer, or add to KNOWN_FIRE_AND_FORGET in tools/event-contract/allowlist.ts with a reason.\n` +
          dead.map((e) => fmt(e, [...new Set(scan.publishers.filter((p) => p.event === e).map((p) => p.file))])).join('');

    expect(dead, message).toEqual([]);
  });

  it('every SUBSCRIBED event has a publisher or is KNOWN_EXTERNAL_PUBLISHERS', () => {
    const orphan = [...scan.consumedTypes]
      .filter((e) => !scan.publishedTypes.has(e))
      .filter((e) => !(e in KNOWN_EXTERNAL_PUBLISHERS))
      .sort();

    const message =
      orphan.length === 0
        ? ''
        : `Found ${orphan.length} ORPHAN subscription(s) — subscribed but nobody publishes and not allow-listed.\n` +
          `Fix: publish the event, correct the name, or add to KNOWN_EXTERNAL_PUBLISHERS in tools/event-contract/allowlist.ts with a reason.\n` +
          orphan.map((e) => fmt(e, [...new Set(scan.consumers.filter((c) => c.event === e).map((c) => c.file))])).join('');

    expect(orphan, message).toEqual([]);
  });
});

describe('event contract: allow-lists stay honest', () => {
  it('no KNOWN_FIRE_AND_FORGET entry is stale (event now has a consumer, or is no longer published)', () => {
    const stale = Object.keys(KNOWN_FIRE_AND_FORGET)
      .filter((e) => scan.consumedTypes.has(e) || !scan.publishedTypes.has(e))
      .sort();
    expect(
      stale,
      `These KNOWN_FIRE_AND_FORGET entries are stale — the event is now consumed, or is no longer published. ` +
        `Remove them from tools/event-contract/allowlist.ts:\n  ${stale.join('\n  ')}`
    ).toEqual([]);
  });

  it('no KNOWN_EXTERNAL_PUBLISHERS entry is stale (event now has an in-repo publisher, or is no longer subscribed)', () => {
    const stale = Object.keys(KNOWN_EXTERNAL_PUBLISHERS)
      .filter((e) => scan.publishedTypes.has(e) || !scan.consumedTypes.has(e))
      .sort();
    expect(
      stale,
      `These KNOWN_EXTERNAL_PUBLISHERS entries are stale — the event now has an in-repo publisher, or is no longer subscribed. ` +
        `Remove them from tools/event-contract/allowlist.ts:\n  ${stale.join('\n  ')}`
    ).toEqual([]);
  });
});
