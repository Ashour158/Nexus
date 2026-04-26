import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

export function usePipelineSummary(pipelineId?: string) {
  return useQuery({
    queryKey: ['analytics', 'pipeline', 'summary', pipelineId ?? 'all'],
    queryFn: () =>
      apiClients.analytics.get<{
        totalDeals: number;
        totalValue: number;
        avgDealSize: number;
        avgDaysInPipeline: number;
      }>('/pipeline/summary', { params: { pipelineId } }),
  });
}

export function usePipelineFunnel(from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', 'pipeline', 'funnel', from, to],
    queryFn: () =>
      apiClients.analytics.get<
        Array<{
          stageId: string;
          stageName: string;
          count: number;
          value: number;
          conversionRate: number;
        }>
      >('/pipeline/funnel', { params: { from, to } }),
    enabled: Boolean(from && to),
  });
}

export function useRevenueSummary(year: number, quarter?: number) {
  return useQuery({
    queryKey: ['analytics', 'revenue', 'summary', year, quarter ?? 'all'],
    queryFn: () =>
      apiClients.analytics.get<{
        totalRevenue: number;
        wonDeals: number;
        lostDeals: number;
        winRate: number;
        avgSalePrice: number;
      }>('/revenue/summary', { params: { year, quarter } }),
  });
}

export function useRevenueByRep(year: number, quarter?: number) {
  return useQuery({
    queryKey: ['analytics', 'revenue', 'by-rep', year, quarter ?? 'all'],
    queryFn: () =>
      apiClients.analytics.get<
        Array<{ ownerId: string; totalRevenue: number; wonDeals: number; winRate: number }>
      >('/revenue/by-rep', { params: { year, quarter } }),
  });
}

export function useActivitySummary() {
  return useQuery({
    queryKey: ['analytics', 'activities', 'summary'],
    queryFn: () =>
      apiClients.analytics.get<{
        volume: number;
        completionRate: number;
        overdueRate: number;
      }>('/activities/summary'),
  });
}

export function useActivityByType(from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', 'activities', 'by-type', from, to],
    queryFn: () =>
      apiClients.analytics.get<
        Array<{ activityType: string; count: number; completionRate: number }>
      >('/activities/by-type', { params: { from, to } }),
    enabled: Boolean(from && to),
  });
}

export function useDealVelocity(from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', 'pipeline', 'velocity', from, to],
    queryFn: () =>
      apiClients.analytics.get<{
        avgDaysToClose: number;
        avgDaysPerStage: Record<string, number>;
      }>('/pipeline/velocity', { params: { from, to } }),
    enabled: Boolean(from && to),
  });
}

export function useForecast() {
  return useQuery({
    queryKey: ['analytics', 'forecast', 'weighted-pipeline'],
    queryFn: () =>
      apiClients.analytics.get<{
        weightedPipeline: string;
        totalPipeline: string;
        winRate: string;
        forecastByMonth: Array<{ month: string; weighted: string; total: string }>;
      }>('/forecast/weighted-pipeline'),
  });
}
