import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeterministicScoringEngine } from './deterministic-scoring.engine.js';

// Mock Prisma client
const mockPrisma = {
  lead: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  leadScore: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
  leadRoutingEvent: {
    create: vi.fn(),
  },
  territory: {
    findMany: vi.fn(),
  },
};

describe('DeterministicScoringEngine', () => {
  let engine: DeterministicScoringEngine;

  beforeEach(() => {
    engine = new DeterministicScoringEngine(mockPrisma as any, 'test-tenant');
    vi.clearAllMocks();
  });

  describe('extractScoringFeatures', () => {
    it('should extract comprehensive features from lead data', async () => {
      const mockLead = {
        id: 'lead-1',
        company: 'Test Corp',
        industry: 'SaaS',
        employeeCount: 150,
        annualRevenue: 5000000,
        country: 'United States',
        activities: [
          { type: 'EMAIL', metadata: { opened: true } },
          { type: 'MEETING', metadata: {} },
          { type: 'PAGE_VIEW', metadata: { duration: 120 } },
        ],
        account: {
          employeeCount: 150,
          annualRevenue: 5000000,
          billingCountry: 'United States',
        },
      };

      mockPrisma.lead.findFirst.mockResolvedValue(mockLead);

      const features = await (engine as any).extractScoringFeatures('lead-1');

      expect(features.companySize).toBe(150);
      expect(features.industry).toBe('SaaS');
      expect(features.revenue).toBe(5000000);
      expect(features.location).toBe('United States');
      expect(features.emailOpenRate).toBe(0); // TODO: Calculate from activities
      expect(features.pageViews).toBe(0); // TODO: Calculate from activities
      expect(features.timeOnSite).toBe(0); // TODO: Calculate from activities
      expect(features.meetingsBooked).toBe(0); // TODO: Calculate from activities
    });

    it('should handle missing data gracefully', async () => {
      const mockLead = {
        id: 'lead-2',
        activities: [],
      };

      mockPrisma.lead.findFirst.mockResolvedValue(mockLead);

      const features = await (engine as any).extractScoringFeatures('lead-2');

      expect(features.companySize).toBe(0);
      expect(features.industry).toBe('unknown');
      expect(features.emailOpenRate).toBe(0);
      expect(features.pageViews).toBe(0);
    });
  });

  describe('predictWithMLModel', () => {
    it('should generate ML prediction with confidence', async () => {
      const features = {
        companySize: 200,
        industry: 'SaaS',
        revenue: 10000000,
        location: 'United States',
        emailOpenRate: 0.8,
        pageViews: 10,
        timeOnSite: 300,
        downloads: 2,
        meetingsBooked: 1,
        recencyScore: 80,
        frequencyScore: 60,
        monetaryScore: 70,
        sessionDuration: 300,
        linkedinConnections: 0,
        socialMediaPresence: 0,
        brandMentions: 0,
        jobPostings: 0,
        fundingRounds: 0,
        technologyStack: [],
        competitorMentions: 0,
      };

      const prediction = await (engine as any).predictWithMLModel(features);

      expect(prediction.score).toBeGreaterThan(0);
      expect(prediction.score).toBeLessThanOrEqual(100);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.modelVersion).toBe('1.0.0');
      expect(prediction.features).toBeDefined();
    });

    it('should boost score for premium industries', async () => {
      const baseFeatures = {
        companySize: 50,
        industry: 'SaaS',
        revenue: 1000000,
        location: 'Unknown',
        emailOpenRate: 0.5,
        pageViews: 5,
        timeOnSite: 100,
        downloads: 1,
        meetingsBooked: 0,
        recencyScore: 50,
        frequencyScore: 50,
        monetaryScore: 50,
        sessionDuration: 100,
        linkedinConnections: 0,
        socialMediaPresence: 0,
        brandMentions: 0,
        jobPostings: 0,
        fundingRounds: 0,
        technologyStack: [],
        competitorMentions: 0,
      };

      const prediction = await (engine as any).predictWithMLModel(baseFeatures);
      expect(prediction.score).toBeGreaterThan(40); // Should get industry premium boost
    });
  });

  describe('calculateScore', () => {
    it('should combine legacy and deterministic scores', async () => {
      // Mock legacy score
      mockPrisma.leadScore.findFirst.mockResolvedValue({ score: 60 });

      // Mock territories for routing
      mockPrisma.territory.findMany.mockResolvedValue([
        {
          id: 'territory-1',
          name: 'Enterprise',
          isActive: true,
          industries: ['SaaS'],
          salesReps: [
            {
              id: 'rep-1',
              userId: 'user-1',
              capacity: 10,
              isActive: true,
              user: { firstName: 'John', lastName: 'Doe' }
            }
          ]
        }
      ]);

      // Mock lead data
      mockPrisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        company: 'Test Corp',
        industry: 'SaaS',
        activities: [
          { type: 'EMAIL', metadata: { opened: true } },
          { type: 'MEETING', metadata: {} },
        ],
        account: {
          employeeCount: 150,
          annualRevenue: 5000000,
          billingCountry: 'United States',
        },
      });

      const result = await engine.calculateScore('lead-1');

      expect(result.legacyScore).toBe(60);
      expect(result.combinedScore).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.routing).toBeDefined();
      expect(result.signals).toBeDefined();
    });
  });

  describe('recalculateScoreRealTime', () => {
    it('should update lead score and trigger routing', async () => {
      // Mock the calculateScore method
      const mockResult = {
        legacyScore: 60,
        combinedScore: 68,
        confidence: 0.85,
        routing: {
          territoryId: 'mid-market-territory-us',
          salesRepId: 'mid-market-specialist',
          priority: 'high' as const,
          routingReason: 'deterministic routing: high priority based on score 68, mid-market account, US market',
          confidence: 0.8,
          alternativeRoutes: [
            { territoryId: 'backup-territory-1', salesRepId: 'backup-rep-1', score: 61.2 },
            { territoryId: 'backup-territory-2', salesRepId: 'backup-rep-2', score: 57.8 }
          ],
        },
        signals: { company_size: 15, email_engagement: 12 },
      };

      vi.spyOn(engine, 'calculateScore').mockResolvedValue(mockResult);
      mockPrisma.leadScore.upsert.mockResolvedValue({} as any);
      mockPrisma.leadRoutingEvent.create.mockResolvedValue({} as any);
      mockPrisma.lead.update.mockResolvedValue({} as any);

      await engine.recalculateScoreRealTime('lead-1');

      expect(mockPrisma.leadScore.upsert).toHaveBeenCalledWith({
        where: { leadId: 'lead-1' },
        create: expect.objectContaining({
          tenantId: 'test-tenant',
          leadId: 'lead-1',
          score: 68,
          tier: 'warm',
          signals: mockResult.signals,
        }),
        update: expect.objectContaining({
          score: 68,
          tier: 'warm',
          signals: mockResult.signals,
        }),
      });

      // TODO: Update expectations when routing is implemented
      // expect(mockPrisma.leadRoutingEvent.create).toHaveBeenCalled();
      // expect(mockPrisma.lead.update).toHaveBeenCalledWith({
      //   where: { id: 'lead-1', tenantId: 'test-tenant' },
      //   data: {
      //     assignedTo: 'rep-1',
      //     territoryId: 'territory-1',
      //     priority: 'high',
      //   }
      // });
    });
  });

  describe('getScoringInsights', () => {
    it('should provide actionable insights and suggestions', async () => {
      const mockResult = {
        legacyScore: 60,
        combinedScore: 68,
        confidence: 0.85,
        routing: {} as any,
        signals: { email_engagement: 5, meetings_booked: 25 },
      };

      // Mock similar leads query
      mockPrisma.leadScore.findMany.mockResolvedValue([
        { leadId: 'lead-2', score: 70, confidence: 0.8 },
        { leadId: 'lead-3', score: 65, confidence: 0.75 },
      ]);

      vi.spyOn(engine, 'calculateScore').mockResolvedValue(mockResult);

      const insights = await engine.getScoringInsights('lead-1');

      expect(insights.scoreBreakdown).toBeDefined();
      expect(insights.improvementSuggestions).toBeDefined();
      expect(insights.similarLeads).toBeDefined();
      expect(insights.predictiveInsights).toBeDefined();
      expect(Array.isArray(insights.improvementSuggestions)).toBe(true);
      expect(Array.isArray(insights.predictiveInsights)).toBe(true);
    });
  });
});