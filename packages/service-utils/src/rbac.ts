import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';

// ─── Permission Matrix — Section 35.2 ─────────────────────────────────────────

export const PERMISSIONS = {
  LEADS: {
    READ: 'leads:read',
    CREATE: 'leads:create',
    UPDATE: 'leads:update',
    DELETE: 'leads:delete',
    ASSIGN: 'leads:assign',
    CONVERT: 'leads:convert',
  },
  CONTACTS: {
    READ: 'contacts:read',
    CREATE: 'contacts:create',
    UPDATE: 'contacts:update',
    DELETE: 'contacts:delete',
  },
  ACCOUNTS: {
    READ: 'accounts:read',
    CREATE: 'accounts:create',
    UPDATE: 'accounts:update',
    DELETE: 'accounts:delete',
  },
  DEALS: {
    READ: 'deals:read',
    CREATE: 'deals:create',
    UPDATE: 'deals:update',
    DELETE: 'deals:delete',
    WIN: 'deals:win_loss',
    ASSIGN: 'deals:assign',
  },
  QUOTES: {
    READ: 'quotes:read',
    CREATE: 'quotes:create',
    UPDATE: 'quotes:update',
    APPROVE: 'quotes:approve',
    SEND: 'quotes:send',
  },
  ACTIVITIES: {
    READ: 'activities:read',
    CREATE: 'activities:create',
    UPDATE: 'activities:update',
    DELETE: 'activities:delete',
  },
  NOTES: {
    READ: 'notes:read',
    CREATE: 'notes:create',
    UPDATE: 'notes:update',
    DELETE: 'notes:delete',
  },
  NOTIFICATIONS: {
    READ: 'notifications:read',
    UPDATE: 'notifications:update',
  },
  TICKETS: {
    READ: 'tickets:read',
    CREATE: 'tickets:create',
    UPDATE: 'tickets:update',
    DELETE: 'tickets:delete',
    ASSIGN: 'tickets:assign',
  },
  PRODUCTS: {
    READ: 'products:read',
    CREATE: 'products:create',
    UPDATE: 'products:update',
    DELETE: 'products:delete',
  },
  INVOICES: {
    READ: 'invoices:read',
    CREATE: 'invoices:create',
    UPDATE: 'invoices:update',
    VOID: 'invoices:void',
  },
  BILLING: {
    READ: 'billing:read',
    MANAGE: 'billing:manage',
    USAGE: 'billing:usage',
    CREDIT: 'billing:credit',
  },
  CONTRACTS: { READ: 'contracts:read', CREATE: 'contracts:create', UPDATE: 'contracts:update', DELETE: 'contracts:delete', SIGN: 'contracts:sign' },
  COMMISSION: { READ: 'commission:read', MANAGE: 'commission:manage', APPROVE: 'commission:approve' },
  WORKFLOWS: {
    READ: 'workflows:read',
    CREATE: 'workflows:create',
    UPDATE: 'workflows:update',
    DELETE: 'workflows:delete',
    EXECUTE: 'workflows:execute',
  },
  ANALYTICS: { READ: 'analytics:read', EXPORT: 'analytics:export' },
  USERS: {
    READ: 'users:read',
    INVITE: 'users:invite',
    UPDATE: 'users:update',
    DELETE: 'users:delete',
    MANAGE_ROLES: 'users:manage_roles',
  },
  SETTINGS: { READ: 'settings:read', UPDATE: 'settings:update', WRITE: 'settings:write' },
  AUDIT: { READ: 'audit:read' },
  INTEGRATIONS: { READ: 'integrations:read', MANAGE: 'integrations:manage' },
  BLUEPRINTS: { READ: 'blueprints:read', MANAGE: 'blueprints:manage' },
  DOCUMENTS: { READ: 'documents:read', UPDATE: 'documents:update' },
  DATA: {
    READ: 'data:read',
    IMPORT: 'data:import',
    EXPORT: 'data:export',
    UPDATE: 'data:update',
    ADMIN: 'data:admin',
  },
  CAMPAIGNS: {
    READ: 'campaigns:read',
    CREATE: 'campaigns:create',
    UPDATE: 'campaigns:update',
    DELETE: 'campaigns:delete',
    SEND: 'campaigns:send',
  },
} as const;

