import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

/**
 * People / org-layer hooks (auth-service "system-control" surface).
 *
 * All requests target the auth service (`apiClients.auth`), whose base URL is
 * the auth-service `/api/v1` root — the same client the users/roles admin pages
 * use. The `{ success, data }` envelope is unwrapped by the typed client, so
 * these hooks receive plain data.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Company {
  id: string;
  name: string;
  legalName?: string | null;
  domain?: string | null;
  logoUrl?: string | null;
  industry?: string | null;
  size?: string | null;
  phone?: string | null;
  website?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  timezone?: string | null;
  currency?: string | null;
}

export type CompanyUpsert = Omit<Company, 'id'>;

export interface Department {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  parentDepartmentId?: string | null;
  headUserId?: string | null;
  memberCount?: number;
  childCount?: number;
}

export interface DepartmentNode extends Department {
  children?: DepartmentNode[];
}

export interface Level {
  id: string;
  name: string;
  rank: number;
  description?: string | null;
}

export interface OrgChartNode {
  userId: string;
  name: string;
  jobTitle?: string | null;
  department?: string | null;
  level?: string | null;
  avatarUrl?: string | null;
  directReports: OrgChartNode[];
}

export interface OrgChart {
  nodes: OrgChartNode[];
  meta?: { truncated?: boolean };
}

export interface UserOrgAssignment {
  managerId?: string | null;
  departmentId?: string | null;
  levelId?: string | null;
  jobTitle?: string | null;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const orgKeys = {
  company: ['org', 'company'] as const,
  departments: (tree?: boolean) => ['org', 'departments', { tree: !!tree }] as const,
  departmentsAll: ['org', 'departments'] as const,
  levels: ['org', 'levels'] as const,
  chart: ['org', 'chart'] as const,
};

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

export function useCompany() {
  return useQuery<Company | null>({
    queryKey: orgKeys.company,
    queryFn: () => apiClients.auth.get<Company | null>('/company'),
    staleTime: 60_000,
  });
}

export function useUpsertCompany() {
  const qc = useQueryClient();
  return useMutation<Company, Error, CompanyUpsert>({
    mutationFn: (data) => apiClients.auth.put<Company>('/company', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.company }),
  });
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export function useDepartments(tree = false) {
  return useQuery<Department[] | DepartmentNode[]>({
    queryKey: orgKeys.departments(tree),
    queryFn: () =>
      apiClients.auth.get<Department[] | DepartmentNode[]>('/departments', {
        params: tree ? { tree: true } : undefined,
      }),
    staleTime: 60_000,
  });
}

export interface DepartmentInput {
  name: string;
  code?: string;
  description?: string;
  parentDepartmentId?: string | null;
  headUserId?: string | null;
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation<Department, Error, DepartmentInput>({
    mutationFn: (data) => apiClients.auth.post<Department>('/departments', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.departmentsAll }),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation<Department, Error, { id: string; data: Partial<DepartmentInput> }>({
    mutationFn: ({ id, data }) => apiClients.auth.patch<Department>(`/departments/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.departmentsAll }),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, string>({
    mutationFn: (id) => apiClients.auth.delete<{ id: string }>(`/departments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.departmentsAll }),
  });
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export function useLevels() {
  return useQuery<Level[]>({
    queryKey: orgKeys.levels,
    queryFn: () => apiClients.auth.get<Level[]>('/levels'),
    staleTime: 60_000,
  });
}

export interface LevelInput {
  name: string;
  rank: number;
  description?: string;
}

export function useCreateLevel() {
  const qc = useQueryClient();
  return useMutation<Level, Error, LevelInput>({
    mutationFn: (data) => apiClients.auth.post<Level>('/levels', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.levels }),
  });
}

export function useUpdateLevel() {
  const qc = useQueryClient();
  return useMutation<Level, Error, { id: string; data: Partial<LevelInput> }>({
    mutationFn: ({ id, data }) => apiClients.auth.patch<Level>(`/levels/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.levels }),
  });
}

export function useDeleteLevel() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, string>({
    mutationFn: (id) => apiClients.auth.delete<{ id: string }>(`/levels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.levels }),
  });
}

// ---------------------------------------------------------------------------
// Org chart
// ---------------------------------------------------------------------------

export function useOrgChart() {
  return useQuery<OrgChart>({
    queryKey: orgKeys.chart,
    queryFn: async () => {
      // The org-chart endpoint returns the tree in `data` and truncation in
      // `meta`. The typed client unwraps `data` only, so the shape is
      // normalized here to `{ nodes, meta }` regardless of the backend layout.
      const raw = await apiClients.auth.get<
        OrgChartNode[] | { nodes?: OrgChartNode[]; roots?: OrgChartNode[]; meta?: { truncated?: boolean } }
      >('/org-chart');
      if (Array.isArray(raw)) return { nodes: raw };
      const nodes = raw.nodes ?? raw.roots ?? [];
      return { nodes, meta: raw.meta };
    },
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// User org assignment
// ---------------------------------------------------------------------------

export function useAssignUserOrg() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: string; data: UserOrgAssignment }>({
    mutationFn: ({ id, data }) => apiClients.auth.patch(`/users/${id}/org`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orgKeys.chart });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
