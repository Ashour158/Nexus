import type { CrmPrisma } from '../prisma.js';
import { NexusProducer, TOPICS } from '@nexus/kafka';

function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff\s]/g, '').replace(/\s+/g, ' ').trim();
}

function tokenSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const ta = new Set(normalize(a).split(' ').filter(Boolean));
  const tb = new Set(normalize(b).split(' ').filter(Boolean));
  const intersection = new Set([...ta].filter((x) => tb.has(x)));
  const union = new Set([...ta, ...tb]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function emailSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  if (a.toLowerCase() === b.toLowerCase()) return 1;
  const [la] = a.toLowerCase().split('@');
  const [lb] = b.toLowerCase().split('@');
  const maxLen = Math.max(la.length, lb.length);
  return maxLen === 0 ? 0 : 1 - levenshtein(la, lb) / maxLen;
}

/**
 * Deterministic normalized similarity in [0,1] for the rule-driven detector.
 * 1 = identical after normalization; otherwise a Levenshtein ratio
 * (1 - distance/maxLen) over the lowercased/stripped strings. No dependency,
 * fully deterministic — reuses the same {@link normalize}/{@link levenshtein}
 * primitives the pairwise scorers use.
 */
export function similarityRatio(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(na, nb) / maxLen;
}

/** Canonical module identifiers used across the unified dedup surface. */
export type DedupModule = 'lead' | 'contact' | 'account' | 'deal';
export const DEDUP_MODULES: readonly DedupModule[] = ['lead', 'contact', 'account', 'deal'];

/**
 * The Prisma model + the concrete columns each module exposes to a
 * {@link DuplicateRule}. `matchFields` on a rule must be a subset of `fields`
 * (unknown fields are ignored). `where` scopes the detector's candidate pull to
 * live rows for the module (soft-delete is additionally applied by the client
 * extension).
 */
const MODULE_CONFIG: Record<DedupModule, { model: string; fields: string[]; where: Record<string, unknown> }> = {
  lead: {
    model: 'lead',
    fields: ['firstName', 'lastName', 'email', 'phone', 'company', 'website', 'jobTitle', 'city', 'country'],
    where: {},
  },
  contact: {
    model: 'contact',
    fields: ['firstName', 'lastName', 'email', 'phone', 'mobile', 'jobTitle', 'department', 'accountId', 'city', 'country'],
    where: { isActive: true },
  },
  account: {
    model: 'account',
    fields: ['name', 'email', 'phone', 'website', 'industry', 'city', 'country'],
    where: { status: 'ACTIVE' },
  },
  deal: {
    model: 'deal',
    fields: ['name', 'amount', 'accountId', 'currency', 'stageId'],
    where: {},
  },
};

/** System columns a merge's field-resolution may never overwrite. */
const PROTECTED_MERGE_FIELDS = new Set(['id', 'tenantId', 'createdAt', 'updatedAt', 'deletedAt', 'version']);

/**
 * Does a configured {@link DuplicateRule} consider records `a` and `b` a match?
 * EXACT  → every matchField is present on both and normalized-equal.
 * FUZZY  → every matchField is present on both and the AVERAGE per-field
 *          similarity ≥ threshold% (threshold defaults to 80). Returns the
 *          representative score for surfacing/ordering, or null when no match.
 */
export function ruleMatch(
  rule: { matchFields: string[]; matchType: string; threshold?: number | null },
  a: Record<string, unknown>,
  b: Record<string, unknown>
): { score: number } | null {
  const fields = (rule.matchFields ?? []).filter((f) => typeof f === 'string' && f.length > 0);
  if (fields.length === 0) return null;

  const isFuzzy = (rule.matchType ?? 'EXACT').toUpperCase() === 'FUZZY';
  const cutoff = Math.max(0, Math.min(1, (rule.threshold ?? 80) / 100));

  let scoreSum = 0;
  for (const field of fields) {
    const va = a[field];
    const vb = b[field];
    const sa = va == null ? '' : String(va);
    const sb = vb == null ? '' : String(vb);
    // Both must carry a value on the field, else two empty/null records would
    // trivially "match" (e.g. two contacts with no phone).
    if (!normalize(sa) || !normalize(sb)) return null;
    if (isFuzzy) {
      scoreSum += similarityRatio(sa, sb);
    } else {
      if (normalize(sa) !== normalize(sb)) return null;
      scoreSum += 1;
    }
  }
  const avg = scoreSum / fields.length;
  if (isFuzzy && avg < cutoff) return null;
  return { score: avg };
}

export function scoreContactPair(
  a: { firstName: string; lastName: string; email?: string | null; phone?: string | null; company?: string | null },
  b: { firstName: string; lastName: string; email?: string | null; phone?: string | null; company?: string | null }
): number {
  const nameSim = tokenSimilarity(`${a.firstName} ${a.lastName}`, `${b.firstName} ${b.lastName}`);
  const emailSim = emailSimilarity(a.email, b.email);
  const phoneSim = a.phone && b.phone && normalize(a.phone) === normalize(b.phone) ? 1 : 0;
  const companySim = tokenSimilarity(a.company ?? '', b.company ?? '');
  return nameSim * 0.4 + emailSim * 0.35 + phoneSim * 0.15 + companySim * 0.1;
}

export function scoreAccountPair(
  a: { name: string; website?: string | null; phone?: string | null },
  b: { name: string; website?: string | null; phone?: string | null }
): number {
  const nameSim = tokenSimilarity(a.name, b.name);
  const domainA = a.website?.replace(/https?:\/\/(www\.)?/, '').split('/')[0] ?? '';
  const domainB = b.website?.replace(/https?:\/\/(www\.)?/, '').split('/')[0] ?? '';
  const domainSim = domainA && domainB && normalize(domainA) === normalize(domainB) ? 1 : 0;
  const phoneSim = a.phone && b.phone && normalize(a.phone) === normalize(b.phone) ? 1 : 0;
  return nameSim * 0.6 + domainSim * 0.25 + phoneSim * 0.15;
}

/**
 * Deal duplicate matcher (RR-H14). Deals are only ever compared WITHIN the same
 * account (the caller buckets by accountId first), so this scores the remaining
 * signals. A pair is a duplicate when EITHER:
 *   - the names are highly similar (token Jaccard ≥ 0.8), OR
 *   - the amounts are within 5% AND the expected close dates are within a
 *     30-day window.
 * `score` is a representative confidence for surfacing/ordering.
 */
