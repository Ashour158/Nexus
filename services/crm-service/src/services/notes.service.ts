import type { PaginatedResult } from '@nexus/shared-types';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { Note } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NoteListFilters {
  dealId?: string;
  contactId?: string;
  leadId?: string;
  accountId?: string;
  isPinned?: boolean;
  authorId?: string;
}

export interface CreateNoteData {
  content: string;
  dealId?: string;
  contactId?: string;
  leadId?: string;
  accountId?: string;
  isPinned?: boolean;
  authorId: string;
}

export interface UpdateNoteData {
  content?: string;
  isPinned?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildNoteWhere(
  tenantId: string,
  f: NoteListFilters
): Prisma.NoteWhereInput {
  const where: Prisma.NoteWhereInput = { tenantId };
  if (f.dealId) where.dealId = f.dealId;
  if (f.contactId) where.contactId = f.contactId;
  if (f.leadId) where.leadId = f.leadId;
  if (f.accountId) where.accountId = f.accountId;
  if (typeof f.isPinned === 'boolean') where.isPinned = f.isPinned;
  if (f.authorId) where.authorId = f.authorId;
  return where;
}

// ─── Service Factory ────────────────────────────────────────────────────────

/**
 * Notes service (Section 34.3). Notes are synchronous artifacts attached to
 * a deal / contact / lead / account and do not publish Kafka events.
 *
 * Authorship rules:
 * - Only the original `authorId` may edit the content.
 * - Hard-delete is permitted for the author; ADMIN-role delete is enforced
 *   at the route layer by passing `isAdmin=true` as `requestingUserId`
 *   short-circuit (see `notes.routes.ts`).
 */
export function createNotesService(prisma: CrmPrisma) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Note> {
    const row = await prisma.note.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Note', id);
    return row;
  }

  async function assertDealExists(tenantId: string, dealId: string) {
    const d = await prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      select: { id: true },
    });
    if (!d) throw new NotFoundError('Deal', dealId);
  }

  async function assertContactExists(tenantId: string, contactId: string) {
    const c = await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { id: true },
    });
    if (!c) throw new NotFoundError('Contact', contactId);
  }

  async function assertLeadExists(tenantId: string, leadId: string) {
    const l = await prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: { id: true },
    });
    if (!l) throw new NotFoundError('Lead', leadId);
  }

  async function assertAccountExists(tenantId: string, accountId: string) {
    const a = await prisma.account.findFirst({
      where: { id: accountId, tenantId },
      select: { id: true },
    });
    if (!a) throw new NotFoundError('Account', accountId);
  }

  return {
    async listNotes(
      tenantId: string,
      filters: NoteListFilters,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<Note>> {
      const where = buildNoteWhere(tenantId, filters);
      const { page, limit } = pagination;
      const [total, rows] = await Promise.all([
        prisma.note.count({ where }),
        prisma.note.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    async getNoteById(tenantId: string, id: string): Promise<Note> {
      return loadOrThrow(tenantId, id);
    },

    async createNote(tenantId: string, data: CreateNoteData): Promise<Note> {
      const hasParent = Boolean(
        data.dealId || data.contactId || data.leadId || data.accountId
      );
      if (!hasParent) {
        throw new BusinessRuleError(
          'Note must reference at least one of deal/contact/lead/account'
        );
      }

      const checks: Promise<void>[] = [];
      if (data.dealId) checks.push(assertDealExists(tenantId, data.dealId));
      if (data.contactId)
        checks.push(assertContactExists(tenantId, data.contactId));
      if (data.leadId) checks.push(assertLeadExists(tenantId, data.leadId));
      if (data.accountId)
        checks.push(assertAccountExists(tenantId, data.accountId));
      await Promise.all(checks);

      return prisma.note.create({
        data: {
          tenantId,
          authorId: data.authorId,
          content: data.content,
          isPinned: data.isPinned ?? false,
          dealId: data.dealId ?? null,
          contactId: data.contactId ?? null,
          leadId: data.leadId ?? null,
          accountId: data.accountId ?? null,
        },
      });
    },

    async updateNote(
      tenantId: string,
      id: string,
      data: UpdateNoteData,
      requestingUserId: string
    ): Promise<Note> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.authorId !== requestingUserId) {
        throw new BusinessRuleError('Only the author can edit this note');
      }
      const updateData: Prisma.NoteUpdateInput = {};
      if (data.content !== undefined) updateData.content = data.content;
      if (data.isPinned !== undefined) updateData.isPinned = data.isPinned;
      return prisma.note.update({ where: { id }, data: updateData });
    },

    /**
     * Hard-deletes a note. The `requestingUserId` must match the note's
     * author — callers may pass `null`-equivalent semantics via
     * `skipAuthorCheck` when the caller has been verified to hold the
     * admin role at the route layer.
     */
    async deleteNote(
      tenantId: string,
      id: string,
      requestingUserId: string,
      options: { skipAuthorCheck?: boolean } = {}
    ): Promise<void> {
      const existing = await loadOrThrow(tenantId, id);
      if (!options.skipAuthorCheck && existing.authorId !== requestingUserId) {
        throw new ForbiddenError(
          'Only the author or an admin can delete this note'
        );
      }
      await prisma.note.delete({ where: { id } });
    },

    async pinNote(tenantId: string, id: string): Promise<Note> {
      await loadOrThrow(tenantId, id);
      return prisma.note.update({ where: { id }, data: { isPinned: true } });
    },

    async unpinNote(tenantId: string, id: string): Promise<Note> {
      await loadOrThrow(tenantId, id);
      return prisma.note.update({ where: { id }, data: { isPinned: false } });
    },

    async listNotesForDeal(
      tenantId: string,
      dealId: string,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<Note>> {
      await assertDealExists(tenantId, dealId);
      const { page, limit } = pagination;
      const where: Prisma.NoteWhereInput = { tenantId, dealId };
      const [total, rows] = await Promise.all([
        prisma.note.count({ where }),
        prisma.note.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    async listNotesForContact(
      tenantId: string,
      contactId: string,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<Note>> {
      await assertContactExists(tenantId, contactId);
      const { page, limit } = pagination;
      const where: Prisma.NoteWhereInput = { tenantId, contactId };
      const [total, rows] = await Promise.all([
        prisma.note.count({ where }),
        prisma.note.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },

    async listNotesForLead(
      tenantId: string,
      leadId: string,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<Note>> {
      await assertLeadExists(tenantId, leadId);
      const { page, limit } = pagination;
      const where: Prisma.NoteWhereInput = { tenantId, leadId };
      const [total, rows] = await Promise.all([
        prisma.note.count({ where }),
        prisma.note.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        }),
      ]);
      return toPaginatedResult(rows, total, page, limit);
    },
  };
}

export type NotesService = ReturnType<typeof createNotesService>;
