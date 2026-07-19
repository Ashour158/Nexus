import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface FieldPermission {
  id: string;
  tenantId: string;
  objectType: string;
  fieldName: string;
  /** JSON scalar — the list of role names/ids allowed to read/write the field. */
  allowedRoles: string[];
  createdAt: string;
}

export interface CreateFieldPermissionInput {
  objectType: string;
  fieldName: string;
  allowedRoles: string[];
}

const KEY = ['field-permissions'] as const;

async function toJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Request failed');
  return data;
}

function normalizeRoles(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** All field-permission rules for the tenant. Filter by objectType client-side. */
export function useFieldPermissions() {
  return useQuery<FieldPermission[]>({
    queryKey: KEY,
    queryFn: async () => {
      const data = await fetch('/api/metadata/field-permissions').then(toJson);
      const rows = (data as { fieldPermissions?: FieldPermission[] })?.fieldPermissions;
      // FAIL CLOSED: a 200 whose body lacks `fieldPermissions` means we did not
      // actually read the policy. Surfacing `[]` here would render as "no field
      // restrictions exist", i.e. a silently permissive default. Throw instead so
      // the caller shows an explicit error state.
      if (!Array.isArray(rows)) {
        throw new Error('Field permission policy response was malformed');
      }
      return rows.map((r) => ({ ...r, allowedRoles: normalizeRoles(r.allowedRoles) }));
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useCreateFieldPermission() {
  const qc = useQueryClient();
  return useMutation<FieldPermission, Error, CreateFieldPermissionInput>({
    mutationFn: (input) =>
      fetch('/api/metadata/field-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
        .then(toJson)
        .then((d) => (d as { createFieldPermission: FieldPermission }).createFieldPermission),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteFieldPermission() {
  const qc = useQueryClient();
  return useMutation<boolean, Error, string>({
    mutationFn: (id) =>
      fetch(`/api/metadata/field-permissions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
        .then(toJson)
        .then((d) => Boolean((d as { deleteFieldPermission?: boolean }).deleteFieldPermission)),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
