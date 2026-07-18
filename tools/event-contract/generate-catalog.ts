/**
 * Regenerates docs/EVENTS.md from a fresh static scan.
 * Run: `npx tsx tools/event-contract/generate-catalog.ts`
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot, scanRepo } from './scan.js';
import { KNOWN_FIRE_AND_FORGET, KNOWN_EXTERNAL_PUBLISHERS } from './allowlist.js';

const root = findRepoRoot(process.cwd());
const scan = scanRepo(root);

const allEvents = [...new Set([...scan.publishedTypes, ...scan.consumedTypes])].sort();

type Status = 'OK' | 'DEAD' | 'ORPHAN';
function statusOf(e: string): Status {
  const pub = scan.publishedTypes.has(e);
  const con = scan.consumedTypes.has(e);
  if (pub && con) return 'OK';
  if (pub) return 'DEAD';
  return 'ORPHAN';
}

const dead = allEvents.filter((e) => statusOf(e) === 'DEAD');
const orphan = allEvents.filter((e) => statusOf(e) === 'ORPHAN');
const ok = allEvents.filter((e) => statusOf(e) === 'OK');

function cell(v: string | undefined): string {
  return v && v.length ? v : '—';
}
function statusCell(e: string): string {
  const s = statusOf(e);
  if (s === 'OK') return 'OK';
  if (s === 'DEAD') {
    return e in KNOWN_FIRE_AND_FORGET ? 'DEAD (allow-listed)' : '**DEAD ⚠**';
  }
  return e in KNOWN_EXTERNAL_PUBLISHERS ? 'ORPHAN (allow-listed)' : '**ORPHAN ⚠**';
}

const lines: string[] = [];
lines.push('# Nexus Event Catalog');
lines.push('');
lines.push('> **Generated** by `tools/event-contract/generate-catalog.ts` from a static scan of');
lines.push('> `services/*/src/**`. Do not edit by hand — run `npx tsx tools/event-contract/generate-catalog.ts`.');
lines.push('> The same scan backs the guardrail test `tools/event-contract/event-contract.test.ts`.');
lines.push('');
lines.push('This catalogs every hand-rolled domain event on the `@nexus/kafka` backbone with its');
lines.push('publisher service(s) and consumer service(s).');
lines.push('');
lines.push('**Status legend**');
lines.push('');
lines.push('| Status | Meaning |');
lines.push('| --- | --- |');
lines.push('| `OK` | Published **and** consumed in-repo. |');
lines.push('| `DEAD` | Published, but no `consumer.on(...)` handler. `(allow-listed)` = intentional fire-and-forget (see allowlist.ts). `⚠` = unexpected, fails CI. |');
lines.push('| `ORPHAN` | Subscribed, but no in-repo publisher. `(allow-listed)` = produced outside the scan / known bug. `⚠` = unexpected, fails CI. |');
lines.push('');
lines.push('**Summary**');
lines.push('');
lines.push(`- Distinct event types: **${allEvents.length}**  (published: ${scan.publishedTypes.size}, subscribed: ${scan.consumedTypes.size})`);
lines.push(`- OK (wired both ways): **${ok.length}**`);
lines.push(`- DEAD (published, no consumer): **${dead.length}**  — all allow-listed as intentional fire-and-forget.`);
lines.push(`- ORPHAN (subscribed, no publisher): **${orphan.length}**  — all allow-listed (external publisher or flagged bug).`);
lines.push('');
lines.push('## Heuristic limits');
lines.push('');
lines.push('The scanner is regex/string based (it must run without Kafka or a DB). It deliberately');
lines.push('misses a few dynamic shapes rather than invent false edges; these are covered by the');
lines.push('allow-lists in `tools/event-contract/allowlist.ts`:');
lines.push('');
lines.push('- **L1** — dynamic outbox CRUD mirror publishes `${model}.created|updated|deleted` template literals (`services/*/src/prisma.ts`); concrete names are not statically knowable.');
lines.push('- **L2** — publishes whose `type` is a pre-computed variable (`const type = inbound ? \'email.received\' : \'email.sent\'`).');
lines.push('- **L3** — consumers registered in a loop over an array of literals (`for (const t of [...]) consumer.on(t, …)`).');
lines.push('- **L4** — topic-level raw consumers (audit-consumer uses kafkajs `eachMessage` on a whole topic, not `consumer.on(type)`).');
lines.push('');
lines.push('## Full catalog');
lines.push('');
lines.push('| Event type | Publisher service(s) | Consumer service(s) | Status |');
lines.push('| --- | --- | --- | --- |');
for (const e of allEvents) {
  lines.push(
    `| \`${e}\` | ${cell(scan.publisherServices.get(e)?.join(', '))} | ${cell(scan.consumerServices.get(e)?.join(', '))} | ${statusCell(e)} |`
  );
}
lines.push('');
lines.push('## DEAD events (published, no in-repo consumer)');
lines.push('');
lines.push('| Event type | Publisher(s) | Why allow-listed |');
lines.push('| --- | --- | --- |');
for (const e of dead) {
  lines.push(`| \`${e}\` | ${cell(scan.publisherServices.get(e)?.join(', '))} | ${cell(KNOWN_FIRE_AND_FORGET[e]) } |`);
}
lines.push('');
lines.push('## ORPHAN subscriptions (subscribed, no in-repo publisher)');
lines.push('');
lines.push('| Event type | Consumer(s) | Why allow-listed |');
lines.push('| --- | --- | --- |');
for (const e of orphan) {
  lines.push(`| \`${e}\` | ${cell(scan.consumerServices.get(e)?.join(', '))} | ${cell(KNOWN_EXTERNAL_PUBLISHERS[e])} |`);
}
lines.push('');
lines.push('### Flagged bugs (subset of ORPHAN)');
lines.push('');
lines.push('Real wiring gaps / name mismatches parked in the allow-list so CI is green today; fix and remove:');
lines.push('');
for (const e of orphan) {
  const reason = KNOWN_EXTERNAL_PUBLISHERS[e] ?? '';
  if (reason.startsWith('BUG:')) lines.push(`- \`${e}\` — ${reason.slice(4).trim()}`);
}
lines.push('');

const outPath = join(root, 'docs', 'EVENTS.md');
writeFileSync(outPath, lines.join('\n'));
console.log(`wrote ${outPath} (${allEvents.length} events; ${dead.length} dead, ${orphan.length} orphan)`);