export function scoreDealPair(
  a: { name: string; amount?: unknown; expectedCloseDate?: Date | string | null },
  b: { name: string; amount?: unknown; expectedCloseDate?: Date | string | null }
): { match: boolean; score: number } {
  const nameSim = tokenSimilarity(a.name ?? '', b.name ?? '');

  const numA = a.amount == null ? NaN : Number(a.amount);
  const numB = b.amount == null ? NaN : Number(b.amount);
  let amountClose = false;
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    const larger = Math.max(Math.abs(numA), Math.abs(numB));
    amountClose = larger === 0 ? true : Math.abs(numA - numB) / larger <= 0.05;
  }

  let datesClose = false;
  if (a.expectedCloseDate && b.expectedCloseDate) {
    const ta = new Date(a.expectedCloseDate).getTime();
    const tb = new Date(b.expectedCloseDate).getTime();
    if (Number.isFinite(ta) && Number.isFinite(tb)) {
      datesClose = Math.abs(ta - tb) <= 30 * 24 * 60 * 60 * 1000;
    }
  }

  const amountDateMatch = amountClose && datesClose;
  const match = nameSim >= 0.8 || amountDateMatch;
  const score = Math.max(nameSim, amountDateMatch ? 0.9 : 0);
  return { match, score };
}

