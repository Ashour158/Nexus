import type { KnowledgePrisma } from '../prisma.js';

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function createKnowledgeService(prisma: KnowledgePrisma) {
  return {
    async listCategories(tenantId: string) {
      const categories = await prisma.kbCategory.findMany({
        where: { tenantId },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      });
      return categories.map((category) => ({
        ...category,
        children: categories.filter((c) => c.parentCategoryId === category.id),
      }));
    },

    async createCategory(tenantId: string, input: { name: string; icon?: string; parentCategoryId?: string; position?: number }) {
      return prisma.kbCategory.create({
        data: { tenantId, name: input.name, icon: input.icon ?? null, parentCategoryId: input.parentCategoryId ?? null, position: input.position ?? 0 },
      });
    },

    async listArticles(tenantId: string, filters: { categoryId?: string; status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; tags?: string[]; search?: string }) {
      return prisma.kbArticle.findMany({
        where: {
          tenantId,
          categoryId: filters.categoryId,
          status: filters.status ?? 'PUBLISHED',
          tags: filters.tags?.length ? { hasSome: filters.tags } : undefined,
          OR: filters.search
            ? [
                { title: { contains: filters.search, mode: 'insensitive' } },
                { body: { contains: filters.search, mode: 'insensitive' } },
              ]
            : undefined,
        },
        include: { category: true },
        orderBy: { updatedAt: 'desc' },
      });
    },

    async getArticle(tenantId: string, id: string) {
      return prisma.kbArticle.findFirst({ where: { tenantId, id }, include: { category: true } });
    },

    async createArticle(tenantId: string, authorId: string, input: { title: string; slug?: string; body: string; categoryId?: string | null; tags?: string[]; status?: 'DRAFT' | 'PUBLISHED'; dealStages?: string[] }) {
      return prisma.kbArticle.create({
        data: {
          tenantId,
          authorId,
          title: input.title,
          slug: input.slug ?? slugify(input.title),
          body: input.body,
          categoryId: input.categoryId ?? null,
          tags: input.tags ?? [],
          status: input.status ?? 'DRAFT',
          dealStages: input.dealStages ?? [],
        },
      });
    },

    async updateArticle(tenantId: string, id: string, input: Partial<{ title: string; slug: string; body: string; categoryId: string | null; tags: string[]; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; dealStages: string[] }>) {
      const article = await prisma.kbArticle.findFirst({ where: { tenantId, id } });
      if (!article) return null;
      return prisma.kbArticle.update({
        where: { id },
        data: { ...input, version: { increment: 1 } },
      });
    },

    async publishArticle(tenantId: string, id: string) {
      return this.updateArticle(tenantId, id, { status: 'PUBLISHED' });
    },

    async archiveArticle(tenantId: string, id: string) {
      return this.updateArticle(tenantId, id, { status: 'ARCHIVED' });
    },

    async recordView(articleId: string, viewedBy: string, dealStage?: string) {
      return prisma.$transaction(async (tx) => {
        await tx.kbView.create({ data: { articleId, viewedBy, dealStage: dealStage ?? null } });
        return tx.kbArticle.update({ where: { id: articleId }, data: { viewCount: { increment: 1 } } });
      });
    },

    async getArticlesForStage(tenantId: string, stageId: string) {
      return prisma.kbArticle.findMany({
        where: { tenantId, status: 'PUBLISHED', dealStages: { has: stageId } },
        orderBy: { viewCount: 'desc' },
        take: 10,
      });
    },

    async getTopArticles(tenantId: string, limit: number) {
      return prisma.kbArticle.findMany({
        where: { tenantId, status: 'PUBLISHED' },
        orderBy: { viewCount: 'desc' },
        take: limit,
      });
    },
  };
}
