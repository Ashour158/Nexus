import { NotFoundError } from '@nexus/service-utils';
import type { NotificationPrisma } from '../prisma.js';
import type {
  Notification,
  Prisma,
} from '../../../../node_modules/.prisma/notification-client/index.js';

/**
 * Notifications service — reads and mutations for the in-app inbox.
 *
 * Every query is scoped by `tenantId` + `userId` so one tenant's notifications
 * never leak into another's inbox.
 */

export interface NotificationListFilters {
  isRead?: boolean;
  type?: string;
  entityType?: string;
  entityId?: string;
}

export interface NotificationListPagination {
  page: number;
  limit: number;
}

export interface PaginatedNotifications {
  data: Notification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function createNotificationsService(prisma: NotificationPrisma) {
  return {
    async listNotifications(
      tenantId: string,
      userId: string,
      filters: NotificationListFilters,
      pagination: NotificationListPagination
    ): Promise<PaginatedNotifications> {
      const where: Prisma.NotificationWhereInput = {
        tenantId,
        userId,
        ...(filters.isRead !== undefined ? { isRead: filters.isRead } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.entityType ? { entityType: filters.entityType } : {}),
        ...(filters.entityId ? { entityId: filters.entityId } : {}),
      };
      const page = Math.max(1, pagination.page);
      const limit = Math.min(100, Math.max(1, pagination.limit));
      const skip = (page - 1) * limit;
      const [total, rows] = await prisma.$transaction([
        prisma.notification.count({ where }),
        prisma.notification.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
        }),
      ]);
      const totalPages = Math.max(1, Math.ceil(total / limit));
      return {
        data: rows,
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      };
    },

    async getUnreadCount(tenantId: string, userId: string): Promise<number> {
      return prisma.notification.count({
        where: { tenantId, userId, isRead: false },
      });
    },

    async markAsRead(
      tenantId: string,
      userId: string,
      id: string
    ): Promise<Notification> {
      const existing = await prisma.notification.findFirst({
        where: { id, tenantId, userId },
      });
      if (!existing) throw new NotFoundError('Notification', id);
      if (existing.isRead) return existing;
      return prisma.notification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      });
    },

    async markAllRead(
      tenantId: string,
      userId: string
    ): Promise<{ count: number }> {
      const res = await prisma.notification.updateMany({
        where: { tenantId, userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      return { count: res.count };
    },

    async deleteNotification(
      tenantId: string,
      userId: string,
      id: string
    ): Promise<void> {
      const existing = await prisma.notification.findFirst({
        where: { id, tenantId, userId },
      });
      if (!existing) throw new NotFoundError('Notification', id);
      await prisma.notification.delete({ where: { id } });
    },
  };
}

export type NotificationsService = ReturnType<
  typeof createNotificationsService
>;
