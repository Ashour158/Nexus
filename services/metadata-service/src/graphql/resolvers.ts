import type { GraphQLContext } from './context.js';

export const resolvers = {
  Query: {
    async customFieldDefinitions(_parent: unknown, { limit = 20, offset = 0, entityType }: { limit?: number; offset?: number; entityType?: string }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (entityType) where.entityType = entityType;
      const items = await ctx.prisma.customFieldDefinition.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.fieldDefLoader.prime(item.id, item);
      return items.map(mapFieldDef);
    },
    async customFieldDefinition(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.fieldDefLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapFieldDef(item) : null;
    },
    async fieldPermissions(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.fieldPermission.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.permissionLoader.prime(item.id, item);
      return items;
    },
    async fieldPermission(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.permissionLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item;
    },
    async validationRules(_parent: unknown, { limit = 20, offset = 0, objectType }: { limit?: number; offset?: number; objectType?: string }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (objectType) where.objectType = objectType;
      const items = await ctx.prisma.validationRule.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.ruleLoader.prime(item.id, item);
      return items;
    },
    async validationRule(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.ruleLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item;
    },
    async fieldChangeLogs(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.fieldChangeLog.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.changeLogLoader.prime(item.id, item);
      return items.map(mapChangeLog);
    },
    async fieldChangeLog(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.changeLogLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapChangeLog(item) : null;
    },
    async duplicateGroups(_parent: unknown, { limit = 20, offset = 0 }: { limit?: number; offset?: number }, ctx: GraphQLContext) {
      const where = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      const items = await ctx.prisma.duplicateGroup.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.dupGroupLoader.prime(item.id, item);
      return items.map(mapDupGroup);
    },
    async duplicateGroup(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.dupGroupLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapDupGroup(item) : null;
    },
    async tags(_parent: unknown, { limit = 20, offset = 0, entityType }: { limit?: number; offset?: number; entityType?: string }, ctx: GraphQLContext) {
      const where: any = ctx.tenantId ? { tenantId: ctx.tenantId } : {};
      if (entityType) where.entityType = entityType;
      const items = await ctx.prisma.tag.findMany({ where, take: Math.min(limit, 100), skip: offset });
      for (const item of items) ctx.loaders.tagLoader.prime(item.id, item);
      return items.map(mapTag);
    },
    async tag(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.tagLoader.load(id);
      if (ctx.tenantId && item?.tenantId !== ctx.tenantId) return null;
      return item ? mapTag(item) : null;
    },
  },
  Mutation: {
    async createCustomFieldDefinition(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.customFieldDefinition.create({ data: input });
      ctx.loaders.fieldDefLoader.prime(item.id, item);
      return mapFieldDef(item);
    },
    async updateCustomFieldDefinition(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.customFieldDefinition.update({ where: { id }, data: input });
      ctx.loaders.fieldDefLoader.clear(id).prime(id, item);
      return mapFieldDef(item);
    },
    async deleteCustomFieldDefinition(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.customFieldDefinition.delete({ where: { id } });
      ctx.loaders.fieldDefLoader.clear(id);
      return true;
    },
    async createFieldPermission(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.fieldPermission.create({ data: input });
      ctx.loaders.permissionLoader.prime(item.id, item);
      return item;
    },
    async deleteFieldPermission(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.fieldPermission.delete({ where: { id } });
      ctx.loaders.permissionLoader.clear(id);
      return true;
    },
    async createValidationRule(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.validationRule.create({ data: input });
      ctx.loaders.ruleLoader.prime(item.id, item);
      return item;
    },
    async updateValidationRule(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.validationRule.update({ where: { id }, data: input });
      ctx.loaders.ruleLoader.clear(id).prime(id, item);
      return item;
    },
    async deleteValidationRule(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.validationRule.delete({ where: { id } });
      ctx.loaders.ruleLoader.clear(id);
      return true;
    },
    async createFieldChangeLog(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.fieldChangeLog.create({ data: input });
      ctx.loaders.changeLogLoader.prime(item.id, item);
      return mapChangeLog(item);
    },
    async createDuplicateGroup(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.duplicateGroup.create({ data: input });
      ctx.loaders.dupGroupLoader.prime(item.id, item);
      return mapDupGroup(item);
    },
    async updateDuplicateGroup(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.duplicateGroup.update({ where: { id }, data: input });
      ctx.loaders.dupGroupLoader.clear(id).prime(id, item);
      return mapDupGroup(item);
    },
    async deleteDuplicateGroup(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.duplicateGroup.delete({ where: { id } });
      ctx.loaders.dupGroupLoader.clear(id);
      return true;
    },
    async createTag(_parent: unknown, { input }: { input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.tag.create({ data: input });
      ctx.loaders.tagLoader.prime(item.id, item);
      return mapTag(item);
    },
    async updateTag(_parent: unknown, { id, input }: { id: string; input: any }, ctx: GraphQLContext) {
      const item = await ctx.prisma.tag.update({ where: { id }, data: input });
      ctx.loaders.tagLoader.clear(id).prime(id, item);
      return mapTag(item);
    },
    async deleteTag(_parent: unknown, { id }: { id: string }, ctx: GraphQLContext) {
      await ctx.prisma.tag.delete({ where: { id } });
      ctx.loaders.tagLoader.clear(id);
      return true;
    },
  },
  CustomFieldDefinition: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.fieldDefLoader.load(reference.id);
      return item ? mapFieldDef(item) : null;
    },
  },
  FieldPermission: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.permissionLoader.load(reference.id);
    },
  },
  ValidationRule: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.loaders.ruleLoader.load(reference.id);
    },
  },
  FieldChangeLog: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.changeLogLoader.load(reference.id);
      return item ? mapChangeLog(item) : null;
    },
  },
  DuplicateGroup: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.dupGroupLoader.load(reference.id);
      return item ? mapDupGroup(item) : null;
    },
    async records(parent: any, _args: unknown, ctx: GraphQLContext) {
      return ctx.prisma.duplicateRecord.findMany({ where: { groupId: parent.id } });
    },
  },
  DuplicateRecord: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      return ctx.prisma.duplicateRecord.findUnique({ where: { id: reference.id } });
    },
    async group(parent: any, _args: unknown, ctx: GraphQLContext) {
      const item = await ctx.loaders.dupGroupLoader.load(parent.groupId);
      return item ? mapDupGroup(item) : null;
    },
  },
  Tag: {
    async __resolveReference(reference: { id: string }, ctx: GraphQLContext) {
      const item = await ctx.loaders.tagLoader.load(reference.id);
      return item ? mapTag(item) : null;
    },
  },
};

function mapFieldDef(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}

function mapChangeLog(item: any) {
  return {
    ...item,
    changedAt: item.changedAt?.toISOString?.() ?? item.changedAt,
  };
}

function mapDupGroup(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    resolvedAt: item.resolvedAt?.toISOString?.() ?? item.resolvedAt,
  };
}

function mapTag(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
  };
}
