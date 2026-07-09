import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async emailTemplates(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.emailTemplate.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.emailTemplateLoader.prime(item.id, item);
      return items.map(mapEmailTemplate);
    },
    async emailTemplate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.emailTemplateLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapEmailTemplate(item) : null;
    },
    async smsTemplates(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.smsTemplate.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.smsTemplateLoader.prime(item.id, item);
      return items.map(mapSmsTemplate);
    },
    async smsTemplate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.smsTemplateLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapSmsTemplate(item) : null;
    },
    async emailSequences(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.emailSequence.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.sequenceLoader.prime(item.id, item);
      return items.map(mapSequence);
    },
    async emailSequence(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.sequenceLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapSequence(item) : null;
    },
    async sequenceSteps(_parent: unknown, { sequenceId }: { sequenceId: string }, ctx: GraphQLContext) {
      return ctx.prisma.sequenceStep.findMany({ where: { sequenceId } });
    },
    async sequenceEnrollments(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.sequenceEnrollment.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.enrollmentLoader.prime(item.id, item);
      return items.map(mapEnrollment);
    },
    async sequenceEnrollment(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.enrollmentLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapEnrollment(item) : null;
    },
    async commOutbox(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.commOutbox.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.outboxLoader.prime(item.id, item);
      return items.map(mapOutbox);
    },
    async commOutboxItem(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.outboxLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapOutbox(item) : null;
    },
    async whatsAppMessages(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.whatsAppMessage.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.whatsAppLoader.prime(item.id, item);
      return items.map(mapWhatsApp);
    },
    async whatsAppMessage(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.whatsAppLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapWhatsApp(item) : null;
    },
  },
  Mutation: {
    async createEmailTemplate(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.emailTemplate.create({ data: input });
      ctx.loaders.emailTemplateLoader.prime(item.id, item);
      return mapEmailTemplate(item);
    },
    async updateEmailTemplate(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.emailTemplate.update({ where: { id }, data: input });
      ctx.loaders.emailTemplateLoader.clear(id).prime(id, item);
      return mapEmailTemplate(item);
    },
    async deleteEmailTemplate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.emailTemplate.delete({ where: { id } });
      ctx.loaders.emailTemplateLoader.clear(id);
      return true;
    },
    async createSmsTemplate(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.smsTemplate.create({ data: input });
      ctx.loaders.smsTemplateLoader.prime(item.id, item);
      return mapSmsTemplate(item);
    },
    async updateSmsTemplate(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.smsTemplate.update({ where: { id }, data: input });
      ctx.loaders.smsTemplateLoader.clear(id).prime(id, item);
      return mapSmsTemplate(item);
    },
    async deleteSmsTemplate(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.smsTemplate.delete({ where: { id } });
      ctx.loaders.smsTemplateLoader.clear(id);
      return true;
    },
    async createEmailSequence(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.emailSequence.create({ data: input });
      ctx.loaders.sequenceLoader.prime(item.id, item);
      return mapSequence(item);
    },
    async updateEmailSequence(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.emailSequence.update({ where: { id }, data: input });
      ctx.loaders.sequenceLoader.clear(id).prime(id, item);
      return mapSequence(item);
    },
    async deleteEmailSequence(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.emailSequence.delete({ where: { id } });
      ctx.loaders.sequenceLoader.clear(id);
      return true;
    },
    async createSequenceStep(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      return ctx.prisma.sequenceStep.create({ data: input });
    },
    async deleteSequenceStep(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.sequenceStep.delete({ where: { id } });
      return true;
    },
    async createSequenceEnrollment(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.sequenceEnrollment.create({ data: input });
      ctx.loaders.enrollmentLoader.prime(item.id, item);
      return mapEnrollment(item);
    },
    async updateSequenceEnrollment(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.sequenceEnrollment.update({ where: { id }, data: input });
      ctx.loaders.enrollmentLoader.clear(id).prime(id, item);
      return mapEnrollment(item);
    },
    async deleteSequenceEnrollment(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.sequenceEnrollment.delete({ where: { id } });
      ctx.loaders.enrollmentLoader.clear(id);
      return true;
    },
    async createCommOutbox(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.commOutbox.create({ data: input });
      ctx.loaders.outboxLoader.prime(item.id, item);
      return mapOutbox(item);
    },
    async updateCommOutbox(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.commOutbox.update({ where: { id }, data: input });
      ctx.loaders.outboxLoader.clear(id).prime(id, item);
      return mapOutbox(item);
    },
    async deleteCommOutbox(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.commOutbox.delete({ where: { id } });
      ctx.loaders.outboxLoader.clear(id);
      return true;
    },
    async createWhatsAppMessage(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.whatsAppMessage.create({ data: input });
      ctx.loaders.whatsAppLoader.prime(item.id, item);
      return mapWhatsApp(item);
    },
  },
  EmailSequence: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.sequenceLoader.load(reference.id);
      return item ? mapSequence(item) : null;
    },
    async steps(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.sequenceStep.findMany({ where: { sequenceId: parent.id } });
    },
    async enrollments(parent: any, _args: unknown, ctx: GraphQLContext) {
      const items = await ctx.prisma.sequenceEnrollment.findMany({ where: { sequenceId: parent.id } });
      return items.map(mapEnrollment);
    },
  },
  SequenceStep: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.stepLoader.load(reference.id);
    },
    async sequence(parent: any, _args: unknown, ctx: GraphQLContext) {
      const item = await ctx.loaders.sequenceLoader.load(parent.sequenceId);
      return item ? mapSequence(item) : null;
    },
  },
  SequenceEnrollment: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.enrollmentLoader.load(reference.id);
      return item ? mapEnrollment(item) : null;
    },
    async sequence(parent: any, _args: unknown, ctx: GraphQLContext) {
      const item = await ctx.loaders.sequenceLoader.load(parent.sequenceId);
      return item ? mapSequence(item) : null;
    },
  },
  CommOutbox: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.outboxLoader.load(reference.id);
      return item ? mapOutbox(item) : null;
    },
  },
  WhatsAppMessage: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.whatsAppLoader.load(reference.id);
      return item ? mapWhatsApp(item) : null;
    },
  },
};

function mapEmailTemplate(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapSmsTemplate(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapSequence(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}

function mapEnrollment(item: any) {
  return {
    ...item,
    enrolledAt: item.enrolledAt?.toISOString?.() ?? item.enrolledAt,
    nextSendAt: item.nextSendAt?.toISOString?.() ?? item.nextSendAt,
  };
}

function mapOutbox(item: any) {
  return {
    ...item,
    sentAt: item.sentAt?.toISOString?.() ?? item.sentAt,
    openedAt: item.openedAt?.toISOString?.() ?? item.openedAt,
    clickedAt: item.clickedAt?.toISOString?.() ?? item.clickedAt,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}

function mapWhatsApp(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
  };
}