// Roles may use scoped permissions to bound record visibility. Examples:
//
//   SALES_REP:     'deals:read:own'   → sees only deals they own
//   SALES_MANAGER: 'deals:read:team'  → sees deals owned by their team members
//   ADMIN:         'deals:*' / 'deals:read:all' → sees every deal (broadest)
//
// The role tables below keep the existing plain grants (which resolve to 'all')
// for backward compatibility; swap a grant for its `:own` / `:team` variant to
// tighten a role's record scope without touching any service code — the list
// endpoints pick up the scope via resolveRecordScope() + applyOwnershipScope().
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'users:*',
    'settings:*',
    'audit:read',
    'integrations:*',
    'roles:*',
    'leads:*',
    'contacts:*',
    'accounts:*',
    'deals:*',
    'quotes:*',
    'activities:*',
    'products:*',
    'invoices:*',
    'billing:*',
    'contracts:*',
    'commission:*',
    'workflows:*',
    'analytics:*',
    'blueprints:*',
    'documents:*',
    'data:*',
    'tickets:*',
    'campaigns:*',
  ],
  SALES_MANAGER: [
    // Read scope for the core sales objects is bounded to the manager's team.
    // A `:team` read grant still satisfies plain `:read` permission gates
    // (checkPermission treats team as broader than own), and it downgrades the
    // resolved record scope from 'all' to 'team' in list queries. All non-read
    // actions on these objects remain unscoped via the explicit grants below.
    'leads:read:team',
    'leads:create',
    'leads:update',
    'leads:delete',
    'leads:assign',
    'leads:convert',
    'contacts:read:team',
    'contacts:create',
    'contacts:update',
    'contacts:delete',
    'accounts:read:team',
    'accounts:create',
    'accounts:update',
    'accounts:delete',
    'deals:read:team',
    'deals:create',
    'deals:update',
    'deals:delete',
    'deals:win_loss',
    'deals:assign',
    'quotes:*',
    'activities:*',
    'commission:read',
    'workflows:read',
    'analytics:*',
    'users:read',
    'products:read',
    'data:read',
    'data:export',
    'data:import',
  ],
  SALES_REP: [
    // Read scope for the core sales objects is bounded to records the rep owns.
    // `:own` still opens the plain `:read` permission gate (checkPermission),
    // but narrows list queries to the rep's own rows via resolveRecordScope.
    'leads:read:own',
    'leads:create',
    'leads:update',
    'leads:convert',
    'contacts:read:own',
    'contacts:create',
    'contacts:update',
    'accounts:read:own',
    'accounts:create',
    'accounts:update',
    'deals:read:own',
    'deals:create',
    'deals:update',
    'deals:win_loss',
    'quotes:read',
    'quotes:create',
    'quotes:update',
    'quotes:send',
    'activities:*',
    'products:read',
    'analytics:read',
    'data:read',
  ],
  FINANCE: [
    'invoices:*',
    'billing:*',
    'contracts:*',
    'commission:read',
    'commission:approve',
    'products:*',
    // Deal desk / finance must see and gate quotes in a quote-to-cash CRM.
    'quotes:read',
    'quotes:approve',
    'quotes:update',
    'quotes:send',
    'accounts:read',
    'deals:read',
    'contacts:read',
    'analytics:read',
    'analytics:export',
  ],
  CUSTOMER_SUCCESS: [
    'contacts:read',
    'contacts:update',
    'accounts:read',
    'accounts:update',
    'deals:read',
    'activities:*',
    'analytics:read',
    'tickets:read',
    'tickets:create',
    'tickets:update',
    'tickets:delete',
    'tickets:assign',
  ],
  MARKETING: [
    'leads:read',
    'leads:create',
    'leads:update',
    'contacts:read',
    'accounts:read',
    'analytics:read',
    'campaigns:read',
    'campaigns:create',
    'campaigns:update',
    'campaigns:delete',
    'campaigns:send',
  ],
  READ_ONLY: [
    'leads:read',
    'contacts:read',
    'accounts:read',
    'deals:read',
    'quotes:read',
    'activities:read',
    'analytics:read',
    'campaigns:read',
  ],
};

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtPayload | undefined;
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
          requestId: request.id,
        },
      });
    }

    const hasPermission = checkPermission(user.permissions ?? [], permission);
    if (!hasPermission) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Permission required: ${permission}`,
          requestId: request.id,
        },
      });
    }
  };
}

// ─── Ownership-Scoped RBAC — Section 35.3 ─────────────────────────────────────
//
// A permission may carry an optional *scope suffix* describing which records the
// grant covers:
//
//   deals:read        → 'all'  (no suffix ⇒ broadest, for backward compatibility)
//   deals:read:all    → 'all'  (every record in the tenant)
//   deals:read:team   → 'team' (records owned by the user or their team)
//   deals:read:own     → 'own'  (only records the user owns)
//
// Wildcards continue to grant the broadest scope:
//   '*'         → 'all' for everything
//   'deals:*'   → 'all' for every deals action
//
// Scope ordering (broadest → narrowest):  all  >  team  >  own
//
// ── Resolution table (checkPermission — "can act at all?") ────────────────────
//   userPermissions          required        result
//   ['deals:read:own']       'deals:read'    true   (holds *some* scope ⇒ gate open)
//   ['deals:read:own']       'deals:read:own' true
//   ['deals:read:own']       'deals:read:team' false (own is narrower than team)
//   ['deals:read:team']      'deals:read:own' true   (team is broader than own)
//   ['deals:read:all']       'deals:read:team' true
//   ['deals:read']           'deals:read:own' true   (plain grant ⇒ all ⇒ broadest)
//   ['deals:*']              'deals:read:team' true
//   ['*']                    'deals:read:own' true
//   ['contacts:read:own']    'deals:read'     false
//
// ── Resolution table (resolveRecordScope — "how much can they see?") ──────────
//   userPermissions                         permission     result
//   ['deals:read:own']                      'deals:read'   'own'
//   ['deals:read:own','deals:read:team']    'deals:read'   'team'  (broadest wins)
//   ['deals:read:all']                      'deals:read'   'all'
//   ['deals:read']                          'deals:read'   'all'   (plain ⇒ all)
//   ['deals:*']                             'deals:read'   'all'
//   ['*']                                   'deals:read'   'all'
//   ['contacts:read:own']                   'deals:read'   null    (no access)

export type RecordScope = 'own' | 'team' | 'all';

const SCOPE_RANK: Record<RecordScope, number> = { own: 1, team: 2, all: 3 };

/** Split a permission string into its base `resource:action` and optional scope. */
function splitScope(permission: string): { base: string; scope: RecordScope | null } {
  const parts = permission.split(':');
  const last = parts[parts.length - 1];
  if (last === 'own' || last === 'team' || last === 'all') {
    return { base: parts.slice(0, -1).join(':'), scope: last };
  }
  return { base: permission, scope: null };
}

/**
 * Returns the broadest scope the user holds for a given `resource:action`, or
 * `null` when the user has no access at all.
 *
 * A plain grant (`deals:read`), a resource wildcard (`deals:*`) or the global
 * wildcard (`*`) all resolve to `'all'`. Scoped grants resolve to their suffix,
 * and when several apply the broadest one wins.
 *
 * @example
 *   resolveRecordScope(['deals:read:own'], 'deals:read')                  // 'own'
 *   resolveRecordScope(['deals:read:own','deals:read:team'], 'deals:read') // 'team'
 *   resolveRecordScope(['deals:*'], 'deals:read')                          // 'all'
 *   resolveRecordScope(['contacts:read'], 'deals:read')                    // null
 */
export function resolveRecordScope(
  userPermissions: string[],
  permission: string,
): RecordScope | null {
  // The `permission` argument names the resource:action being accessed; any
  // scope suffix on it is ignored — we return what the *user* holds.
  const { base } = splitScope(permission);
  const [resource] = base.split(':');

  // Broadest grants short-circuit to 'all'.
  if (userPermissions.includes('*')) return 'all';
  if (userPermissions.includes(`${resource}:*`)) return 'all';
  if (userPermissions.includes(base)) return 'all';

  let best: RecordScope | null = null;
  for (const perm of userPermissions) {
    const parsed = splitScope(perm);
    if (parsed.base !== base || parsed.scope === null) continue;
    if (best === null || SCOPE_RANK[parsed.scope] > SCOPE_RANK[best]) {
      best = parsed.scope;
    }
  }
  return best;
}

export function checkPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(required)) return true;

  const { base, scope: requiredScope } = splitScope(required);

  // The broadest grant held by the user for this resource:action.
  const held = resolveRecordScope(userPermissions, base);
  if (held === null) return false;

  // No scope required ⇒ any held scope satisfies the gate (backward compatible:
  // `deals:read` passes for a user holding `deals:read:own`).
  if (requiredScope === null) {
    // Preserve legacy semantics: an exact plain grant or a resource wildcard.
    // `held !== null` already covers plain / wildcard / scoped grants.
    return true;
  }

  // A scoped requirement is satisfied by an equal-or-broader held scope.
  return SCOPE_RANK[held] >= SCOPE_RANK[requiredScope];
}

/** Current-user context used to materialise an ownership scope into a query filter. */
export interface OwnershipContext {
  /** The acting user's id (matched against the record's owner field). */
  userId: string;
  /** Ids of users whose records the acting user may see under `'team'` scope. */
  teamMemberIds?: string[];
  /** Owner column name on the target model (defaults to `ownerId`). */
  ownerField?: string;
}

/**
 * Materialises a resolved {@link RecordScope} into a framework-agnostic
 * Prisma-style `where` fragment that services can spread into their list
 * queries. Returns a plain object — no Prisma import required here.
 *
 *   scope 'all'  → {}                                  (no restriction)
 *   scope 'own'  → { ownerId: userId }
 *   scope 'team' → { ownerId: { in: [...teamMemberIds] } }
 *   scope null   → { ownerId: '__none__' }             (matches nothing; deny)
 *
 * `teamMemberIds` should include the user's own id when they may see their own
 * records under team scope; if omitted it falls back to `[userId]`.
 *
 * @example
 *   const scope = resolveRecordScope(user.permissions ?? [], 'deals:read');
 *   const where = applyOwnershipScope(scope, { userId: user.sub, teamMemberIds });
 *   const deals = await prisma.deal.findMany({ where: { tenantId, ...where } });
 */
export function applyOwnershipScope(
  scope: RecordScope | null,
  ctx: OwnershipContext,
): Record<string, unknown> {
  const ownerField = ctx.ownerField ?? 'ownerId';
  switch (scope) {
    case 'all':
      return {};
    case 'team': {
      const ids = ctx.teamMemberIds && ctx.teamMemberIds.length > 0
        ? ctx.teamMemberIds
        : [ctx.userId];
      return { [ownerField]: { in: ids } };
    }
    case 'own':
      return { [ownerField]: ctx.userId };
    default:
      // No access — a filter that can never match, so a leaked call returns [].
      return { [ownerField]: '__none__' };
  }
}

export function requireOwnership(resourceField: string = 'ownerId') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtPayload;
    const isAdmin =
      checkPermission(user.permissions ?? [], '*') ||
      user.roles?.includes('ADMIN') ||
      user.roles?.includes('SUPER_ADMIN') ||
      user.roles?.includes('SALES_MANAGER');
    if (isAdmin) return;

    const resource = (request as unknown as Record<string, unknown>).loadedResource as
      | Record<string, string>
      | undefined;
    if (!resource) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Resource not loaded for ownership check',
          requestId: request.id,
        },
      });
    }

    if (resource[resourceField] !== user.sub) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not own this resource',
          requestId: request.id,
        },
      });
    }
  };
}
