import type { KnowledgePrisma } from '../prisma.js';
import type { NexusProducer } from '@nexus/kafka';

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Local topic + event contract expected by search-service's indexer consumer
// (search-service/src/indexes/kb-articles.index.ts). The shared @nexus/kafka
// TOPICS map has no knowledge topic yet, so the literal is declared here.
// `publish()` accepts a raw string topic, so this is safe and additive.
const KB_ARTICLES_TOPIC = 'nexus.knowledge.articles';

type KbArticleRecord = {
  id: string;
  tenantId: string;
  categoryId: string | null;
  title: string;
  slug: string;
  body: string;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  dealStages: string[];
  viewCount: number;
  [key: string]: unknown;
};

export function createKnowledgeService(prisma: KnowledgePrisma, producer?: NexusProducer) {
  /**
   * Fire-and-forget index event for search-service. Guarded so a Kafka hiccup
   * can never fail the write that triggered it. Payload carries the fields the
   * kb_articles Meilisearch index needs (id/title/body/slug/status/dealStages/tags).
   */
  function emitIndexEvent(type: string, article: KbArticleRecord): void {
    if (!producer) return;
    try {
      const payload = {
        id: article.id,
        articleId: article.id,
        tenantId: article.tenantId,
        categoryId: article.categoryId,
        title: article.title,
        slug: article.slug,
        body: article.body,
        tags: article.tags,
        status: article.status,
        dealStages: article.dealStages,
        viewCount: article.viewCount,
      };
      void producer
        .publish(KB_ARTICLES_TOPIC, { type, tenantId: article.tenantId, payload })
        .catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.warn(`[knowledge-service] failed to emit '${type}':`, err instanceof Error ? err.message : err);
        });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[knowledge-service] failed to build/emit '${type}':`, err instanceof Error ? err.message : err);
    }
  }

  function emitDeleteEvent(tenantId: string, id: string): void {
    if (!producer) return;
    try {
      void producer
        .publish(KB_ARTICLES_TOPIC, { type: 'kb.article.deleted', tenantId, payload: { id, articleId: id } })
        .catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.warn('[knowledge-service] failed to emit \'kb.article.deleted\':', err instanceof Error ? err.message : err);
        });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[knowledge-service] failed to emit \'kb.article.deleted\':', err instanceof Error ? err.message : err);
    }
  }

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
      const status = input.status ?? 'DRAFT';
      const created = await prisma.kbArticle.create({
        data: {
          tenantId,
          authorId,
          title: input.title,
          slug: input.slug ?? slugify(input.title),
          body: input.body,
          categoryId: input.categoryId ?? null,
          tags: input.tags ?? [],
          status,
          publishedAt: status === 'PUBLISHED' ? new Date() : null,
          dealStages: input.dealStages ?? [],
        },
      });
      emitIndexEvent(status === 'PUBLISHED' ? 'kb.article.published' : 'kb.article.created', created as KbArticleRecord);
      return created;
    },

    async updateArticle(tenantId: string, id: string, input: Partial<{ title: string; slug: string; body: string; categoryId: string | null; tags: string[]; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; dealStages: string[] }>) {
      const article = await prisma.kbArticle.findFirst({ where: { tenantId, id } });
      if (!article) return null;
      // If a status transition to PUBLISHED is requested here, stamp publishedAt
      // on first publish (idempotent — don't overwrite an existing timestamp).
      const publishedAt =
        input.status === 'PUBLISHED' && !article.publishedAt ? new Date() : undefined;
      const updated = await prisma.kbArticle.update({
        where: { id },
        data: { ...input, ...(publishedAt ? { publishedAt } : {}), version: { increment: 1 } },
      });
      const type =
        input.status === 'PUBLISHED'
          ? 'kb.article.published'
          : input.status === 'ARCHIVED'
            ? 'kb.article.archived'
            : 'kb.article.updated';
      emitIndexEvent(type, updated as KbArticleRecord);
      return updated;
    },

    /**
     * Publish transition guard: only DRAFT/ARCHIVED articles can be (re)published.
     * Republishing an already-PUBLISHED article is a no-op that returns it as-is.
     * Sets publishedAt on first publish. Emits `kb.article.published`.
     */
    async publishArticle(tenantId: string, id: string) {
      const article = await prisma.kbArticle.findFirst({ where: { tenantId, id } });
      if (!article) return null;
      if (article.status === 'PUBLISHED') return article;
      const published = await prisma.kbArticle.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: article.publishedAt ?? new Date(),
          version: { increment: 1 },
        },
      });
      emitIndexEvent('kb.article.published', published as KbArticleRecord);
      return published;
    },

    /** Archive transition. Idempotent. Emits `kb.article.archived`. */
    async archiveArticle(tenantId: string, id: string) {
      const article = await prisma.kbArticle.findFirst({ where: { tenantId, id } });
      if (!article) return null;
      if (article.status === 'ARCHIVED') return article;
      const archived = await prisma.kbArticle.update({
        where: { id },
        data: { status: 'ARCHIVED', version: { increment: 1 } },
      });
      emitIndexEvent('kb.article.archived', archived as KbArticleRecord);
      return archived;
    },

    /** Delete an article and emit `kb.article.deleted` so search drops it. */
    async deleteArticle(tenantId: string, id: string) {
      const article = await prisma.kbArticle.findFirst({ where: { tenantId, id } });
      if (!article) return null;
      await prisma.kbArticle.delete({ where: { id } });
      emitDeleteEvent(tenantId, id);
      return { id };
    },

    async recordView(articleId: string, viewedBy: string, dealStage?: string) {
      return prisma.$transaction(async (tx) => {
        await tx.kbView.create({ data: { articleId, viewedBy, dealStage: dealStage ?? null } });
        return tx.kbArticle.update({ where: { id: articleId }, data: { viewCount: { increment: 1 } } });
      });
    },

    /**
     * Atomically bump the helpful / not-helpful counters. Scoped by tenant so a
     * caller cannot vote on another tenant's article. Returns null if not found.
     */
    async recordHelpful(tenantId: string, id: string, helpful: boolean) {
      const article = await prisma.kbArticle.findFirst({ where: { tenantId, id }, select: { id: true } });
      if (!article) return null;
      return prisma.kbArticle.update({
        where: { id },
        data: helpful ? { helpfulCount: { increment: 1 } } : { notHelpfulCount: { increment: 1 } },
        select: { id: true, helpfulCount: true, notHelpfulCount: true },
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
