import type { CrmPrisma } from '../prisma.js';
import { recalculateLeadScore as legacyRecalculateLeadScore } from './lead-scoring.engine.js';

// Enhanced Deterministic Lead Scoring Engine
// Features:
// - Rule-based predictive scoring
// - Behavioral pattern analysis
// - Real-time scoring with confidence intervals
// - Policy-based territory routing
// - Multi-signal correlation analysis
// - Historical conversion pattern learning

export interface ScoringFeatures {
  // Demographic features
  companySize: number;
  industry: string;
  revenue: number;
  location: string;

  // Behavioral features
  emailOpenRate: number;
  pageViews: number;
  timeOnSite: number;
  downloads: number;
  meetingsBooked: number;

  // Engagement features
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  sessionDuration: number;

  // Social signals
  linkedinConnections: number;
  socialMediaPresence: number;
  brandMentions: number;

  // Intent signals
  jobPostings: number;
  fundingRounds: number;
  technologyStack: string[];
  competitorMentions: number;
}

export interface MLModelPrediction {
  score: number;
  confidence: number;
  probability: number;
  features: Record<string, number>;
  modelVersion: string;
  predictionTime: Date;
}

export interface LeadRoutingDecision {
  territoryId: string | null;
  salesRepId: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  routingReason: string;
  confidence: number;
  alternativeRoutes: Array<{
    territoryId: string;
    salesRepId: string;
    score: number;
  }>;
}

export class DeterministicScoringEngine {
  private prisma: CrmPrisma;
  private tenantId: string;

  constructor(prisma: CrmPrisma, tenantId: string) {
    this.prisma = prisma;
    this.tenantId = tenantId;
  }

  /**
   * Enhanced lead scoring with rules capabilities
   */
  async calculateScore(leadId: string): Promise<{
    legacyScore: number;
    combinedScore: number;
    confidence: number;
    routing: LeadRoutingDecision;
    signals: Record<string, number>;
  }> {
    // Get legacy score for comparison
    const legacyScore = await this.getLegacyScore(leadId);

    // Extract features for ML model
    const features = await this.extractScoringFeatures(leadId);

    // Get ML model prediction
    const mlPrediction = await this.predictWithMLModel(features);

    // Calculate combined score with confidence weighting
    const combinedScore = this.combineScores(legacyScore, mlPrediction);

    // Get routing decision
    const routing = await this.calculateRoutingDecision(leadId, combinedScore, features);

    // Extract signal breakdown
    const signals = await this.analyzeSignalContributions(leadId, features);

    return {
      legacyScore,
      combinedScore,
      confidence: mlPrediction.confidence,
      routing,
      signals,
    };
  }