export function createDedupService(prisma: CrmPrisma, producer?: NexusProducer) {
  const THRESHOLD = 0.75;
  const p = prisma as any;

  async function scanContacts(tenantId: string, limit = 1000) {
    const contacts = await p.contact.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const groups: Array<{ records: Array<{ id: string; score: number }>; topScore: number }> = [];
    const processed = new Set<string>();

    // Early-exit optimization: pre-filter by email hash to reduce O(n²) comparisons
    const emailBuckets = new Map<string, string[]>();
    for (const c of contacts) {
      if (c.email) {
        const domain = c.email.split('@')[1]?.toLowerCase();
        if (domain) {
          const bucket = emailBuckets.get(domain) ?? [];
          bucket.push(c.id);
          emailBuckets.set(domain, bucket);
        }
      }
    }

    for (let i = 0; i < contacts.length; i += 1) {
      if (processed.has(contacts[i].id)) continue;
      const group: Array<{ id: string; score: number }> = [{ id: contacts[i].id, score: 1 }];
      // Only compare against contacts with same email domain or nearby indices
      const candidates = new Set<number>();
      const emailDomain = contacts[i].email?.split('@')[1]?.toLowerCase();
      if (emailDomain && emailBuckets.has(emailDomain)) {
        for (const cid of emailBuckets.get(emailDomain)!) {
          const idx = contacts.findIndex((c: { id: string }) => c.id === cid);
          if (idx > i) candidates.add(idx);
        }
      }
      // Fallback: check next 200 contacts to bound CPU
      for (let j = i + 1; j < Math.min(contacts.length, i + 201); j += 1) {
        candidates.add(j);
      }
      for (const j of candidates) {
        if (processed.has(contacts[j].id)) continue;
        const score = scoreContactPair(contacts[i], contacts[j]);
        if (score >= THRESHOLD) {
          group.push({ id: contacts[j].id, score });
          processed.add(contacts[j].id);
        }
      }
      if (group.length > 1) {
        processed.add(contacts[i].id);
        groups.push({ records: group, topScore: Math.max(...group.map((r) => r.score)) });
      }
    }

    return groups;
  }

  async function scanAccounts(tenantId: string, limit = 500) {
    const accounts = await p.account.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { id: true, name: true, website: true, phone: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const groups: Array<{ records: Array<{ id: string; score: number }>; topScore: number }> = [];
    const processed = new Set<string>();

    // Pre-bucket by domain to reduce comparisons
    const domainBuckets = new Map<string, string[]>();
    for (const a of accounts) {
      if (a.website) {
        const domain = a.website.replace(/https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
        const bucket = domainBuckets.get(domain) ?? [];
        bucket.push(a.id);
        domainBuckets.set(domain, bucket);
      }
    }

    for (let i = 0; i < accounts.length; i += 1) {
      if (processed.has(accounts[i].id)) continue;
      const group: Array<{ id: string; score: number }> = [{ id: accounts[i].id, score: 1 }];
      const candidates = new Set<number>();
      const domain = accounts[i].website?.replace(/https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
      if (domain && domainBuckets.has(domain)) {
        for (const aid of domainBuckets.get(domain)!) {
          const idx = accounts.findIndex((a: { id: string }) => a.id === aid);
          if (idx > i) candidates.add(idx);
        }
      }
      // Bound search window to prevent event-loop blocking
      for (let j = i + 1; j < Math.min(accounts.length, i + 201); j += 1) {
        candidates.add(j);
      }
      for (const j of candidates) {
        if (processed.has(accounts[j].id)) continue;
        const score = scoreAccountPair(accounts[i], accounts[j]);
        if (score >= THRESHOLD) {
          group.push({ id: accounts[j].id, score });
          processed.add(accounts[j].id);
        }
      }
      if (group.length > 1) {
        processed.add(accounts[i].id);
        groups.push({ records: group, topScore: Math.max(...group.map((r) => r.score)) });
      }
    }

    return groups;
  }

  /**
   * RR-H14: deal duplicate scan. Deals are compared ONLY within the same
   * account (accountId bucket), then matched on name similarity and/or
   * amount+close-date proximity (see {@link scoreDealPair}). Open deals are the
   * common dedup target, but all non-deleted deals are considered so historical
   * dupes surface too. Bounded per bucket to keep the scan O(n) in practice.
   */
  async function scanDeals(tenantId: string, limit = 1000) {
    const deals = await p.deal.findMany({
      where: { tenantId },
      select: { id: true, accountId: true, name: true, amount: true, expectedCloseDate: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    // Bucket by account — cross-account deals are never considered duplicates.
    const byAccount = new Map<string, typeof deals>();
    for (const d of deals) {
      if (!d.accountId) continue;
      const bucket = byAccount.get(d.accountId) ?? [];
      bucket.push(d);
      byAccount.set(d.accountId, bucket);
    }

    const groups: Array<{ records: Array<{ id: string; score: number }>; topScore: number }> = [];
    for (const bucket of byAccount.values()) {
      if (bucket.length < 2) continue;
      const processed = new Set<string>();
      for (let i = 0; i < bucket.length; i += 1) {
        if (processed.has(bucket[i].id)) continue;
        const group: Array<{ id: string; score: number }> = [{ id: bucket[i].id, score: 1 }];
        // Bound the inner window to keep CPU predictable on huge accounts.
        for (let j = i + 1; j < Math.min(bucket.length, i + 201); j += 1) {
          if (processed.has(bucket[j].id)) continue;
          const { match, score } = scoreDealPair(bucket[i], bucket[j]);
          if (match) {
            group.push({ id: bucket[j].id, score });
            processed.add(bucket[j].id);
          }
        }
        if (group.length > 1) {
          processed.add(bucket[i].id);
          groups.push({ records: group, topScore: Math.max(...group.map((r) => r.score)) });
        }
      }
    }

    return groups;
  }

  async function persistGroups(
    tenantId: string,
    entityType: 'contact' | 'account' | 'deal',
    groups: Array<{ records: Array<{ id: string; score: number }>; topScore: number }>
  ) {
    const existing = await p.duplicateGroup.findMany({ where: { tenantId, entityType, status: 'pending' }, select: { id: true } });
    if (existing.length) await p.duplicateGroup.deleteMany({ where: { id: { in: existing.map((g: { id: string }) => g.id) } } });

    for (const group of groups) {
      const created = await p.duplicateGroup.create({ data: { tenantId, entityType, status: 'pending' } });
      await p.duplicateRecord.createMany({
        data: group.records.map((r, i) => ({
          groupId: created.id,
          recordId: r.id,
          score: r.score,
          isMaster: i === 0,
        })),
      });
    }

    return groups.length;
  }

  async function runFullScan(tenantId: string) {
    const [contactGroups, accountGroups, dealGroups] = await Promise.all([
      scanContacts(tenantId),
      scanAccounts(tenantId),
      scanDeals(tenantId),
    ]);
    const [contactCount, accountCount, dealCount] = await Promise.all([
      persistGroups(tenantId, 'contact', contactGroups),
      persistGroups(tenantId, 'account', accountGroups),
      persistGroups(tenantId, 'deal', dealGroups),
    ]);
    return {
      contacts: { groups: contactCount },
      accounts: { groups: accountCount },
      deals: { groups: dealCount },
    };
  }

  /** Deal-only scan entrypoint for `POST /deals/dedup/scan`. */
  async function runDealScan(tenantId: string) {
    const dealGroups = await scanDeals(tenantId);
    const dealCount = await persistGroups(tenantId, 'deal', dealGroups);
    return { deals: { groups: dealCount } };
  }

  /**
   * Id-list contact merge core (shared by the group-merge wrapper and the
   * unified `/contact/merge` route). Validates tenant ownership of the master +
   * every loser, applies the resolved field overrides, re-parents children
   * collision-safely, soft-deletes the losers, and (when `groupId` is given)
   * resolves the originating DuplicateGroup — all in one transaction.
   */
  async function mergeContactsByIds(
    tenantId: string,
    masterId: string,
    mergeIds: string[],
    mergedData: Record<string, unknown>,
    userId: string,
    groupId?: string
  ) {
    const requested = [...new Set(mergeIds)].filter((id) => id && id !== masterId);
    if (requested.length === 0) throw new Error('No contacts to merge');

    const involved = await p.contact.findMany({ where: { tenantId, id: { in: [masterId, ...requested] } }, select: { id: true } });
    const involvedIds = new Set(involved.map((c: { id: string }) => c.id));
    if (!involvedIds.has(masterId)) throw new Error('Master contact not found');
    const duplicateIds = requested.filter((id) => involvedIds.has(id));
    if (duplicateIds.length === 0) throw new Error('No valid contacts to merge');

    // Atomic merge (DI-09): all reparenting + soft-delete happen in one transaction,
    // so a mid-way failure leaves the graph untouched rather than half-merged.
    await p.$transaction(async (tx: CrmPrisma) => {
      if (Object.keys(mergedData).length > 0) await tx.contact.update({ where: { id: masterId }, data: mergedData });

      // Reparent the duplicate's child records to the master (DI-08). Optional-FK
      // relations with no (dealId, contactId) uniqueness can be bulk-updated safely.
      await tx.activity.updateMany({ where: { contactId: { in: duplicateIds } }, data: { contactId: masterId } });
      await tx.note.updateMany({ where: { contactId: { in: duplicateIds } }, data: { contactId: masterId } });
      await tx.quoteProjection.updateMany({ where: { tenantId, contactId: { in: duplicateIds } }, data: { contactId: masterId } });
      await tx.emailThread.updateMany({ where: { contactId: { in: duplicateIds } }, data: { contactId: masterId } });
      // Polymorphic activity/note rows (entityType/entityId) that point at a contact.
      await tx.activity.updateMany({ where: { tenantId, entityType: { in: ['contact', 'CONTACT'] }, entityId: { in: duplicateIds } }, data: { entityId: masterId } });
      await tx.note.updateMany({ where: { tenantId, entityType: { in: ['contact', 'CONTACT'] }, entityId: { in: duplicateIds } }, data: { entityId: masterId } });
      // Attachments keyed by (module, recordId).
      await tx.attachment.updateMany({ where: { tenantId, module: 'contact', recordId: { in: duplicateIds } }, data: { recordId: masterId } });

      // Deal links carry a @@unique([dealId, contactId]) — moving a duplicate's link
      // to a deal the master already sits on would violate it, so drop the redundant
      // link and only reparent the genuinely new ones.
      for (const relation of ['dealContact', 'dealStakeholder'] as const) {
        const model = tx[relation] as unknown as {
          findMany: (a: unknown) => Promise<Array<{ id: string; dealId: string }>>;
          delete: (a: unknown) => Promise<unknown>;
          update: (a: unknown) => Promise<unknown>;
        };
        const masterLinks = await model.findMany({ where: { contactId: masterId }, select: { dealId: true } }) as Array<{ dealId: string }>;
        const masterDeals = new Set(masterLinks.map((l) => l.dealId));
        const dupLinks = await model.findMany({ where: { contactId: { in: duplicateIds } } });
        for (const link of dupLinks) {
          if (masterDeals.has(link.dealId)) {
            await model.delete({ where: { id: link.id } });
          } else {
            await model.update({ where: { id: link.id }, data: { contactId: masterId } });
            masterDeals.add(link.dealId);
          }
        }
      }

      // Consistent soft-delete: mark duplicates inactive AND stamp deletedAt so they
      // drop out of every list that filters on either flag.
      await tx.contact.updateMany({ where: { id: { in: duplicateIds } }, data: { isActive: false, deletedAt: new Date() } });
      if (groupId) {
        await tx.duplicateGroup.update({
          where: { id: groupId },
          data: { status: 'merged', masterRecordId: masterId, resolvedAt: new Date(), resolvedBy: userId },
        });
      }
    });

    // Nervous system: announce each collapsed duplicate so downstream consumers reconcile.
    if (producer) {
      for (const dupId of duplicateIds) {
        await producer
          .publish(TOPICS.CONTACTS, {
            type: 'contact.merged',
            tenantId,
            payload: { contactId: masterId, mergedFromId: dupId },
          })
          .catch(() => undefined);
      }
    }

    return { merged: duplicateIds.length, masterId };
  }

  /** Group-based contact merge (`/dedup/groups/:id/merge`): resolves the group's
   * losers + `{sourceId,value}` overrides, then delegates to the id-list core. */
  async function mergeContacts(
    tenantId: string,
    groupId: string,
    masterId: string,
    fieldSelections: Record<string, { sourceId: string; value?: unknown }>,
    userId: string
  ) {
    const mergedData: Record<string, unknown> = {};
    for (const [field, selection] of Object.entries(fieldSelections)) mergedData[field] = selection.value;

    const group = await p.duplicateGroup.findUnique({ where: { id: groupId }, include: { records: true } });
    if (!group || group.tenantId !== tenantId) throw new Error('Group not found');
    const mergeIds = group.records.map((r: { recordId: string }) => r.recordId).filter((id: string) => id !== masterId);
    return mergeContactsByIds(tenantId, masterId, mergeIds, mergedData, userId, groupId);
  }

  /**
   * Account merge — parity with contact merge (DI-08/09). Atomic $transaction:
   * reparent child relations to the master, collision-safe, then soft-delete the
   * duplicates (deletedAt). Emits `account.merged` per collapsed duplicate.
   *
   * NOTE: the CrmPrisma replica-wrapper requires the interactive-tx callback to be
   * typed `async (tx: CrmPrisma) => …` (see mergeContacts) so `tx.*` models resolve.
   */
  async function mergeAccountsByIds(
    tenantId: string,
    masterId: string,
    mergeIds: string[],
    mergedData: Record<string, unknown>,
    userId: string,
    groupId?: string
  ) {
    const requested = [...new Set(mergeIds)].filter((id) => id && id !== masterId);
    if (requested.length === 0) throw new Error('No accounts to merge');

    const involved = await p.account.findMany({ where: { tenantId, id: { in: [masterId, ...requested] } }, select: { id: true } });
    const involvedIds = new Set(involved.map((a: { id: string }) => a.id));
    if (!involvedIds.has(masterId)) throw new Error('Master account not found');
    const duplicateIds = requested.filter((id) => involvedIds.has(id));
    if (duplicateIds.length === 0) throw new Error('No valid accounts to merge');

    await p.$transaction(async (tx: CrmPrisma) => {
      if (Object.keys(mergedData).length > 0) await tx.account.update({ where: { id: masterId }, data: mergedData });

      // Reparent optional/plain-FK children — no per-account uniqueness on these,
      // so bulk updateMany is collision-safe.
      await tx.contact.updateMany({ where: { tenantId, accountId: { in: duplicateIds } }, data: { accountId: masterId } });
      await tx.deal.updateMany({ where: { tenantId, accountId: { in: duplicateIds } }, data: { accountId: masterId } });
      await tx.activity.updateMany({ where: { tenantId, accountId: { in: duplicateIds } }, data: { accountId: masterId } });
      await tx.note.updateMany({ where: { tenantId, accountId: { in: duplicateIds } }, data: { accountId: masterId } });
      await tx.emailThread.updateMany({ where: { tenantId, accountId: { in: duplicateIds } }, data: { accountId: masterId } });
      await tx.quoteProjection.updateMany({ where: { tenantId, accountId: { in: duplicateIds } }, data: { accountId: masterId } });
      // Polymorphic activity/note rows + attachments keyed by account.
      await tx.activity.updateMany({ where: { tenantId, entityType: { in: ['account', 'ACCOUNT'] }, entityId: { in: duplicateIds } }, data: { entityId: masterId } });
      await tx.note.updateMany({ where: { tenantId, entityType: { in: ['account', 'ACCOUNT'] }, entityId: { in: duplicateIds } }, data: { entityId: masterId } });
      await tx.attachment.updateMany({ where: { tenantId, module: 'account', recordId: { in: duplicateIds } }, data: { recordId: masterId } });

      // Re-parent the hierarchy: children of a duplicate now hang off the master,
      // and avoid self-parenting the master.
      await tx.account.updateMany({
        where: { tenantId, parentAccountId: { in: duplicateIds }, NOT: { id: masterId } },
        data: { parentAccountId: masterId },
      });

      // AccountHealthScore carries a @unique(accountId): moving a duplicate's health
      // row onto an account that already has one would violate it. Keep the master's
      // (or a duplicate's if the master has none) and drop the rest — collision-safe.
      const healthModel = tx.accountHealthScore as unknown as {
        findMany: (a: unknown) => Promise<Array<{ id: string; accountId: string }>>;
        update: (a: unknown) => Promise<unknown>;
        delete: (a: unknown) => Promise<unknown>;
      };
      const masterHealth = await healthModel.findMany({ where: { accountId: masterId } });
      const dupHealth = await healthModel.findMany({ where: { accountId: { in: duplicateIds } } });
      let masterHasHealth = masterHealth.length > 0;
      for (const row of dupHealth) {
        if (masterHasHealth) {
          await healthModel.delete({ where: { id: row.id } });
        } else {
          await healthModel.update({ where: { id: row.id }, data: { accountId: masterId } });
          masterHasHealth = true;
        }
      }

      // Soft-delete duplicates (deletedAt) so they drop out of every list.
      await tx.account.updateMany({ where: { id: { in: duplicateIds } }, data: { deletedAt: new Date() } });
      if (groupId) {
        await tx.duplicateGroup.update({
          where: { id: groupId },
          data: { status: 'merged', masterRecordId: masterId, resolvedAt: new Date(), resolvedBy: userId },
        });
      }
    });

    // Nervous system: announce each collapsed duplicate.
    if (producer) {
      for (const dupId of duplicateIds) {
        await producer
          .publish(TOPICS.ACCOUNTS, {
            type: 'account.merged',
            tenantId,
            payload: { accountId: masterId, mergedFromId: dupId },
          })
          .catch(() => undefined);
      }
    }

    return { merged: duplicateIds.length, masterId };
  }

  /** Group-based account merge (`/dedup/groups/:id/merge`): resolves the group's
   * losers + `{sourceId,value}` overrides, then delegates to the id-list core. */
  async function mergeAccounts(
    tenantId: string,
    groupId: string,
    masterId: string,
    fieldSelections: Record<string, { sourceId: string; value?: unknown }>,
    userId: string
  ) {
    const mergedData: Record<string, unknown> = {};
    for (const [field, selection] of Object.entries(fieldSelections)) mergedData[field] = selection.value;

    const group = await p.duplicateGroup.findUnique({ where: { id: groupId }, include: { records: true } });
    if (!group || group.tenantId !== tenantId) throw new Error('Group not found');
    const mergeIds = group.records.map((r: { recordId: string }) => r.recordId).filter((id: string) => id !== masterId);
    return mergeAccountsByIds(tenantId, masterId, mergeIds, mergedData, userId, groupId);
  }

  /**
   * RR-H14: deal merge. Re-parents every child of the merged deals onto the
   * survivor, then soft-deletes the merged deals, recomputes the survivor's
   * amount roll-up (when it has line-items), and writes merge-audit rows.
   *
   * Collision-safe reparenting is applied to every child that carries a
   * per-deal uniqueness constraint (DealContact, DealStakeholder, DealTeam,
   * DealCompetitor, DealRoom); constraint-free children move with a bulk
   * updateMany. Runs entirely inside one interactive transaction so a mid-way
   * failure leaves the graph untouched.
   *
   * @param survivorId the deal that survives (a.k.a. master).
   * @param mergedIds  the deals to collapse into the survivor.
   */
  async function mergeDeals(
    tenantId: string,
    survivorId: string,
    mergedIds: string[],
    fieldResolutions: Record<string, { sourceId?: string; value?: unknown }> | undefined,
    userId: string
  ) {
    const dupIds = [...new Set(mergedIds)].filter((id) => id && id !== survivorId);
    if (dupIds.length === 0) throw new Error('No deals to merge');

    // Validate survivor + all merged deals belong to the tenant.
    const involved = await p.deal.findMany({
      where: { tenantId, id: { in: [survivorId, ...dupIds] } },
      select: { id: true },
    });
    const involvedIds = new Set(involved.map((d: { id: string }) => d.id));
    if (!involvedIds.has(survivorId)) throw new Error('Survivor deal not found');
    const validDupIds = dupIds.filter((id) => involvedIds.has(id));
    if (validDupIds.length === 0) throw new Error('No valid deals to merge');

    const mergedData: Record<string, unknown> = {};
    for (const [field, selection] of Object.entries(fieldResolutions ?? {})) {
      mergedData[field] = selection.value;
    }

    await p.$transaction(async (tx: CrmPrisma) => {
      // Survivor field overrides from the resolution map (if any).
      if (Object.keys(mergedData).length > 0) {
        await tx.deal.update({ where: { id: survivorId }, data: mergedData });
      }

      // ── Constraint-free children: bulk reparent (collision-safe) ───────────
      // Deal line-items roll up into Deal.amount; move them all to the survivor.
      await tx.dealProduct.updateMany({ where: { tenantId, dealId: { in: validDupIds } }, data: { dealId: survivorId } });
      // Activities + notes — typed dealId FK …
      await tx.activity.updateMany({ where: { tenantId, dealId: { in: validDupIds } }, data: { dealId: survivorId } });
      await tx.note.updateMany({ where: { tenantId, dealId: { in: validDupIds } }, data: { dealId: survivorId } });
      // … and the polymorphic entityType/entityId rows (A1) that point at a deal.
      await tx.activity.updateMany({ where: { tenantId, entityType: { in: ['deal', 'DEAL'] }, entityId: { in: validDupIds } }, data: { entityId: survivorId } });
      await tx.note.updateMany({ where: { tenantId, entityType: { in: ['deal', 'DEAL'] }, entityId: { in: validDupIds } }, data: { entityId: survivorId } });
      // Attachments are keyed by (module, recordId).
      await tx.attachment.updateMany({ where: { tenantId, module: 'deal', recordId: { in: validDupIds } }, data: { recordId: survivorId } });
      // Quotes + quote-projection read-model.
      await tx.quote.updateMany({ where: { tenantId, dealId: { in: validDupIds } }, data: { dealId: survivorId } });
      await tx.quoteProjection.updateMany({ where: { tenantId, dealId: { in: validDupIds } }, data: { dealId: survivorId } });

      // ── Per-deal-unique children: collision-safe reparent ──────────────────
      // DealContact @@unique([dealId, contactId]) / DealStakeholder @@unique
      // ([dealId, contactId]) / DealCompetitor @@unique([dealId, competitorId]).
      for (const [relation, peerField] of [
        ['dealContact', 'contactId'],
        ['dealStakeholder', 'contactId'],
        ['dealCompetitor', 'competitorId'],
      ] as const) {
        const model = tx[relation] as unknown as {
          findMany: (a: unknown) => Promise<Array<Record<string, unknown>>>;
          delete: (a: unknown) => Promise<unknown>;
          update: (a: unknown) => Promise<unknown>;
        };
        const survivorLinks = await model.findMany({ where: { dealId: survivorId } });
        const taken = new Set(survivorLinks.map((l) => l[peerField] as string));
        const dupLinks = await model.findMany({ where: { dealId: { in: validDupIds } } });
        for (const link of dupLinks) {
          const peer = link[peerField] as string;
          if (taken.has(peer)) {
            await model.delete({ where: { id: link.id as string } });
          } else {
            await model.update({ where: { id: link.id as string }, data: { dealId: survivorId } });
            taken.add(peer);
          }
        }
      }

      // DealTeam @@unique([tenantId, dealId, userId, splitType]).
      const teamModel = tx.dealTeam as unknown as {
        findMany: (a: unknown) => Promise<Array<{ id: string; userId: string; splitType: string }>>;
        delete: (a: unknown) => Promise<unknown>;
        update: (a: unknown) => Promise<unknown>;
      };
      const survivorTeam = await teamModel.findMany({ where: { tenantId, dealId: survivorId } });
      const takenTeam = new Set(survivorTeam.map((t) => `${t.userId}:${t.splitType}`));
      const dupTeam = await teamModel.findMany({ where: { tenantId, dealId: { in: validDupIds } } });
      for (const t of dupTeam) {
        const k = `${t.userId}:${t.splitType}`;
        if (takenTeam.has(k)) {
          await teamModel.delete({ where: { id: t.id } });
        } else {
          await teamModel.update({ where: { id: t.id }, data: { dealId: survivorId } });
          takenTeam.add(k);
        }
      }

      // DealRoom @unique(dealId): a deal has at most one. If the survivor already
      // has a room, fold each merged room's items+documents into it and soft-
      // delete the merged room; otherwise reparent the room to the survivor.
      const roomModel = tx.dealRoom as unknown as {
        findFirst: (a: unknown) => Promise<{ id: string } | null>;
        findMany: (a: unknown) => Promise<Array<{ id: string }>>;
        update: (a: unknown) => Promise<unknown>;
      };
      const survivorRoom = await roomModel.findFirst({ where: { tenantId, dealId: survivorId } });
      const dupRooms = await roomModel.findMany({ where: { tenantId, dealId: { in: validDupIds } } });
      for (const room of dupRooms) {
        if (survivorRoom) {
          await tx.mutualActionItem.updateMany({ where: { tenantId, dealRoomId: room.id }, data: { dealRoomId: survivorRoom.id } });
          await tx.dealRoomDocument.updateMany({ where: { tenantId, dealRoomId: room.id }, data: { dealRoomId: survivorRoom.id } });
          await roomModel.update({ where: { id: room.id }, data: { deletedAt: new Date() } });
        } else {
          await roomModel.update({ where: { id: room.id }, data: { dealId: survivorId } });
        }
      }

      // Recompute the survivor's amount roll-up from its (now merged) line-items.
      // Only overwrite when line-items exist so a manually-set amount on a deal
      // without products is never clobbered.
      const agg = await (tx.dealProduct as unknown as {
        aggregate: (a: unknown) => Promise<{ _sum: { lineTotal: unknown }; _count: number }>;
      }).aggregate({ where: { tenantId, dealId: survivorId }, _sum: { lineTotal: true }, _count: true });
      if (agg._count > 0 && agg._sum.lineTotal != null) {
        await tx.deal.update({ where: { id: survivorId }, data: { amount: agg._sum.lineTotal as never } });
      }

      // Soft-delete the merged deals so they drop out of every list.
      await tx.deal.updateMany({
        where: { tenantId, id: { in: validDupIds } },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });

      // Merge-audit rows (survivor + merged ids + actor) via the field-change log.
      await tx.fieldChangeLog.create({
        data: {
          tenantId,
          objectType: 'deal',
          objectId: survivorId,
          fieldName: 'mergedFrom',
          oldValue: null,
          newValue: JSON.stringify(validDupIds),
          changedBy: userId,
        },
      });
      for (const dupId of validDupIds) {
        await tx.fieldChangeLog.create({
          data: {
            tenantId,
            objectType: 'deal',
            objectId: dupId,
            fieldName: 'mergedInto',
            oldValue: null,
            newValue: survivorId,
            changedBy: userId,
          },
        });
      }
    });

    // Resolve any pending deal duplicate groups that referenced these records.
    try {
      const pendingGroups = await p.duplicateGroup.findMany({
        where: { tenantId, entityType: 'deal', status: 'pending' },
        include: { records: true },
      });
      const collapsed = new Set([survivorId, ...validDupIds]);
      for (const g of pendingGroups) {
        const ids = g.records.map((r: { recordId: string }) => r.recordId);
        if (ids.some((id: string) => collapsed.has(id))) {
          await p.duplicateGroup.update({
            where: { id: g.id },
            data: { status: 'merged', masterRecordId: survivorId, resolvedAt: new Date(), resolvedBy: userId },
          });
        }
      }
    } catch {
      /* group resolution is best-effort — the merge itself already committed */
    }

    // Nervous system: survivor updated, each merged deal archived + a merge note.
    if (producer) {
      const survivor = await p.deal.findFirst({ where: { id: survivorId, tenantId } });
      await producer
        .publish(TOPICS.DEALS, {
          type: 'deal.updated',
          tenantId,
          payload: survivor
            ? {
                id: survivor.id,
                dealId: survivor.id,
                ownerId: survivor.ownerId,
                accountId: survivor.accountId,
                pipelineId: survivor.pipelineId,
                stageId: survivor.stageId,
                status: survivor.status,
                amount: Number(survivor.amount),
                currency: survivor.currency,
                changedFields: ['merge'],
              }
            : { id: survivorId, dealId: survivorId },
        })
        .catch(() => undefined);
      for (const dupId of validDupIds) {
        await producer
          .publish(TOPICS.DEALS, {
            type: 'deal.archived',
            tenantId,
            payload: { dealId: dupId, mergedIntoId: survivorId, reason: 'merged' },
          })
          .catch(() => undefined);
      }
    }

    return { merged: validDupIds.length, survivorId };
  }

  /**
   * Group-based deal merge for the generic `/dedup/groups/:id/merge` route:
   * derives the merged ids from the group's records (all but the master) and
   * delegates to {@link mergeDeals}.
   */
  async function mergeDealsByGroup(
    tenantId: string,
    groupId: string,
    masterId: string,
    fieldSelections: Record<string, { sourceId?: string; value?: unknown }>,
    userId: string
  ) {
    const group = await p.duplicateGroup.findUnique({ where: { id: groupId }, include: { records: true } });
    if (!group || group.tenantId !== tenantId) throw new Error('Group not found');
    const mergedIds = group.records
      .map((r: { recordId: string }) => r.recordId)
      .filter((id: string) => id !== masterId);
    const result = await mergeDeals(tenantId, masterId, mergedIds, fieldSelections, userId);
    return { merged: result.merged, masterId };
  }

  /**
   * Id-list LEAD merge — new reparent coverage (leads previously had NO merge
   * path at all, only create-time duplicate detection). Mirrors the contact/
   * account cores: tenant-scoped, transactional, collision-safe, soft-deletes
   * the losers, writes merge-audit rows, and emits lead events.
   *
   * Reparents: activities + notes (typed `leadId` FK and the polymorphic
   * entityType/entityId pair), attachments keyed by (module='lead', recordId),
   * LeadRoutingEvent rows, and the @unique(leadId) LeadScore (collision-safe).
   */
  async function mergeLeadsByIds(
    tenantId: string,
    masterId: string,
    mergeIds: string[],
    mergedData: Record<string, unknown>,
    userId: string,
    groupId?: string
  ) {
    const requested = [...new Set(mergeIds)].filter((id) => id && id !== masterId);
    if (requested.length === 0) throw new Error('No leads to merge');

    const involved = await p.lead.findMany({ where: { tenantId, id: { in: [masterId, ...requested] } }, select: { id: true } });
    const involvedIds = new Set(involved.map((l: { id: string }) => l.id));
    if (!involvedIds.has(masterId)) throw new Error('Master lead not found');
    const duplicateIds = requested.filter((id) => involvedIds.has(id));
    if (duplicateIds.length === 0) throw new Error('No valid leads to merge');

    await p.$transaction(async (tx: CrmPrisma) => {
      if (Object.keys(mergedData).length > 0) await tx.lead.update({ where: { id: masterId }, data: mergedData });

      // Constraint-free children: bulk reparent (collision-safe).
      await tx.activity.updateMany({ where: { tenantId, leadId: { in: duplicateIds } }, data: { leadId: masterId } });
      await tx.note.updateMany({ where: { tenantId, leadId: { in: duplicateIds } }, data: { leadId: masterId } });
      await tx.activity.updateMany({ where: { tenantId, entityType: { in: ['lead', 'LEAD'] }, entityId: { in: duplicateIds } }, data: { entityId: masterId } });
      await tx.note.updateMany({ where: { tenantId, entityType: { in: ['lead', 'LEAD'] }, entityId: { in: duplicateIds } }, data: { entityId: masterId } });
      await tx.attachment.updateMany({ where: { tenantId, module: 'lead', recordId: { in: duplicateIds } }, data: { recordId: masterId } });
      await tx.leadRoutingEvent.updateMany({ where: { tenantId, leadId: { in: duplicateIds } }, data: { leadId: masterId } });

      // LeadScore @unique(leadId): keep the master's (or adopt a duplicate's when
      // the master has none) and drop the rest — collision-safe.
      const scoreModel = tx.leadScore as unknown as {
        findMany: (a: unknown) => Promise<Array<{ id: string; leadId: string }>>;
        update: (a: unknown) => Promise<unknown>;
        delete: (a: unknown) => Promise<unknown>;
      };
      const masterScore = await scoreModel.findMany({ where: { leadId: masterId } });
      const dupScores = await scoreModel.findMany({ where: { leadId: { in: duplicateIds } } });
      let masterHasScore = masterScore.length > 0;
      for (const row of dupScores) {
        if (masterHasScore) {
          await scoreModel.delete({ where: { id: row.id } });
        } else {
          await scoreModel.update({ where: { id: row.id }, data: { leadId: masterId } });
          masterHasScore = true;
        }
      }

      // Soft-delete the losers so they drop out of every list.
      await tx.lead.updateMany({ where: { tenantId, id: { in: duplicateIds } }, data: { deletedAt: new Date() } });

      // Merge-audit rows via the field-change log (parity with deal merge).
      await tx.fieldChangeLog.create({
        data: { tenantId, objectType: 'lead', objectId: masterId, fieldName: 'mergedFrom', oldValue: null, newValue: JSON.stringify(duplicateIds), changedBy: userId },
      });
      for (const dupId of duplicateIds) {
        await tx.fieldChangeLog.create({
          data: { tenantId, objectType: 'lead', objectId: dupId, fieldName: 'mergedInto', oldValue: null, newValue: masterId, changedBy: userId },
        });
      }

      if (groupId) {
        await tx.duplicateGroup.update({
          where: { id: groupId },
          data: { status: 'merged', masterRecordId: masterId, resolvedAt: new Date(), resolvedBy: userId },
        });
      }
    });

    if (producer) {
      const master = await p.lead.findFirst({ where: { id: masterId, tenantId } });
      await producer
        .publish(TOPICS.LEADS, {
          type: 'lead.updated',
          tenantId,
          payload: master
            ? { id: master.id, leadId: master.id, ownerId: master.ownerId, status: master.status, changedFields: ['merge'] }
            : { id: masterId, leadId: masterId },
        })
        .catch(() => undefined);
      for (const dupId of duplicateIds) {
        await producer
          .publish(TOPICS.LEADS, { type: 'lead.archived', tenantId, payload: { leadId: dupId, mergedIntoId: masterId, reason: 'merged' } })
          .catch(() => undefined);
      }
    }

    return { merged: duplicateIds.length, masterId };
  }

  /**
   * Resolve a unified merge's `fieldResolution` map ({ field: winnerId }) into a
   * concrete `{ field: value }` override object, reading each winner's value from
   * the involved records. System columns are never overwritable.
   */
  function resolveWinners(
    records: Array<Record<string, unknown> & { id: string }>,
    fieldResolution: Record<string, string> | undefined
  ): Record<string, unknown> {
    const byId = new Map(records.map((r) => [r.id, r]));
    const data: Record<string, unknown> = {};
    for (const [field, winnerId] of Object.entries(fieldResolution ?? {})) {
      if (PROTECTED_MERGE_FIELDS.has(field)) continue;
      const winner = byId.get(winnerId);
      if (winner && Object.prototype.hasOwnProperty.call(winner, field)) data[field] = winner[field];
    }
    return data;
  }

  function moduleSelect(module: DedupModule): Record<string, boolean> {
    const select: Record<string, boolean> = { id: true, tenantId: true };
    for (const f of MODULE_CONFIG[module].fields) select[f] = true;
    return select;
  }

  /**
   * Rule-driven duplicate detector. Loads the module's active {@link DuplicateRule}s
   * and its live records, then unions any two records a rule considers a match
   * (bounded pairwise window to keep CPU predictable). Returns the resulting
   * clusters (2+ ids) and, unless `persist` is false, replaces the module's OPEN
   * {@link DuplicateCandidate} rows with the fresh findings.
   */
  async function scanByRules(tenantId: string, module: DedupModule, persist = true, limit = 2000) {
    const cfg = MODULE_CONFIG[module];
    const rules = await p.duplicateRule.findMany({ where: { tenantId, module, isActive: true } }) as Array<{
      id: string; matchFields: string[]; matchType: string; threshold: number | null;
    }>;
    if (rules.length === 0) {
      if (persist) await p.duplicateCandidate.deleteMany({ where: { tenantId, module, status: 'OPEN' } });
      return { module, clusters: [] as Array<{ recordIds: string[]; score: number; ruleId: string | null }>, ruleCount: 0 };
    }

    const records = await p[cfg.model].findMany({
      where: { tenantId, ...cfg.where },
      select: moduleSelect(module),
      take: limit,
      orderBy: { createdAt: 'desc' },
    }) as Array<Record<string, unknown> & { id: string }>;

    // Union-find over record ids.
    const parent = new Map<string, string>();
    for (const r of records) parent.set(r.id, r.id);
    const find = (x: string): string => {
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root) as string;
      let cur = x;
      while (parent.get(cur) !== root) {
        const next = parent.get(cur) as string;
        parent.set(cur, root);
        cur = next;
      }
      return root;
    };
    const unite = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    // Best {score, ruleId} per matched unordered pair, for candidate metadata.
    const pairMeta: Array<{ a: string; b: string; score: number; ruleId: string }> = [];
    for (const rule of rules) {
      for (let i = 0; i < records.length; i += 1) {
        for (let j = i + 1; j < Math.min(records.length, i + 201); j += 1) {
          const m = ruleMatch(rule, records[i], records[j]);
          if (m) {
            unite(records[i].id, records[j].id);
            pairMeta.push({ a: records[i].id, b: records[j].id, score: m.score, ruleId: rule.id });
          }
        }
      }
    }

    // Assemble clusters from the union-find roots.
    const byRoot = new Map<string, string[]>();
    for (const r of records) {
      const root = find(r.id);
      const bucket = byRoot.get(root) ?? [];
      bucket.push(r.id);
      byRoot.set(root, bucket);
    }
    const clusters: Array<{ recordIds: string[]; score: number; ruleId: string | null }> = [];
    for (const ids of byRoot.values()) {
      if (ids.length < 2) continue;
      const idSet = new Set(ids);
      let best = 0;
      let bestRule: string | null = null;
      for (const pm of pairMeta) {
        if (idSet.has(pm.a) && idSet.has(pm.b) && pm.score >= best) {
          best = pm.score;
          bestRule = pm.ruleId;
        }
      }
      clusters.push({ recordIds: ids, score: best, ruleId: bestRule });
    }

    if (persist) {
      await p.duplicateCandidate.deleteMany({ where: { tenantId, module, status: 'OPEN' } });
      if (clusters.length > 0) {
        await p.duplicateCandidate.createMany({
          data: clusters.map((c) => ({ tenantId, module, recordIds: c.recordIds, ruleId: c.ruleId, score: c.score, status: 'OPEN' })),
        });
      }
    }

    return { module, clusters, ruleCount: rules.length };
  }

  /**
   * Create-time duplicate warn: returns the records that a module's active rules
   * consider a potential match for `recordData` (best score per record). Does not
   * persist — callers use it to warn before inserting a new record.
   */
  async function checkRecord(
    tenantId: string,
    module: DedupModule,
    recordData: Record<string, unknown>,
    limit = 2000
  ) {
    const cfg = MODULE_CONFIG[module];
    const rules = await p.duplicateRule.findMany({ where: { tenantId, module, isActive: true } }) as Array<{
      id: string; name: string; matchFields: string[]; matchType: string; threshold: number | null;
    }>;
    if (rules.length === 0) return [] as Array<{ recordId: string; score: number; ruleId: string; ruleName: string }>;

    const excludeId = typeof recordData.id === 'string' ? recordData.id : undefined;
    const records = await p[cfg.model].findMany({
      where: { tenantId, ...cfg.where, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: moduleSelect(module),
      take: limit,
      orderBy: { createdAt: 'desc' },
    }) as Array<Record<string, unknown> & { id: string }>;

    const best = new Map<string, { recordId: string; score: number; ruleId: string; ruleName: string }>();
    for (const rec of records) {
      for (const rule of rules) {
        const m = ruleMatch(rule, recordData, rec);
        if (m) {
          const prev = best.get(rec.id);
          if (!prev || m.score > prev.score) {
            best.set(rec.id, { recordId: rec.id, score: m.score, ruleId: rule.id, ruleName: rule.name });
          }
        }
      }
    }
    return [...best.values()].sort((x, y) => y.score - x.score);
  }

  /**
   * Unified merge dispatcher for the `POST /api/v1/:module/merge` route. Resolves
   * the `{ field: winnerId }` field-resolution against the involved records, then
   * delegates to the correct per-module id-list core (leads/contacts/accounts via
   * their *ByIds cores, deals via {@link mergeDeals}). Finally marks any OPEN
   * DuplicateCandidate cluster that referenced the collapsed ids as MERGED.
   */
  async function mergeByModule(
    tenantId: string,
    module: DedupModule,
    masterId: string,
    mergeIds: string[],
    fieldResolution: Record<string, string> | undefined,
    userId: string
  ) {
    const cfg = MODULE_CONFIG[module];
    const requested = [...new Set(mergeIds)].filter((id) => id && id !== masterId);
    if (requested.length === 0) throw new Error(`No ${module}s to merge`);

    const records = await p[cfg.model].findMany({
      where: { tenantId, id: { in: [masterId, ...requested] } },
      select: moduleSelect(module),
    }) as Array<Record<string, unknown> & { id: string }>;
    const mergedData = resolveWinners(records, fieldResolution);

    let result: { merged: number; masterId: string };
    switch (module) {
      case 'lead':
        result = await mergeLeadsByIds(tenantId, masterId, requested, mergedData, userId);
        break;
      case 'contact':
        result = await mergeContactsByIds(tenantId, masterId, requested, mergedData, userId);
        break;
      case 'account':
        result = await mergeAccountsByIds(tenantId, masterId, requested, mergedData, userId);
        break;
      case 'deal': {
        const fieldResolutions = Object.fromEntries(
          Object.entries(mergedData).map(([f, v]) => [f, { value: v }])
        ) as Record<string, { value?: unknown }>;
        const r = await mergeDeals(tenantId, masterId, requested, fieldResolutions, userId);
        result = { merged: r.merged, masterId };
        break;
      }
      default:
        throw new Error(`Unsupported module: ${module as string}`);
    }

    // Resolve any OPEN duplicate candidates that referenced the collapsed ids.
    try {
      await p.duplicateCandidate.updateMany({
        where: { tenantId, module, status: 'OPEN', recordIds: { hasSome: [masterId, ...requested] } },
        data: { status: 'MERGED' },
      });
    } catch {
      /* candidate resolution is best-effort — the merge itself already committed */
    }

    return { ...result, module };
  }

  return {
    runFullScan,
    runDealScan,
    scanContacts,
    scanAccounts,
    scanDeals,
    scanByRules,
    checkRecord,
    mergeContacts,
    mergeContactsByIds,
    mergeAccounts,
    mergeAccountsByIds,
    mergeLeadsByIds,
    mergeDeals,
    mergeDealsByGroup,
    mergeByModule,
  };
}
