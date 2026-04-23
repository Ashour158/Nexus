import { create } from 'zustand';

/**
 * UI-level store used by `api-client.ts` to surface toast notifications on
 * network errors. Kept intentionally small; richer features (sidebar state,
 * theme, command palette) are added in later prompts.
 */

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface UiState {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  pushToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id:
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ...toast,
        },
      ],
    })),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
