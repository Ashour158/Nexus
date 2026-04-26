import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '@nexus/service-utils';
import { createNotesService } from '../notes.service.js';

const TENANT = 'tenant_1';

function buildPrismaMock() {
  return {
    note: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    deal: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
    lead: { findFirst: vi.fn() },
    account: { findFirst: vi.fn() },
  };
}

function makeNote(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'note_1',
    tenantId: TENANT,
    authorId: 'user_1',
    content: 'Hello',
    isPinned: false,
    dealId: 'deal_1',
    contactId: null,
    leadId: null,
    accountId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

describe('createNotesService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: ReturnType<typeof createNotesService>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = createNotesService(prisma as never);
  });

  describe('createNote', () => {
    it('throws BusinessRuleError when no entity reference provided', async () => {
      await expect(
        service.createNote(TENANT, {
          content: 'x',
          authorId: 'user_1',
        })
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('throws NotFoundError when dealId not in tenant', async () => {
      prisma.deal.findFirst.mockResolvedValue(null);
      await expect(
        service.createNote(TENANT, {
          content: 'x',
          authorId: 'user_1',
          dealId: 'missing',
        })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('creates note linked to deal with authorId set', async () => {
      prisma.deal.findFirst.mockResolvedValue({ id: 'deal_1' });
      prisma.note.create.mockResolvedValue(makeNote());
      const row = await service.createNote(TENANT, {
        content: 'Hello',
        authorId: 'user_1',
        dealId: 'deal_1',
      });
      expect(row.dealId).toBe('deal_1');
      expect(prisma.note.create).toHaveBeenCalled();
    });
  });

  describe('updateNote', () => {
    it('throws BusinessRuleError when requestingUserId !== note.authorId', async () => {
      prisma.note.findFirst.mockResolvedValue(makeNote({ authorId: 'user_1' }));
      await expect(
        service.updateNote(TENANT, 'note_1', { content: 'y' }, 'user_2')
      ).rejects.toBeInstanceOf(BusinessRuleError);
    });

    it('allows update when requestingUserId === note.authorId', async () => {
      prisma.note.findFirst.mockResolvedValue(makeNote({ authorId: 'user_1' }));
      prisma.note.update.mockResolvedValue(makeNote({ content: 'y' }));
      const row = await service.updateNote(TENANT, 'note_1', { content: 'y' }, 'user_1');
      expect(row.content).toBe('y');
    });
  });

  describe('deleteNote', () => {
    it('hard-deletes the note row', async () => {
      prisma.note.findFirst.mockResolvedValue(makeNote({ authorId: 'user_1' }));
      await service.deleteNote(TENANT, 'note_1', 'user_1');
      expect(prisma.note.delete).toHaveBeenCalledWith({ where: { id: 'note_1' } });
    });

    it('throws ForbiddenError when non-author non-admin attempts delete', async () => {
      prisma.note.findFirst.mockResolvedValue(makeNote({ authorId: 'user_1' }));
      await expect(service.deleteNote(TENANT, 'note_1', 'user_2')).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });
  });

  describe('listNotesForDeal', () => {
    it('returns pinned notes first', async () => {
      prisma.deal.findFirst.mockResolvedValue({ id: 'deal_1' });
      prisma.note.count.mockResolvedValue(2);
      prisma.note.findMany.mockResolvedValue([
        makeNote({ id: 'p1', isPinned: true }),
        makeNote({ id: 'p2', isPinned: false }),
      ]);
      const result = await service.listNotesForDeal(TENANT, 'deal_1', { page: 1, limit: 10 });
      expect(result.data[0].isPinned).toBe(true);
    });

    it('verifies deal belongs to tenant before returning notes', async () => {
      prisma.deal.findFirst.mockResolvedValue(null);
      await expect(service.listNotesForDeal(TENANT, 'bad', { page: 1, limit: 10 })).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });
});
