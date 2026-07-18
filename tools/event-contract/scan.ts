/**
 * Static event-flow scanner for the Nexus event backbone.
 *
 * Reads (never executes) every `services/​*​/src/**​/*.ts` file and extracts:
 *   - PUBLISHED domain-event type string literals (producer side)
 *   - SUBSCRIBED domain-event type string literals (consumer side)
 *
 * It is deliberately regex/string based — it must run in CI without a Kafka
 * broker, a database, or any service boot. See HEURISTIC LIMITS below for the
 * shapes it cannot see; those are covered by the explicit allow-lists in
 * `event-contract.test.ts`.
 *
 * ─── Publish shapes handled ────────────────────────────────────────────────
 *   1. Inline object literal:
 *          producer.publish(TOPICS.X, { type: 'deal.won', ... })
 *   2. Ternary / computed `type:` value:
 *          .publish(TOPICS.LEADS, { type: cond ? 'lead.qualified' : 'lead.unqualified' })
 *   3. `eventType:` property (outbox call sites):
 *          outbox.publish(prisma, TOPICS.Q, payload, { eventType: 'quote.created' })
 *   4. Positional string literal to an emit-helper:
 *          emit(tenantId, 'ticket.created', {...})
 *          emitSignal(tenantId, 'automation.rate_cap.tripped', {...})
 *          publish(TOPICS.ANALYTICS, 'campaign.created', tenantId, {...})   // local helper
 *
 * ─── Subscribe shape handled ───────────────────────────────────────────────
 *          consumer.on('deal.created', handler)      // any *Consumer.on('literal')
 *
 * ─── HEURISTIC LIMITS (intentionally not resolved — allow-list instead) ────
 *   L1. Dynamic outbox CRUD mirror: `getEventType()` returns `${model}.created`
 *       template literals (services/​*​/src/prisma.ts). The concrete
 *       `<model>.created|updated|deleted` names are not statically knowable, so
 *       events published ONLY this way are invisible to the scanner and are
 *       listed in KNOWN_EXTERNAL_PUBLISHERS.
 *   L2. Shorthand from a pre-computed variable:
 *          const type = inbound ? 'email.received' : 'email.sent';
 *          producer.publish(TOPICS.EMAILS, { type, ... });
 *       The literal is not adjacent to the publish call → invisible. Allow-listed.
 *   L3. Consumers registered in a loop over an array of literals
 *          for (const t of ['email.opened', ...]) consumer.on(t, ...)
 *       use a loop variable, not a literal, and are invisible as consumers.
 *   L4. Topic-level raw consumers (audit-consumer uses kafkajs `eachMessage`
 *       on a whole topic, not `consumer.on(type)`) consume every type on the
 *       topic; such sink-only events are listed in KNOWN_FIRE_AND_FORGET.
 *
 * These limits bias toward MISSING an edge (a false pass) rather than inventing
 * an edge (a false CI failure), per the guardrail's low-false-positive mandate.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * An event type name: a dotted namespace like `deal.stage_changed` or
 * `approval.request.approved`. Segments may contain underscores, but at least one
 * `.` is REQUIRED. Requiring the dot excludes socket-channel names such as
 * `rate_limited` / `subscribe_error` (underscore only, no dot).
 */
