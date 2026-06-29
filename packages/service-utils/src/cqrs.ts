/**
 * CQRS Read Model helpers.
 *
 * Usage:
 *   import { buildReadQuery, type ReadModel } from '@nexus/service-utils/cqrs';
 *   const query = buildReadQuery({ table: 'deals_view', where: { status: 'active' } });
 */

export interface ReadModel<T = unknown> {
  id: string;
  data: T;
  version: number;
  updatedAt: Date;
}

export interface ReadQuery {
  table: string;
  select?: string[];
  where?: Record<string, unknown>;
  orderBy?: { column: string; direction?: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

const VALID_DIRECTIONS = new Set(['asc', 'desc', 'ASC', 'DESC']);
const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdentifier(name: string): string {
  if (!VALID_IDENTIFIER.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

export function buildReadQuery(q: ReadQuery): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const selectClause = q.select?.map((col) => quoteIdentifier(col)).join(', ') ?? '*';
  let sql = `SELECT ${selectClause} FROM ${quoteIdentifier(q.table)}`;

  const whereClauses: string[] = [];
  if (q.where) {
    for (const [key, value] of Object.entries(q.where)) {
      if (value !== undefined && value !== null) {
        values.push(value);
        whereClauses.push(`${quoteIdentifier(key)} = $${values.length}`);
      }
    }
  }
  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  if (q.orderBy) {
    const direction = q.orderBy.direction ?? 'asc';
    if (!VALID_DIRECTIONS.has(direction)) {
      throw new Error(`Invalid ORDER BY direction: ${direction}`);
    }
    sql += ` ORDER BY ${quoteIdentifier(q.orderBy.column)} ${direction}`;
  }
  if (q.limit) {
    values.push(q.limit);
    sql += ` LIMIT $${values.length}`;
  }
  if (q.offset) {
    values.push(q.offset);
    sql += ` OFFSET $${values.length}`;
  }

  return { sql, values };
}

export function buildMaterializedViewRefresh(viewName: string, concurrently = true): string {
  return `REFRESH MATERIALIZED VIEW${concurrently ? ' CONCURRENTLY' : ''} ${quoteIdentifier(viewName)}`;
}