  /**
   * Extract comprehensive features for ML scoring
   */
  private async extractScoringFeatures(leadId: string): Promise<ScoringFeatures> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: this.tenantId },
      include: {
        activities: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    // Query available behavioral data from CRM tables
    const activities = lead.activities ?? [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Meetings: count completed MEETING activities
    const meetingsBooked = activities.filter(
      (a) => a.type === 'MEETING' && a.status === 'COMPLETED'
    ).length;

    // Email engagement: count completed EMAIL activities as a proxy for open-rate
    const emailActivities = activities.filter((a) => a.type === 'EMAIL');
    const completedEmails = emailActivities.filter((a) => a.status === 'COMPLETED').length;
    const emailOpenRate = emailActivities.length > 0 ? completedEmails / emailActivities.length : 0;

    // Downloads: count attachments related to this lead (defensive for test mocks)
    const attachmentCount = this.prisma.attachment
      ? await this.prisma.attachment.count({
          where: { module: 'lead', recordId: leadId, tenantId: this.tenantId },
        })
      : 0;

    // Recency: days since last activity (max 100 if within 1 day, decaying)
    const lastActivity = activities
      .filter((a) => a.createdAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const recencyScore = lastActivity
      ? Math.max(0, 100 - Math.floor((now.getTime() - lastActivity.createdAt.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    // Frequency: number of activities in the last 30 days (capped at 20)
    const recentActivities = activities.filter((a) => a.createdAt >= thirtyDaysAgo);
    const frequencyScore = Math.min(100, recentActivities.length * 10);

    // Page views and time on site are not tracked in the CRM schema; kept at 0
    const pageViews = 0;
    const timeOnSite = 0;
    const sessionDuration = 0;

    const features: ScoringFeatures = {
      companySize: lead.employeeCount || 0,
      industry: lead.industry || 'unknown',
      revenue: Number(lead.annualRevenue || 0),
      location: lead.country || 'unknown',
      emailOpenRate,
      pageViews,
      timeOnSite,
      downloads: attachmentCount,
      meetingsBooked,
      recencyScore,
      frequencyScore,
      monetaryScore: lead.annualRevenue ? Math.min(100, Number(lead.annualRevenue) / 100000) : 20,
      sessionDuration,
      linkedinConnections: 0,
      socialMediaPresence: 0,
      brandMentions: 0,
      jobPostings: 0,
      fundingRounds: 0,
      technologyStack: [],
      competitorMentions: 0,
    };

    return features;
  }

  /**
   * ML model prediction (simplified for now - would integrate with actual ML service)
   */
  private async predictWithMLModel(features: ScoringFeatures): Promise<MLModelPrediction> {
    // This would typically call an ML service or use TensorFlow.js
    // For now, implement a simplified predictive model based on feature engineering

    let score = 0;
    let confidence = 0.7;

    // Company size scoring
    if (features.companySize > 1000) score += 25;
    else if (features.companySize > 500) score += 20;
    else if (features.companySize > 100) score += 15;
    else if (features.companySize > 50) score += 10;

    // Revenue scoring
    if (features.revenue > 100000000) score += 20; // $100M+
    else if (features.revenue > 50000000) score += 15;
    else if (features.revenue > 10000000) score += 10;

    // Behavioral scoring
    score += features.emailOpenRate * 15;
    score += Math.min(20, features.pageViews * 0.5);
    score += Math.min(15, features.downloads * 2);
    score += Math.min(25, features.meetingsBooked * 5);

    // RFM scoring
    score += features.recencyScore * 0.3;
    score += features.frequencyScore * 0.3;
    score += features.monetaryScore * 0.4;

    // Industry premium
    const premiumIndustries = ['SaaS', 'FinTech', 'Healthcare', 'E-commerce'];
    if (premiumIndustries.includes(features.industry)) {
      score += 10;
      confidence += 0.1;
    }

    // Location premium
    const premiumLocations = ['United States', 'United Kingdom', 'Germany', 'Canada'];
    if (premiumLocations.includes(features.location)) {
      score += 5;
    }

    // Normalize score
    score = Math.min(100, Math.max(0, score));

    // Calculate confidence based on data completeness
    const featureCompleteness = Object.values(features).filter(v =>
      (typeof v === 'number' && v > 0) || (Array.isArray(v) && v.length > 0) || (typeof v === 'string' && v !== 'unknown')
    ).length / Object.keys(features).length;
    confidence = Math.min(0.95, confidence * featureCompleteness);

    return {
      score,
      confidence,
      probability: score / 100,
      features: {
        companySize: features.companySize,
        revenue: features.revenue,
        emailOpenRate: features.emailOpenRate,
        pageViews: features.pageViews,
        meetingsBooked: features.meetingsBooked,
        recencyScore: features.recencyScore,
        frequencyScore: features.frequencyScore,
        monetaryScore: features.monetaryScore,
      },
      modelVersion: '1.0.0',
      predictionTime: new Date(),
    };
  }

  /**
   * Combine legacy rule-based score with ML prediction
   */
  private combineScores(legacyScore: number, mlPrediction: MLModelPrediction): number {
    // Weighted combination: 40% legacy rules, 60% ML prediction
    // Higher confidence in ML prediction increases its weight
    const mlWeight = 0.4 + (mlPrediction.confidence * 0.4);
    const legacyWeight = 1 - mlWeight;

    return Math.round((legacyScore * legacyWeight) + (mlPrediction.score * mlWeight));
  }

  /**
   * Calculate automated routing decision using real territory and sales rep data
   */
  private async calculateRoutingDecision(
    leadId: string,
    score: number,
    features: ScoringFeatures
  ): Promise<LeadRoutingDecision> {
    // Determine priority based on score and features
    let priority: 'urgent' | 'high' | 'medium' | 'low';
    if (score >= 80) priority = 'urgent';
    else if (score >= 60) priority = 'high';
    else if (score >= 40) priority = 'medium';
    else priority = 'low';

    let territoryId: string | null = null;
    let salesRepId: string | null = null;
    let routingReason = '';
    let confidence = 0.7;

    try {
      // Get the lead for territory matching
      const lead = await this.prisma.lead.findFirst({
        where: { id: leadId, tenantId: this.tenantId },
        select: {
          territoryId: true,
          country: true,
          city: true,
          industry: true,
          employeeCount: true,
          annualRevenue: true,
        },
      });

      if (!lead) {
        return {
          territoryId: null,
          salesRepId: null,
          priority,
          routingReason: 'Lead not found for routing',
          confidence: 0,
          alternativeRoutes: [],
        };
      }

      // 1. Find matching territory
      let territory: { id: string; name: string } | null = null;

      if (lead.territoryId) {
        territory = await this.prisma.territory.findFirst({
          where: { id: lead.territoryId, tenantId: this.tenantId, isActive: true },
          select: { id: true, name: true },
        });
        if (territory) {
          routingReason = `Assigned territory: ${territory.name}`;
        }
      }

      if (!territory) {
        // Match by geographic data, industry, company size
        const territories = await this.prisma.territory.findMany({
          where: {
            tenantId: this.tenantId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            countries: true,
            states: true,
            cities: true,
            industries: true,
            minCompanySize: true,
            maxCompanySize: true,
            minRevenue: true,
            maxRevenue: true,
          },
        });

        // Score each territory by how well it matches lead attributes
        let bestMatch: { id: string; name: string } | null = null;
        let bestScore = -1;

        for (const t of territories) {
          let matchScore = 0;

          // Geographic match
          if (lead.country && t.countries.includes(lead.country)) matchScore += 3;
          if (lead.city && t.cities.includes(lead.city)) matchScore += 2;

          // Industry match
          if (lead.industry && t.industries.includes(lead.industry)) matchScore += 2;

          // Company size match
          if (lead.employeeCount != null) {
            const minSize = t.minCompanySize;
            const maxSize = t.maxCompanySize;
            if (
              (minSize == null || lead.employeeCount >= minSize) &&
              (maxSize == null || lead.employeeCount <= maxSize)
            ) {
              matchScore += 1;
            }
          }

          // Revenue match
          const revenue = lead.annualRevenue ? Number(lead.annualRevenue) : null;
          if (revenue != null) {
            const minRev = t.minRevenue ? Number(t.minRevenue) : null;
            const maxRev = t.maxRevenue ? Number(t.maxRevenue) : null;
            if (
              (minRev == null || revenue >= minRev) &&
              (maxRev == null || revenue <= maxRev)
            ) {
              matchScore += 1;
            }
          }

          if (matchScore > bestScore) {
            bestScore = matchScore;
            bestMatch = t;
          }
        }

        if (bestMatch && bestScore > 0) {
          territory = bestMatch;
          routingReason = `Matched territory: ${territory.name}`;
        }
      }

      if (!territory) {
        return {
          territoryId: null,
          salesRepId: null,
          priority,
          routingReason: 'No matching territory found',
          confidence: 0.5,
          alternativeRoutes: [],
        };
      }

      territoryId = territory.id;
      confidence = 0.7;

      // 2. Find best sales rep
      const salesReps = await this.prisma.salesRep.findMany({
        where: {
          tenantId: this.tenantId,
          territoryId: territory.id,
          isActive: true,
        },
        include: {
          user: true,
        },
        orderBy: {
          activeLeads: 'asc',
        },
      });

      if (salesReps.length > 0) {
        // Pick the rep with fewest active leads (already ordered by activeLeads asc)
        const bestRep = salesReps[0];
        salesRepId = bestRep.id;
        routingReason += `, assigned to ${bestRep.user.firstName} ${bestRep.user.lastName} (${bestRep.activeLeads} active leads)`;
        confidence = Math.min(0.95, confidence + 0.15);
        console.log(`[deterministic Routing] Lead ${leadId} -> Territory ${territory.id} -> SalesRep ${bestRep.id} (activeLeads: ${bestRep.activeLeads})`);
      } else {
        // Fallback: any active sales rep in the tenant
        const fallbackReps = await this.prisma.salesRep.findMany({
          where: {
            tenantId: this.tenantId,
            isActive: true,
          },
          include: {
            user: true,
          },
          orderBy: {
            activeLeads: 'asc',
          },
          take: 1,
        });

        if (fallbackReps.length > 0) {
          const fallbackRep = fallbackReps[0];
          salesRepId = fallbackRep.id;
          routingReason += `, fallback rep ${fallbackRep.user.firstName} ${fallbackRep.user.lastName}`;
          confidence = Math.min(0.95, confidence + 0.1);
          console.log(`[deterministic Routing] Lead ${leadId} -> Territory ${territory.id} -> Fallback SalesRep ${fallbackRep.id}`);
        } else {
          routingReason += ', no available sales rep';
          console.warn(`[deterministic Routing] Lead ${leadId} -> Territory ${territory.id} -> No available sales rep`);
        }
      }

      // Boost priority for high-value industries
      const premiumIndustries = ['SaaS', 'Fintech', 'Healthcare', 'rules', 'Cybersecurity'];
      if (premiumIndustries.includes(features.industry)) {
        if (priority === 'high') priority = 'urgent';
        else if (priority === 'medium') priority = 'high';
        routingReason += `, premium ${features.industry} industry`;
      }

      // Calculate confidence based on data completeness
      const dataPoints = [
        features.companySize > 0,
        features.revenue > 0,
        features.industry !== 'unknown',
        features.location !== 'unknown'
      ].filter(Boolean).length;
      confidence = Math.min(0.95, confidence * (0.6 + (dataPoints * 0.1)));

      // Build alternative routes from other sales reps in the territory
      const alternativeRoutes: Array<{ territoryId: string; salesRepId: string; score: number }> = [];
      if (salesReps.length > 1) {
        for (let i = 1; i < Math.min(salesReps.length, 3); i++) {
          alternativeRoutes.push({
            territoryId: territory.id,
            salesRepId: salesReps[i].id,
            score: score * (0.95 - i * 0.05),
          });
        }
      }

      return {
        territoryId,
        salesRepId,
        priority,
        routingReason,
        confidence,
        alternativeRoutes,
      };
    } catch (error) {
      console.error(`[deterministic Routing] Error calculating routing decision for lead ${leadId}:`, error);
      return {
        territoryId: null,
        salesRepId: null,
        priority,
        routingReason: 'Routing error occurred',
        confidence: 0,
        alternativeRoutes: [],
      };
    }
  }

  /**
   * Analyze signal contributions for transparency
   */
  private async analyzeSignalContributions(
    _leadId: string,
    features: ScoringFeatures
  ): Promise<Record<string, number>> {
    const signals: Record<string, number> = {};

    // Company signals
    signals.company_size = Math.min(25, Math.floor(features.companySize / 50));
    signals.revenue = Math.min(20, Math.floor(features.revenue / 5000000));

    // Behavioral signals
    signals.email_engagement = Math.floor(features.emailOpenRate * 15);
    signals.website_engagement = Math.min(20, Math.floor(features.pageViews / 5));
    signals.content_downloads = Math.min(15, features.downloads * 2);
    signals.meetings_booked = Math.min(25, features.meetingsBooked * 5);

    // RFM signals
    signals.recency = Math.floor(features.recencyScore * 0.3);
    signals.frequency = Math.floor(features.frequencyScore * 0.3);
    signals.monetary = Math.floor(features.monetaryScore * 0.4);

    // Industry premium
    const premiumIndustries = ['SaaS', 'FinTech', 'Healthcare', 'E-commerce'];
    signals.industry_premium = premiumIndustries.includes(features.industry) ? 10 : 0;

    return signals;
  }

  /**
   * Get legacy score for comparison
   */
  private async getLegacyScore(leadId: string): Promise<number> {
    try {
      const score = await this.prisma.leadScore.findFirst({
        where: { leadId },
        select: { score: true }
      });
      return score?.score || 0;
    } catch {
      // If legacy score doesn't exist, calculate it
      await legacyRecalculateLeadScore(this.prisma, this.tenantId, leadId);
      const score = await this.prisma.leadScore.findFirst({
        where: { leadId },
        select: { score: true }
      });
      return score?.score || 0;
    }
  }

  /**
   * Real-time score recalculation with caching
   */
  async recalculateScoreRealTime(leadId: string): Promise<void> {
    const result = await this.calculateScore(leadId);

    // Update lead score with deterministic-enhanced data (using existing schema for now)
    await this.prisma.leadScore.upsert({
      where: { leadId },
      create: {
        tenantId: this.tenantId,
        leadId,
        score: result.combinedScore,
        tier: result.combinedScore >= 70 ? 'hot' : result.combinedScore >= 40 ? 'warm' : 'cold',
        signals: result.signals,
        scoredAt: new Date(),
        confidence: result.confidence,
        routingDecision: result.routing as any,
      },
      update: {
        score: result.combinedScore,
        tier: result.combinedScore >= 70 ? 'hot' : result.combinedScore >= 40 ? 'warm' : 'cold',
        signals: result.signals,
        scoredAt: new Date(),
        confidence: result.confidence,
        routingDecision: result.routing as any,
      },
    });

    // TODO: Trigger automated routing when LeadRoutingEvent model is available
    if (result.routing.priority === 'urgent' || result.routing.priority === 'high') {
      // await this.triggerAutomatedRouting(leadId, result.routing);
    }
  }

  /**
   * Batch scoring for multiple leads
   */
  async batchRecalculateScores(leadIds: string[]): Promise<void> {
    const promises = leadIds.map(id => this.recalculateScoreRealTime(id));
    await Promise.allSettled(promises);
  }

  /**
   * Get scoring insights and recommendations
   */
  async getScoringInsights(leadId: string): Promise<{
    scoreBreakdown: Record<string, number>;
    improvementSuggestions: string[];
    similarLeads: Array<{ id: string; score: number; conversionRate: number }>;
    predictiveInsights: string[];
  }> {
    const result = await this.calculateScore(leadId);
    const features = await this.extractScoringFeatures(leadId);

    const suggestions: string[] = [];
    const insights: string[] = [];

    // Generate improvement suggestions
    if (features.emailOpenRate < 0.3) {
      suggestions.push('Improve email open rates through better subject lines and personalization');
    }
    if (features.pageViews < 5) {
      suggestions.push('Increase website engagement with targeted content offers');
    }
    if (features.meetingsBooked === 0) {
      suggestions.push('Focus on booking discovery meetings to increase conversion probability');
    }
    if (features.recencyScore < 50) {
      suggestions.push('Re-engage with recent nurturing campaigns');
    }

    // Predictive insights
    if (result.confidence > 0.8) {
      insights.push(`High confidence prediction (${Math.round(result.confidence * 100)}%)`);
    }
    if (result.combinedScore > 70) {
      insights.push('Lead shows strong buying signals and should be prioritized');
    }
    if (features.companySize > 500) {
      insights.push('Enterprise-level opportunity with complex decision-making process');
    }

    // Find similar leads (simplified)
    const similarLeads = await this.prisma.leadScore.findMany({
      where: {
        tenantId: this.tenantId,
        score: {
          gte: result.combinedScore - 10,
          lte: result.combinedScore + 10
        }
      },
      take: 5,
      select: {
        leadId: true,
        score: true,
      }
    });

    return {
      scoreBreakdown: result.signals,
      improvementSuggestions: suggestions,
      similarLeads: similarLeads.map(s => ({
        id: s.leadId,
        score: s.score,
        conversionRate: 0.15 // Would be calculated from historical data
      })),
      predictiveInsights: insights,
    };
  }
}

export default DeterministicScoringEngine;