const EVENT_NAME = /^[a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/;
/** Matches an event-name string literal (single or double quoted). */
const EVENT_LITERAL_G = /(['"])([a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)\1/g;
/** Kafka topic names (all start with `nexus.`) are never event types — filter them out. */
const TOPIC_LITERAL = /^nexus\./;

/** Callee identifiers we treat as event emitters (see publish shape #4). */
// The char before the callee may be `.` (method call, e.g. `producer.publish(`) or any
// non-identifier char, but must NOT be an identifier char (so `republish(` is not matched).
const EMITTER_CALLEE =
  /(?:^|[^A-Za-z0-9_$])(?:publish|publishBatch|publishEvent|emit|emitEvent|emitSignal|emitQuoteEvent|emitAcceptanceHandoff|dispatchEvent)\s*\(/g;

/** Matches `xConsumer.on('event.type'` / `consumer.on("event.type"`. */
const CONSUMER_ON_G =
  /[A-Za-z0-9_$]*[Cc]onsumer\.on\(\s*(['"])([^'"]+)\1/g;

export interface Occurrence {
  event: string;
  file: string; // repo-relative, forward-slashed
}

export interface ScanResult {
  publishers: Occurrence[];
  consumers: Occurrence[];
  publishedTypes: Set<string>;
  consumedTypes: Set<string>;
  /** event -> sorted unique service names that publish it */
  publisherServices: Map<string, string[]>;
  /** event -> sorted unique service names that consume it */
  consumerServices: Map<string, string[]>;
}

/** Walk up from a start dir until we find the repo root (the dir containing `services/`). */
export function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    try {
      if (statSync(join(dir, 'services')).isDirectory()) return dir;
    } catch {
      /* keep walking */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`event-contract: could not locate repo root (a dir containing services/) from ${start}`);
}

/** Recursively collect `*.ts` files under `dir`, skipping tests, dist, and node_modules. */
function collectTsFiles(dir: string, out: string[] = []): string[] {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') continue;
      collectTsFiles(full, out);
    } else if (
      e.isFile() &&
      e.name.endsWith('.ts') &&
      !e.name.endsWith('.d.ts') &&
      !e.name.endsWith('.test.ts') &&
      !e.name.endsWith('.spec.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Strip `//` line comments and `/* *​/` block comments (string-literals are not comment-aware,
 *  which is acceptable here: event names never contain `//` or comment delimiters). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

/** Return the argument-list substring of a call, given the index of its opening `(`. */
function balancedArgs(src: string, openParen: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openParen; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return src.slice(openParen + 1, i);
    }
  }
  return src.slice(openParen + 1, Math.min(src.length, openParen + 1200));
}

/** Extract the portion of an arg-list before the first top-level `{` (the positional args). */
function positionalPrefix(args: string): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (quote) {
      if (c === quote && args[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === '{' && depth === 0) return args.slice(0, i);
  }
  return args;
}

/** Slice a `type:`/`eventType:` property value from `text` starting just after the colon,
 *  up to the next top-level comma or closing brace (so ternaries are captured whole). */
function propValueSlice(text: string, valStart: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = valStart; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') {
      if (depth === 0) return text.slice(valStart, i);
      depth--;
    } else if (c === ',' && depth === 0) return text.slice(valStart, i);
  }
  return text.slice(valStart);
}

function eventLiterals(text: string): string[] {
  const found: string[] = [];
  EVENT_LITERAL_G.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EVENT_LITERAL_G.exec(text))) {
    if (!TOPIC_LITERAL.test(m[2])) found.push(m[2]);
  }
  return found;
}

/** Extract published event types from one file's (comment-stripped) source. */
export function extractPublished(src: string): string[] {
  const out = new Set<string>();
  EMITTER_CALLEE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMITTER_CALLEE.exec(src))) {
    const openParen = src.indexOf('(', m.index + m[0].length - 1);
    if (openParen < 0) continue;
    const args = balancedArgs(src, openParen);

    // (a) positional string literals before the first object literal
    for (const ev of eventLiterals(positionalPrefix(args))) out.add(ev);

    // (b) `type:` / `eventType:` property value slices (handles ternary/computed)
    const propRe = /\b(?:type|eventType)\s*:/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRe.exec(args))) {
      const valStart = pm.index + pm[0].length;
      for (const ev of eventLiterals(propValueSlice(args, valStart))) out.add(ev);
    }
  }

  // ── Pass 2: envelope-fingerprint ──────────────────────────────────────────
  // Catches publishes wrapped in a service-local emit helper we don't recognize
  // by name (e.g. finance-service's `emitCommercialEvent(ctx, { type: '...' })`).
  // An object literal is treated as a published event envelope when it has a
  // `type:` (or `eventType:`) event-name value AND a sibling `payload` /
  // `aggregateId` / `aggregateType` key nearby — the NexusKafkaEvent shape.
  // The sibling requirement excludes look-alikes such as notification POST
  // bodies (`{ userId, type: 'blueprint.stage', title, body }`) which have no
  // payload/aggregate key.
  const typeRe = /\b(?:type|eventType)\s*:/g;
  let tm: RegExpExecArray | null;
  while ((tm = typeRe.exec(src))) {
    const evs = eventLiterals(propValueSlice(src, tm.index + tm[0].length));
    if (evs.length === 0) continue;
    const window = src.slice(Math.max(0, tm.index - 300), Math.min(src.length, tm.index + 600));
    if (/\b(?:payload|aggregateId|aggregateType)\s*:/.test(window)) {
      for (const ev of evs) out.add(ev);
    }
  }
  return [...out];
}

/** Extract subscribed event types from one file's (comment-stripped) source. */
export function extractConsumed(src: string): string[] {
  const out = new Set<string>();
  CONSUMER_ON_G.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONSUMER_ON_G.exec(src))) {
    if (EVENT_NAME.test(m[2])) out.add(m[2]);
  }
  return [...out];
}

/** Derive the owning service name from a repo-relative path like `services/foo/src/...`. */
function serviceOf(relPath: string): string {
  const parts = relPath.split('/');
  const i = parts.indexOf('services');
  return i >= 0 && parts[i + 1] ? parts[i + 1] : parts[0];
}

/** Scan the whole repo (or a provided services dir) and return the full flow graph. */
export function scanRepo(repoRoot?: string): ScanResult {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = repoRoot ?? findRepoRoot(here);
  const servicesDir = join(root, 'services');
  const files = collectTsFiles(servicesDir);

  const publishers: Occurrence[] = [];
  const consumers: Occurrence[] = [];
  const publisherServices = new Map<string, Set<string>>();
  const consumerServices = new Map<string, Set<string>>();

  for (const file of files) {
    const rel = relative(root, file).split(sep).join('/');
    const svc = serviceOf(rel);
    const src = stripComments(readFileSync(file, 'utf8'));

    for (const ev of extractPublished(src)) {
      publishers.push({ event: ev, file: rel });
      (publisherServices.get(ev) ?? publisherServices.set(ev, new Set()).get(ev)!).add(svc);
    }
    for (const ev of extractConsumed(src)) {
      consumers.push({ event: ev, file: rel });
      (consumerServices.get(ev) ?? consumerServices.set(ev, new Set()).get(ev)!).add(svc);
    }
  }

  const toSortedMap = (m: Map<string, Set<string>>): Map<string, string[]> =>
    new Map([...m].map(([k, v]) => [k, [...v].sort()]));

  return {
    publishers,
    consumers,
    publishedTypes: new Set(publisherServices.keys()),
    consumedTypes: new Set(consumerServices.keys()),
    publisherServices: toSortedMap(publisherServices),
    consumerServices: toSortedMap(consumerServices),
  };
}

export { EVENT_NAME };
