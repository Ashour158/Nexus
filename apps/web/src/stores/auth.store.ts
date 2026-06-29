import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Auth store (Section 39 frontend layer).
 *
 * Holds the short-lived access token used by `api-client.ts` to attach
 * `Authorization: Bearer <token>` on every outgoing request, plus the resolved
 * roles + permissions decoded from the JWT so UI components can gate action
 * surfaces with `hasPermission()` — mirroring the server-side
 * `checkPermission()` semantics in `@nexus/service-utils/rbac` (wildcard `*`
 * and resource-wildcards like `deals:*`).
 *
 * Persisted to localStorage so the session survives page refreshes.
 */

interface SetSessionPayload {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  tenantId: string;
  roles?: string[];
  permissions?: string[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  tenantId: string | null;
  roles: string[];
  permissions: string[];
  setSession: (payload: SetSessionPayload) => void;
  setAccessToken: (token: string) => void;
  clearSession: () => void;
  /**
   * Returns `true` when the current user holds `permission`. Mirrors the
   * server-side wildcard rules: `*` grants everything; `resource:*` grants
   * every action on `resource` (e.g. `deals:*` covers `deals:update`).
   */
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      tenantId: null,
      roles: [],
      permissions: [],
      setSession: ({ accessToken, refreshToken, userId, tenantId, roles, permissions }) =>
        set({
          accessToken,
          refreshToken: refreshToken ?? get().refreshToken,
          userId,
          tenantId,
          roles: roles ?? [],
          permissions: permissions ?? [],
        }),
      setAccessToken: (token: string) => set({ accessToken: token }),
      clearSession: () =>
        set({
          accessToken: null,
          userId: null,
          tenantId: null,
          roles: [],
          permissions: [],
        }),
      hasPermission: (permission) => {
        const owned = get().permissions;
        if (owned.length === 0) return false;
        if (owned.includes('*')) return true;
        if (owned.includes(permission)) return true;
        const [resource] = permission.split(':');
        return resource ? owned.includes(`${resource}:*`) : false;
      },
    }),
    {
      name: 'nexus-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        userId: state.userId,
        tenantId: state.tenantId,
        roles: state.roles,
        permissions: state.permissions,
      }),
    }
  )
);
