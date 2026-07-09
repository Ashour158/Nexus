import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

/**
 * Data-quality summary hook — wire to crm-service:
 *   GET /data-quality/summary?entityType=account|contact
 *
 * Returns null on 404 / error so the dashboard degrades to an empty state
 * rather than crashing before the backend deploys.
 */

export type DataQualityEntityType = 'account' | 'contact';

export interface DataQualitySummary {
  avgQualityScore: number;
  lowQualityCount: number;
  totalRecords: number;
  fieldCompleteness: Record<string, number>;
  openDuplicateGroups: number;
}

export const dataQualityKeys = {
  all: ['data-quality'] as const,
  summary: (entityType: DataQualityEntityType) =>
    [...dataQualityKeys.all, 'summary', entityType] as const,
};

export function useDataQualitySummary(entityType: DataQualityEntityType) {
  return useQuery<DataQualitySummary | null>({
    queryKey: dataQualityKeys.summary(entityType),
    queryFn: async () => {
      try {
        return await api.get<DataQualitySummary>('/data-quality/summary', {
          params: { entityType },
        });
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}
