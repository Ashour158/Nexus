import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { Decimal } from 'decimal.js';
import type { PlanningPrisma } from '../prisma.js';

interface ForecastInput {
  commitAmount: string | number;
  bestCaseAmount: string | number;
  pipelineAmount: string | number;
  commentary?: string;
}

interface ReviewInput {
  adjustedCommit?: string | number;
  adjustedBest?: string | number;
  note?: string;
}

export function createForecastsService(prisma: PlanningPrisma, producer: NexusProducer) {
  return {
    async submitForecast(tenantId: string, ownerId: string, period: string, input: ForecastInput) {
      const submission = await prisma.forecastSubmission.upsert({
        where: { tenantId_ownerId_period: { tenantId, ownerId, period } },
        update: {
          commitAmount: new Decimal(input.commitAmount).toFixed(2),
          bestCaseAmount: new Decimal(input.bestCaseAmount).toFixed(2),
          pipelineAmount: new Decimal(input.pipelineAmount).toFixed(2),
          commentary: input.commentary ?? null,
          submittedAt: new Date(),
        },
        create: {
          tenantId,
          ownerId,
          period,
          commitAmount: new Decimal(input.commitAmount).toFixed(2),
          bestCaseAmount: new Decimal(input.bestCaseAmount).toFixed(2),
          pipelineAmount: new Decimal(input.pipelineAmount).toFixed(2),
          commentary: input.commentary ?? null,
        },
      });
      await producer.publish(TOPICS.ANALYTICS, {
        type: 'forecast.submitted',
        tenantId,
        payload: { submissionId: submission.id, ownerId, period },
      });
      return submission;
    },

    async listSubmissions(tenantId: string, period?: string, ownerId?: string) {
      return prisma.forecastSubmission.findMany({
        where: { tenantId, period, ownerId },
        include: { reviews: { orderBy: { reviewedAt: 'desc' } } },
        orderBy: { submittedAt: 'desc' },
      });
    },

    async reviewForecast(
      tenantId: string,
      submissionId: string,
      reviewerId: string,
      input: ReviewInput
    ) {
      const submission = await prisma.forecastSubmission.findFirst({
        where: { tenantId, id: submissionId },
      });
      if (!submission) return null;
      const isAdjustment =
        input.adjustedCommit !== undefined || input.adjustedBest !== undefined;
      const review = await prisma.forecastReview.create({
        data: {
          submissionId,
          reviewerId,
          status: isAdjustment ? 'ADJUSTED' : 'APPROVED',
          adjustedCommit:
            input.adjustedCommit === undefined
              ? null
              : new Decimal(input.adjustedCommit).toFixed(2),
          adjustedBest:
            input.adjustedBest === undefined ? null : new Decimal(input.adjustedBest).toFixed(2),
          note: input.note ?? null,
        },
      });
      await producer.publish(TOPICS.ANALYTICS, {
        type: 'forecast.reviewed',
        tenantId,
        payload: { submissionId, reviewId: review.id, reviewerId, status: review.status },
      });
      return review;
    },

    /**
     * ForecastReview lifecycle. A review is opened in `SUBMITTED` state, then
     * transitioned to `APPROVED` or `ADJUSTED` by a reviewer. Transitions are
     * guarded: only a `SUBMITTED` review may be approved/adjusted, so an
     * already-decided review cannot be silently re-decided. Note: ForecastReview
     * is an RLS skip-model, so tenant ownership is enforced via the parent
     * submission (which is tenant-scoped) rather than the review row itself.
     */
    async openReview(tenantId: string, submissionId: string, reviewerId: string) {
      const submission = await prisma.forecastSubmission.findFirst({
        where: { tenantId, id: submissionId },
      });
      if (!submission) return null;
      const review = await prisma.forecastReview.create({
        data: { submissionId, reviewerId, status: 'SUBMITTED' },
      });
      return review;
    },

    async transitionReview(
      tenantId: string,
      reviewId: string,
      reviewerId: string,
      target: 'APPROVED' | 'ADJUSTED',
      input: ReviewInput = {}
    ): Promise<
      | { ok: true; review: Awaited<ReturnType<typeof prisma.forecastReview.update>> }
      | { ok: false; reason: 'NOT_FOUND' | 'INVALID_TRANSITION' }
    > {
      const review = await prisma.forecastReview.findUnique({ where: { id: reviewId } });
      if (!review) return { ok: false, reason: 'NOT_FOUND' };
      // Ownership guard: the review's submission must belong to this tenant.
      const submission = await prisma.forecastSubmission.findFirst({
        where: { tenantId, id: review.submissionId },
      });
      if (!submission) return { ok: false, reason: 'NOT_FOUND' };
      // Guard: only an open (SUBMITTED) review may be decided.
      if (review.status !== 'SUBMITTED') return { ok: false, reason: 'INVALID_TRANSITION' };
      if (target === 'ADJUSTED' && input.adjustedCommit === undefined && input.adjustedBest === undefined) {
        return { ok: false, reason: 'INVALID_TRANSITION' };
      }
      const updated = await prisma.forecastReview.update({
        where: { id: reviewId },
        data: {
          status: target,
          reviewerId,
          adjustedCommit:
            input.adjustedCommit === undefined
              ? review.adjustedCommit
              : new Decimal(input.adjustedCommit).toFixed(2),
          adjustedBest:
            input.adjustedBest === undefined
              ? review.adjustedBest
              : new Decimal(input.adjustedBest).toFixed(2),
          note: input.note ?? review.note,
          reviewedAt: new Date(),
        },
      });
      await producer.publish(TOPICS.ANALYTICS, {
        type: 'forecast.reviewed',
        tenantId,
        payload: { submissionId: review.submissionId, reviewId, reviewerId, status: target },
      }).catch(() => undefined);
      return { ok: true, review: updated };
    },

    async getRollup(tenantId: string, period: string) {
      const rows = await prisma.forecastSubmission.findMany({
        where: { tenantId, period },
        include: { reviews: { orderBy: { reviewedAt: 'desc' }, take: 1 } },
      });
      const byOwner = rows.map((row) => {
        const latestReview = row.reviews[0];
        const commit = new Decimal(
          latestReview?.adjustedCommit?.toString() ?? row.commitAmount.toString()
        );
        const bestCase = new Decimal(
          latestReview?.adjustedBest?.toString() ?? row.bestCaseAmount.toString()
        );
        const pipeline = new Decimal(row.pipelineAmount.toString());
        return {
          ownerId: row.ownerId,
          commit: commit.toFixed(2),
          bestCase: bestCase.toFixed(2),
          pipeline: pipeline.toFixed(2),
          submittedAt: row.submittedAt,
          reviewed: Boolean(latestReview),
        };
      });
      const totals = byOwner.reduce(
        (acc, row) => ({
          commit: acc.commit.plus(row.commit),
          bestCase: acc.bestCase.plus(row.bestCase),
          pipeline: acc.pipeline.plus(row.pipeline),
        }),
        { commit: new Decimal(0), bestCase: new Decimal(0), pipeline: new Decimal(0) }
      );
      return {
        period,
        owners: byOwner,
        teamTotal: {
          commit: totals.commit.toFixed(2),
          bestCase: totals.bestCase.toFixed(2),
          pipeline: totals.pipeline.toFixed(2),
        },
      };
    },
  };
}
