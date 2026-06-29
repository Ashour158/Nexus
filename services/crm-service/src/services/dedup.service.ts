import type { CrmPrisma } from '../prisma.js';

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

export function createDedupService(prisma: CrmPrisma) {
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

  async function persistGroups(
    tenantId: string,
    entityType: 'contact' | 'account',
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
    const [contactGroups, accountGroups] = await Promise.all([scanContacts(tenantId), scanAccounts(tenantId)]);
    const [contactCount, accountCount] = await Promise.all([
      persistGroups(tenantId, 'contact', contactGroups),
      persistGroups(tenantId, 'account', accountGroups),
    ]);
    return { contacts: { groups: contactCount }, accounts: { groups: accountCount } };
  }

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

    const duplicateIds = group.records.map((r: { recordId: string }) => r.recordId).filter((id: string) => id !== masterId);

    await p.contact.update({ where: { id: masterId }, data: mergedData });
    await p.activity.updateMany({ where: { contactId: { in: duplicateIds } }, data: { contactId: masterId } });
    await p.note.updateMany({ where: { contactId: { in: duplicateIds } }, data: { contactId: masterId } });
    await p.contact.updateMany({ where: { id: { in: duplicateIds } }, data: { isActive: false } });
    await p.duplicateGroup.update({
      where: { id: groupId },
      data: { status: 'merged', masterRecordId: masterId, resolvedAt: new Date(), resolvedBy: userId },
    });

    return { merged: duplicateIds.length, masterId };
  }

  return { runFullScan, scanContacts, scanAccounts, mergeContacts };
}
