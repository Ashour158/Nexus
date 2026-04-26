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
      const review = await prisma.forecastReview.create({
        data: {
          submissionId,
          reviewerId,
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
        payload: { submissionId, reviewId: review.id, reviewerId },
      });
      return review;
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
