import type { CrmPrisma } from '../prisma.js';

export interface AttachmentMeta {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
}

export function createAttachmentsService(prisma: CrmPrisma) {
  return {
    async listAttachments(tenantId: string, module: string, recordId: string) {
      return prisma.attachment.findMany({
        where: { tenantId, module, recordId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async deleteAttachment(tenantId: string, id: string) {
      const item = await prisma.attachment.findFirst({ where: { id, tenantId } });
      if (!item) return null;
      return prisma.attachment.delete({ where: { id } });
    },

    async createAttachment(
      tenantId: string,
      module: string,
      recordId: string,
      meta: AttachmentMeta,
      uploadedBy: string
    ) {
      return prisma.attachment.create({
        data: {
          tenantId,
          module,
          recordId,
          fileName: meta.fileName,
          fileSize: meta.fileSize,
          mimeType: meta.mimeType,
          storageKey: meta.storageKey,
          uploadedBy,
        },
      });
    },
  };
}
