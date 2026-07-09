import { apiSuccess } from '@/lib/server/dev-preview-data';

export type ModuleSortDirection = 'asc' | 'desc';

export interface ModuleListParams {
  page: number;
  limit: number;
  search: string;
  sortBy: string;
  sortDir: ModuleSortDirection;
  filters: Record<string, string>;
}

export interface ModuleListResult<TRecord> {
  data: TRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function parseModuleListParams(
  searchParams: URLSearchParams,
  options: {
    defaultLimit?: number;
    defaultSortBy?: string;
    defaultSortDir?: ModuleSortDirection;
    filterKeys?: string[];
  } = {}
): ModuleListParams {
  const page = positiveNumber(searchParams.get('page'), 1);
  const limit = Math.min(positiveNumber(searchParams.get('limit'), options.defaultLimit ?? 25), 200);
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : options.defaultSortDir ?? 'desc';
  const filters: Record<string, string> = {};

  for (const key of options.filterKeys ?? []) {
    const value = searchParams.get(key)?.trim();
    if (value) filters[key] = value;
  }

  return {
    page,
    limit,
    search: searchParams.get('search')?.trim().toLowerCase() ?? '',
    sortBy: searchParams.get('sortBy')?.trim() || options.defaultSortBy || 'createdAt',
    sortDir,
    filters,
  };
}

export function applyModuleListQuery<TRecord extends Record<string, unknown>>(
  records: TRecord[],
  params: ModuleListParams,
  options: {
    searchFields?: string[];
  } = {}
) {
  let rows = [...records];

  if (params.search) {
    rows = rows.filter((record) =>
      (options.searchFields ?? [])
        .map((field) => readPath(record, field))
        .filter((value) => value !== undefined && value !== null)
        .join(' ')
        .toLowerCase()
        .includes(params.search)
    );
  }

  for (const [field, expected] of Object.entries(params.filters)) {
    rows = rows.filter((record) => String(readPath(record, field) ?? '') === expected);
  }

  rows.sort((left, right) => {
    const leftValue = readPath(left, params.sortBy);
    const rightValue = readPath(right, params.sortBy);
    const order = compareValues(leftValue, rightValue);
    return params.sortDir === 'asc' ? order : -order;
  });

  return rows;
}

export function moduleListResponse<TRecord>(records: TRecord[], params: ModuleListParams) {
  return apiSuccess(toModuleListResult(records, params));
}

export function toModuleListResult<TRecord>(
  records: TRecord[],
  params: Pick<ModuleListParams, 'page' | 'limit'>
): ModuleListResult<TRecord> {
  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(params.limit, 1)));
  const page = Math.min(Math.max(params.page, 1), totalPages);

  return {
    data: records.slice((page - 1) * params.limit, page * params.limit),
    total,
    page,
    limit: params.limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function getRequestTenantId(headers: Headers) {
  return headers.get('x-tenant-id')?.trim() || 'default';
}

export function getIdempotencyKey(headers: Headers) {
  return headers.get('idempotency-key')?.trim() || undefined;
}

export function createModuleAuditEvent(action: string, actor: string, metadata?: Record<string, unknown>) {
  return {
    action,
    actor,
    at: new Date().toISOString(),
    metadata: metadata ?? {},
  };
}

function positiveNumber(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readPath(source: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, source);
}

function compareValues(left: unknown, right: unknown) {
  if (left instanceof Date || right instanceof Date) {
    return new Date(String(left)).getTime() - new Date(String(right)).getTime();
  }
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}
