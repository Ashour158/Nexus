import type { PrismaClient } from '@prisma/client';

export interface DataExportRequest {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
}

export interface GdprExportResult {
  tenantId: string;
  userId: string;
  user: Record<string, unknown>;
  contacts: Record<string, unknown>[];
  deals: Record<string, unknown>[];
  activities: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  customFieldValues: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  exportedAt: string;
  format: 'json';
}

export class GdprDataExporter {
  constructor(private prisma: PrismaClient) {}

  async exportUserData(tenantId: string, userId: string): Promise<GdprExportResult> {
    const [
      user,
      contacts,
      deals,
      activities,
      notes,
      tasks,
      customFieldValues,
      auditLogs,
    ] = await Promise.all([
      this.prisma.user.findFirst({ where: { tenantId, id: userId } }),
      this.prisma.contact.findMany({ where: { tenantId, ownerId: userId }, take: 10000 }),
      this.prisma.deal.findMany({ where: { tenantId, ownerId: userId }, take: 10000 }),
      this.prisma.activity.findMany({ where: { tenantId, ownerId: userId }, take: 10000 }),
      this.prisma.note.findMany({ where: { tenantId, authorId: userId }, take: 10000 }),
      this.prisma.task.findMany({ where: { tenantId, assigneeId: userId }, take: 10000 }),
      this.prisma.customFieldValue.findMany({ where: { tenantId }, take: 10000 }),
      this.prisma.auditLog.findMany({ where: { tenantId, userId }, take: 10000 }),
    ]);

    return {
      tenantId,
      userId,
      user: this.redactSensitive(user),
      contacts: contacts.map((c: Record<string, unknown>) => this.redactSensitive(c)),
      deals: deals.map((d: Record<string, unknown>) => this.redactSensitive(d)),
      activities: activities.map((a: Record<string, unknown>) => this.redactSensitive(a)),
      notes: notes.map((n: Record<string, unknown>) => this.redactSensitive(n)),
      tasks: tasks.map((t: Record<string, unknown>) => this.redactSensitive(t)),
      customFieldValues: customFieldValues.map((v: Record<string, unknown>) => this.redactSensitive(v)),
      auditLogs: auditLogs.map((a: Record<string, unknown>) => this.redactSensitive(a)),
      exportedAt: new Date().toISOString(),
      format: 'json',
    };
  }

  async deleteUserData(tenantId: string, userId: string): Promise<{ deleted: number; entities: Record<string, number> }> {
    const results: Record<string, number> = {};

    const [notesDel, tasksDel, activitiesDel] = await Promise.all([
      this.prisma.note.deleteMany({ where: { tenantId, authorId: userId } }).then((r: { count: number }) => r.count),
      this.prisma.task.deleteMany({ where: { tenantId, assigneeId: userId } }).then((r: { count: number }) => r.count),
      this.prisma.activity.deleteMany({ where: { tenantId, ownerId: userId } }).then((r: { count: number }) => r.count),
    ]);

    results.notes = notesDel;
    results.tasks = tasksDel;
    results.activities = activitiesDel;

    // Reassign contacts and deals to system user instead of deleting (business records)
    const [contactsUpd, dealsUpd] = await Promise.all([
      this.prisma.contact.updateMany({
        where: { tenantId, ownerId: userId },
        data: { ownerId: null },
      }).then((r: { count: number }) => r.count),
      this.prisma.deal.updateMany({
        where: { tenantId, ownerId: userId },
        data: { ownerId: null },
      }).then((r: { count: number }) => r.count),
    ]);

    results.contactsReassigned = contactsUpd;
    results.dealsReassigned = dealsUpd;

    // Soft-delete the user record (hard delete would break referential integrity)
    await this.prisma.user.updateMany({
      where: { tenantId, id: userId },
      data: { email: `deleted-${userId}@anonymized.local`, firstName: 'Deleted', lastName: 'User', active: false },
    });
    results.userAnonymized = 1;

    const total = notesDel + tasksDel + activitiesDel + contactsUpd + dealsUpd + 1;
    return { deleted: total, entities: results };
  }

  async anonymizeUserData(tenantId: string, userId: string): Promise<{ anonymized: number; entities: Record<string, number> }> {
    const results: Record<string, number> = {};

    // Anonymize user record
    const userUpd = await this.prisma.user.updateMany({
      where: { tenantId, id: userId },
      data: {
        email: `anonymized-${userId}@anonymized.local`,
        firstName: 'Anonymized',
        lastName: 'User',
        phone: null,
        avatar: null,
      },
    });
    results.user = userUpd.count;

    // Anonymize contacts owned by user
    const contactsUpd = await this.prisma.contact.updateMany({
      where: { tenantId, ownerId: userId },
      data: {
        email: null,
        phone: null,
        mobile: null,
        address: null,
        city: null,
        state: null,
        zip: null,
      },
    });
    results.contacts = contactsUpd.count;

    // Anonymize notes authored by user
    const notesUpd = await this.prisma.note.updateMany({
      where: { tenantId, authorId: userId },
      data: { content: '[Anonymized]' },
    });
    results.notes = notesUpd.count;

    const total = userUpd.count + contactsUpd.count + notesUpd.count;
    return { anonymized: total, entities: results };
  }

  /**
   * Redact sensitive fields from an exported record.
   * Removes internal IDs, tokens, and hashes that should not be portable.
   */
  private redactSensitive<T extends Record<string, unknown>>(record: T | null): Record<string, unknown> {
    if (!record) return {};
    const sensitiveKeys = ['passwordHash', 'apiKey', 'secret', 'token', 'refreshToken', 'keycloakId'];
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (sensitiveKeys.includes(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
