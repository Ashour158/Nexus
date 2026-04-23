import { ROLE_PERMISSIONS } from '@nexus/service-utils';

export function resolveUserPermissions(roles: { name: string; permissions: unknown }[]): {
  roleNames: string[];
  permissions: string[];
} {
  const roleNames = roles.map((r) => r.name);
  const set = new Set<string>();
  for (const r of roles) {
    const raw = r.permissions;
    if (Array.isArray(raw)) {
      for (const p of raw) {
        if (typeof p === 'string') set.add(p);
      }
    }
    const builtin = ROLE_PERMISSIONS[r.name];
    if (builtin && (!raw || (Array.isArray(raw) && raw.length === 0))) {
      for (const p of builtin) set.add(p);
    }
  }
  return { roleNames, permissions: [...set] };
}
