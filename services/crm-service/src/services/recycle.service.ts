import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';

/**
 * ─── Unified Recycle Bin ─────────────────────────────────────────────────────
 *
 * CRM records across the four core modules — leads, contacts, accounts, deals —
 * are SOFT-deleted by stamping `deletedAt` (contacts also flip `isActive=false`,
 * deals bump `version`). Each module already owns its own archive/restore
 * lifecycle + event emission; this service is the single, tenant-scoped surface
 * that reads those four tables UNIFORMLY so recovery is one screen, not four.
 *
 * It never re-implements per-module delete/restore semantics: RESTORE delegates
 * to the module's own restore method (which re-emits `*.restored` and keeps
 * relations intact), so behavior stays identical to the per-module restore
 * endpoints. The bin adds three things on top: a merged cross-module LIST, an
 * admin-only PERMANENT (hard) delete, and an admin-only retention PURGE.
 */

export type RecycleModule = 'leads' | 'contacts' | 'accounts' | 'deals';

export const RECYCLE_MODULES: RecycleModule[] = ['leads', 'contacts', 'accounts', 'deals'];

export function isRecycleModule(v: string): v is RecycleModule {
  return (RECYCLE_MODULES as string[]).includes(v);
}

export interface RecycleBinItem {
  module: RecycleModule;
  id: string;
  label: string;
  ownerId: string | null;
  deletedAt: Date;
  deletedBy: string | null;
  deletedByName: string | null;
}

export interface RecycleBinPage {
  items: RecycleBinItem[];
  total: number;
  page: number;
  pageSize: number;
  countsByModule: Record<RecycleModule, number>;
}

/** A per-module restore delegate — the module service's own `restore*` method. */
export type ModuleRestorer = (tenantId: string, id: string) => Promise<unknown>;

export interface RecycleServiceDeps {
  prisma: CrmPrisma;
  restorers: Record<RecycleModule, ModuleRestorer>;
}

// ─── Per-module adapters ──────────────────────────────────────────────────────
// Each module maps to its Prisma delegate, the columns needed to build a preview
// label, a label builder, and the free-text search fields for `q`.

type RawRow = Record<string, unknown>;

interface ModuleAdapter {
  delegate: (prisma: CrmPrisma) => {
    findMany: (args: unknown) => Promise<RawRow[]>;
    count: (args: unknown) => Promise<number>;
    delete: (args: unknown) => Promise<unknown>;
  };
  /** Columns to select for list rows (in addition to the shared soft-delete cols). */
  select: Record<string, true>;
  /** Build the human preview label from a raw row. */
  label: (row: RawRow) => string;
  /** Fields the `q` free-text filter matches against (case-insensitive contains). */
  searchFields: string[];
}

const SHARED_SELECT = {
  id: true,
  ownerId: true,
  deletedAt: true,
  deletedBy: true,
  deletedByName: true,
} as const;

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

const ADAPTERS: Record<RecycleModule, ModuleAdapter> = {
  leads: {
    delegate: (p) => p.lead as never,
    select: { firstName: true, lastName: true, company: true, email: true },
    label: (r) => {
      const name = `${str(r.firstName)} ${str(r.lastName)}`.trim();
      const company = str(r.company);
      return company ? `${name || '(no name)'} — ${company}` : name || str(r.email) || '(untitled lead)';
    },
    searchFields: ['firstName', 'lastName', 'company', 'email'],
  },
  contacts: {
    delegate: (p) => p.contact as never,
    select: { firstName: true, lastName: true, email: true },
    label: (r) => `${str(r.firstName)} ${str(r.lastName)}`.trim() || str(r.email) || '(untitled contact)',
    searchFields: ['firstName', 'lastName', 'email'],
  },
  accounts: {
    delegate: (p) => p.account as never,
    select: { name: true, code: true },
    label: (r) => str(r.name) || str(r.code) || '(untitled account)',
    searchFields: ['name', 'code'],
  },
  deals: {
    delegate: (p) => p.deal as never,
    select: { name: true },
    label: (r) => str(r.name) || '(untitled deal)',
    searchFields: ['name'],
  },
};

