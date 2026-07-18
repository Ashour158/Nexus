import DataLoader from 'dataloader';
import type { CommPrisma } from '../prisma.js';

export interface GraphQLContext {
  prisma: CommPrisma;
  tenantId: string | null;
  userId: string | null;
  loaders: {
    emailTemplateLoader: DataLoader<string, any>;
    smsTemplateLoader: DataLoader<string, any>;
    sequenceLoader: DataLoader<string, any>;
    stepLoader: DataLoader<string, any>;
    enrollmentLoader: DataLoader<string, any>;
    outboxLoader: DataLoader<string, any>;
    whatsAppLoader: DataLoader<string, any>;
  };
}

function createLoaders(prisma: CommPrisma) {
  const emailTemplateLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.emailTemplate.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const smsTemplateLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.smsTemplate.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const sequenceLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.emailSequence.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const stepLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.sequenceStep.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const enrollmentLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.sequenceEnrollment.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const outboxLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.commOutbox.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  const whatsAppLoader = new DataLoader<string, any>(async (ids) => {
    const items = await prisma.whatsAppMessage.findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((i: any) => [i.id, i]));
    return ids.map((id) => map.get(id) ?? null);
  });
  return { emailTemplateLoader, smsTemplateLoader, sequenceLoader, stepLoader, enrollmentLoader, outboxLoader, whatsAppLoader };
}

export function buildContext(prisma: CommPrisma) {
  return async function createContext({ request }: { request: Request }): Promise<GraphQLContext> {
    let tenantId: string | null = request.headers.get('x-tenant-id');
    let userId: string | null = null;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = JSON.parse(Buffer.from(authHeader.split('.')[1], 'base64').toString());
        tenantId = payload.tenantId ?? tenantId;
        userId = payload.sub ?? null;
      } catch { /* ignore */ }
    }
    return { prisma, tenantId, userId, loaders: createLoaders(prisma) };
  };
}
