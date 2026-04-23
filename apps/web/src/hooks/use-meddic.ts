import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Deal } from '@nexus/shared-types';
import type { MeddicicDataInput } from '@nexus/validation';
import { api } from '@/lib/api-client';
import { dealKeys } from '@/hooks/use-deals';

/**
 * PATCH /deals/:id/meddic — updates the MEDDICIC qualification blob on a deal.
 * Backend re-derives `meddicicScore` from `totalScore`.
 */
export function useUpdateMeddic() {
  const qc = useQueryClient();
  return useMutation<Deal, Error, { id: string; data: MeddicicDataInput }>({
    mutationFn: ({ id, data }) => api.patch<Deal>(`/deals/${id}/meddic`, data),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: dealKeys.detail(id) });
    },
  });
}