function whereForModule(module: RecycleModule, tenantId: string, q?: string): Record<string, unknown> {
  const base: Record<string, unknown> = { tenantId, deletedAt: { not: null } };
  const query = q?.trim();
  if (query) {
    base.OR = ADAPTERS[module].searchFields.map((f) => ({
      [f]: { contains: query, mode: 'insensitive' },
    }));
  }
  return base;
}

function toItem(module: RecycleModule, row: RawRow): RecycleBinItem {
  return {
    module,
    id: str(row.id),
    label: ADAPTERS[module].label(row),
    ownerId: (row.ownerId as string | null) ?? null,
    deletedAt: row.deletedAt as Date,
    deletedBy: (row.deletedBy as string | null) ?? null,
    deletedByName: (row.deletedByName as string | null) ?? null,
  };
}

export function createRecycleService(deps: RecycleServiceDeps) {
  const { prisma } = deps;

  /**
   * Resolve missing `deletedByName` values for a page of items from the `User`
   * table (best-effort — a lookup miss just leaves the name null).
   */
  async function hydrateDeleterNames(tenantId: string, items: RecycleBinItem[]): Promise<void> {
    const missing = [...new Set(items.filter((i) => !i.deletedByName && i.deletedBy).map((i) => i.deletedBy as string))];
    if (missing.length === 0) return;
    try {
      const users = await prisma.user.findMany({
        where: { tenantId, id: { in: missing } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      const byId = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]));
      for (const item of items) {
        if (!item.deletedByName && item.deletedBy) {
          item.deletedByName = byId.get(item.deletedBy) ?? null;
        }
      }
    } catch {
      /* best-effort — never fail the list on a name-resolution error */
    }
  }

  /**
   * Cross-module list of soft-deleted records, newest-deleted first. When
   * `module` is given the query hits a single table (true SQL pagination);
   * otherwise the four tables are merged: we pull the top `page*pageSize` from
   * each (bounded), sort by `deletedAt` desc, then slice the requested page.
   * `total` and `countsByModule` are always exact via per-table counts.
   */
  async function list(
    tenantId: string,
    opts: { module?: RecycleModule; q?: string; page?: number; pageSize?: number } = {}
  ): Promise<RecycleBinPage> {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 25)));
    const modules = opts.module ? [opts.module] : RECYCLE_MODULES;

    const counts = await Promise.all(
      modules.map((m) => ADAPTERS[m].delegate(prisma).count({ where: whereForModule(m, tenantId, opts.q) }))
    );
    const countsByModule = RECYCLE_MODULES.reduce((acc, m) => {
      acc[m] = 0;
      return acc;
    }, {} as Record<RecycleModule, number>);
    modules.forEach((m, i) => {
      countsByModule[m] = counts[i] ?? 0;
    });
    const total = counts.reduce((a, b) => a + b, 0);

    let items: RecycleBinItem[];
    if (opts.module) {
      const rows = await ADAPTERS[opts.module].delegate(prisma).findMany({
        where: whereForModule(opts.module, tenantId, opts.q),
        select: { ...SHARED_SELECT, ...ADAPTERS[opts.module].select },
        orderBy: { deletedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      items = rows.map((r) => toItem(opts.module as RecycleModule, r));
    } else {
      // Merge across modules: fetch enough from each to cover the requested page.
      const perTable = page * pageSize;
      const grouped = await Promise.all(
        RECYCLE_MODULES.map(async (m) => {
          const rows = await ADAPTERS[m].delegate(prisma).findMany({
            where: whereForModule(m, tenantId, opts.q),
            select: { ...SHARED_SELECT, ...ADAPTERS[m].select },
            orderBy: { deletedAt: 'desc' },
            take: perTable,
          });
          return rows.map((r) => toItem(m, r));
        })
      );
      const merged = grouped.flat().sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
      items = merged.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    }

    await hydrateDeleterNames(tenantId, items);
    return { items, total, page, pageSize, countsByModule };
  }

  /** Assert the record exists in-tenant and is currently soft-deleted. */
  async function loadDeletedOrThrow(module: RecycleModule, tenantId: string, id: string): Promise<RawRow> {
    const row = await ADAPTERS[module].delegate(prisma).findMany({
      where: { id, tenantId, deletedAt: { not: null } },
      select: { ...SHARED_SELECT, ...ADAPTERS[module].select },
      take: 1,
    });
    if (row.length === 0) throw new NotFoundError(`Recycle-bin ${module}`, id);
    return row[0] as RawRow;
  }

  /**
   * Restore (un-delete) a soft-deleted record by delegating to the module's own
   * restore method, which clears `deletedAt`/`deletedBy`, re-emits the
   * `*.restored` event, and keeps the record's relations intact. For accounts we
   * additionally revive any child contacts/deals that are still soft-deleted, so
   * a parent-with-children delete round-trips cleanly. Returns the restored
   * record.
   */
  async function restore(module: RecycleModule, tenantId: string, id: string): Promise<unknown> {
    await loadDeletedOrThrow(module, tenantId, id);
    const restored = await deps.restorers[module](tenantId, id);
    if (module === 'accounts') {
      await restoreReparentedChildren(tenantId, id).catch(() => undefined);
    }
    return restored;
  }

  /**
   * Best-effort revival of an account's still-soft-deleted child contacts/deals
   * when the account itself is restored. Scoped strictly to children of THIS
   * account (never independently deleted rows elsewhere). Fail-open — a failure
   * here never undoes the account restore.
   */
  async function restoreReparentedChildren(tenantId: string, accountId: string): Promise<void> {
    const childWhere = { tenantId, accountId, deletedAt: { not: null } } as Record<string, unknown>;
    await Promise.all([
      prisma.contact.updateMany({ where: childWhere, data: { deletedAt: null, isActive: true, deletedBy: null, deletedByName: null } }),
      prisma.deal.updateMany({ where: childWhere, data: { deletedAt: null, deletedBy: null, deletedByName: null } }),
    ]);
  }

  /**
   * PERMANENT (hard) delete of a soft-deleted record. Admin-gated at the route.
   * Refuses to hard-delete a record that is NOT already soft-deleted (the bin
   * only ever exposes soft-deleted rows). On a foreign-key violation (dependent
   * children still reference the row) we surface a clean 409 rather than a raw
   * Prisma error.
   */
  async function hardDelete(module: RecycleModule, tenantId: string, id: string): Promise<{ id: string; module: RecycleModule; purged: true }> {
    await loadDeletedOrThrow(module, tenantId, id);
    try {
      await ADAPTERS[module].delegate(prisma).delete({ where: { id } });
    } catch (err) {
      throw new BusinessRuleError(
        `Cannot permanently delete this ${module.slice(0, -1)} while dependent records still reference it. Remove or reassign them first.`
      );
    }
    return { id, module, purged: true };
  }

  /**
   * Retention PURGE — admin-gated hard delete of every record soft-deleted more
   * than `olderThanDays` ago (optionally within a single module). Deletes
   * per-record with try/catch so a single FK-blocked row is skipped rather than
   * aborting the whole purge. NEVER runs automatically — only on this explicit
   * admin call. Returns per-module purged/skipped counts.
   */
  async function purge(
    tenantId: string,
    opts: { olderThanDays: number; module?: RecycleModule }
  ): Promise<{ cutoff: string; purged: number; skipped: number; byModule: Record<string, { purged: number; skipped: number }> }> {
    const days = Math.max(0, Math.floor(opts.olderThanDays));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Children before parents to minimise avoidable FK skips.
    const order: RecycleModule[] = opts.module ? [opts.module] : ['deals', 'leads', 'contacts', 'accounts'];

    const byModule: Record<string, { purged: number; skipped: number }> = {};
    let purged = 0;
    let skipped = 0;

    for (const m of order) {
      const rows = await ADAPTERS[m].delegate(prisma).findMany({
        where: { tenantId, deletedAt: { not: null, lt: cutoff } },
        select: { id: true },
        take: 5000,
      });
      let p = 0;
      let s = 0;
      for (const row of rows) {
        try {
          await ADAPTERS[m].delegate(prisma).delete({ where: { id: str(row.id) } });
          p += 1;
        } catch {
          s += 1; // FK-blocked or already gone — skip, keep going.
        }
      }
      byModule[m] = { purged: p, skipped: s };
      purged += p;
      skipped += s;
    }

    return { cutoff: cutoff.toISOString(), purged, skipped, byModule };
  }

  return { list, restore, hardDelete, purge };
}

export type RecycleService = ReturnType<typeof createRecycleService>;
