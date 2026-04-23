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
