import { create } from 'zustand';

/**
 * UI-level store for cross-cutting client state:
 * - Toast notifications surfaced by `api-client.ts` on network errors.
 * - Sidebar collapsed/expanded state for the authenticated app shell.
 * - Leads view-mode toggle (kanban vs. table) used by `/leads`.
 */

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

export type LeadsViewMode = 'table' | 'kanban';

interface UiState {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  sidebarOpenOnMobile: boolean;
  setSidebarOpenOnMobile: (open: boolean) => void;

  leadsViewMode: LeadsViewMode;
  setLeadsViewMode: (mode: LeadsViewMode) => void;

  unreadNotifications: number;
  setUnreadNotifications: (count: number) => void;
  incrementUnreadNotifications: (delta?: number) => void;
}

function nextId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  pushToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { id: nextId(), ...toast }],
    })),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  sidebarOpenOnMobile: false,
  setSidebarOpenOnMobile: (sidebarOpenOnMobile) => set({ sidebarOpenOnMobile }),

  leadsViewMode: 'table',
  setLeadsViewMode: (leadsViewMode) => set({ leadsViewMode }),

  unreadNotifications: 0,
  setUnreadNotifications: (unreadNotifications) => set({ unreadNotifications }),
  incrementUnreadNotifications: (delta = 1) =>
    set((state) => ({
      unreadNotifications: Math.max(0, state.unreadNotifications + delta),
    })),
}));

/** Alias for consistency with the user spec naming. */
export const useUIStore = useUiStore;
