import { create } from 'zustand';

/**
 * Pipeline view-state store (Section 53.1). Tracks the active pipeline
 * selection, column filters, and the "collapse won/lost" toggle that the
 * Kanban UI uses. Kept separate from the server-state layer (React Query).
 */

interface PipelineFilters {
  ownerId?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

interface PipelineState {
  activePipelineId: string | null;
  filters: PipelineFilters;
  showClosed: boolean;
  setActivePipeline: (id: string) => void;
  setFilters: (filters: PipelineFilters) => void;
  toggleShowClosed: () => void;
  reset: () => void;
}

const INITIAL: Pick<
  PipelineState,
  'activePipelineId' | 'filters' | 'showClosed'
> = {
  activePipelineId: null,
  filters: {},
  showClosed: false,
};

export const usePipelineStore = create<PipelineState>((set) => ({
  ...INITIAL,
  setActivePipeline: (id) => set({ activePipelineId: id }),
  setFilters: (filters) => set({ filters }),
  toggleShowClosed: () => set((s) => ({ showClosed: !s.showClosed })),
  reset: () => set({ ...INITIAL }),
}));
