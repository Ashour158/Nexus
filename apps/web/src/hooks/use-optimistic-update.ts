/**
 * Optimistic Update Hook — Updates UI immediately before server confirmation.
 */

import { useState, useCallback, useRef } from 'react';

interface OptimisticState<T> {
  data: T;
  isPending: boolean;
  error: Error | null;
}

export function useOptimisticUpdate<T>(
  initialData: T,
  updateFn: (data: T) => Promise<T>
) {
  const [state, setState] = useState<OptimisticState<T>>({
    data: initialData,
    isPending: false,
    error: null,
  });

  const rollbackDataRef = useRef<T>(initialData);

  const optimisticUpdate = useCallback(
    async (optimisticData: T) => {
      rollbackDataRef.current = state.data;
      setState((prev) => ({ ...prev, data: optimisticData, isPending: true, error: null }));

      try {
        const result = await updateFn(optimisticData);
        setState({ data: result, isPending: false, error: null });
        return result;
      } catch (error) {
        setState({ data: rollbackDataRef.current, isPending: false, error: error instanceof Error ? error : new Error(String(error)) });
        throw error;
      }
    },
    [state.data, updateFn]
  );

  const rollback = useCallback(() => {
    setState((prev) => ({ ...prev, data: rollbackDataRef.current, isPending: false, error: null }));
  }, []);

  return {
    ...state,
    optimisticUpdate,
    rollback,
  };
}

/** TanStack Query optimistic mutation helper. */
export function createOptimisticMutation<T>(
  queryClient: { setQueryData: (key: string[], updater: (old: T | undefined) => T) => void; invalidateQueries: (options: { queryKey: string[] }) => Promise<void> },
  queryKey: string[],
  mutationFn: (data: T) => Promise<T>
) {
  return {
    mutationFn,
    onMutate: async (_newData: T) => {
      await queryClient.invalidateQueries({ queryKey });
      const previousData = queryClient.setQueryData(queryKey, () => _newData);
      return { previousData };
    },
    onError: (_err: Error, _newData: T, context: { previousData: T }) => {
      queryClient.setQueryData(queryKey, () => context.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  };
}
