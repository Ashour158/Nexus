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
  /**
   * True when the user is an administrator. Accepts any admin/super-admin role
   * (case-insensitive) OR the `*` wildcard permission. Frontend admin gates
   * must use this — a bare `roles.includes('admin')` denies the seeded
   * `SUPER_ADMIN` role and hides admin surfaces from the super admin.
   */
  isAdmin: () => boolean;
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
        // Admins (SUPER_ADMIN / admin role, or the `*` wildcard) can do anything.
        // Defer to isAdmin() FIRST so permission-gated buttons and nav never hide
        // from an admin — e.g. after a hard refresh where the persisted
        // `permissions` array hasn't rehydrated yet, or for an admin whose token
        // carries the role but not an explicit `*` permission.
        if (get().isAdmin()) return true;
        const owned = get().permissions;
        if (owned.length === 0) return false;
        if (owned.includes('*')) return true;
        if (owned.includes(permission)) return true;
        const [resource] = permission.split(':');
        return resource ? owned.includes(`${resource}:*`) : false;
      },
      isAdmin: () => {
        if (get().permissions.includes('*')) return true;
        return (get().roles ?? []).some((r) => {
          const lower = r.toLowerCase();
          return lower === 'admin' || lower === 'super_admin' || lower === 'superadmin';
        });
      },
    }),
    {
      name: 'nexus-auth',
      storage: createJSONStorage(() => sessionStorage),
      // Do NOT auto-hydrate: otherwise the client's first render has the
      // persisted session (permissions populated) while the server render has an
      // empty store, so permission-gated pages that swap their whole tree on
      // hasPermission() produce a hydration mismatch (React #418). A HydrationGate
      // rehydrates this store on mount and only then renders the dashboard.
      skipHydration: true,
      // SECURITY (RR-H10): never persist the raw JWTs to web storage — a
      // sessionStorage copy is directly exfiltratable by any XSS. The access
      // token now lives ONLY in a server-set HttpOnly cookie (see
      // app/api/auth/session), and the server-side middleware attaches it as the
      // Authorization header when proxying /api/* upstream. `accessToken`/
      // `refreshToken` remain in the in-memory store for the active tab (socket
      // handshake, optimistic Bearer on same-origin calls that middleware then
      // overrides) but are deliberately excluded from `partialize` so they are
      // gone on reload — the HttpOnly cookie keeps the user authenticated.
      // Only non-secret identity/authz metadata is persisted for UI gating.
      partialize: (state) => ({
        userId: state.userId,
        tenantId: state.tenantId,
        roles: state.roles,
        permissions: state.permissions,
      }),
    }
  )
);
