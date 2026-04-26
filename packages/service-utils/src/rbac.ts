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
  CONTRACTS: { READ: 'contracts:read', CREATE: 'contracts:create', SIGN: 'contracts:sign' },
  SUBSCRIPTIONS: {
    READ: 'subscriptions:read',
    CREATE: 'subscriptions:create',
    UPDATE: 'subscriptions:update',
    CANCEL: 'subscriptions:cancel',
  },
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
  SETTINGS: { READ: 'settings:read', UPDATE: 'settings:update' },
  INTEGRATIONS: { READ: 'integrations:read', MANAGE: 'integrations:manage' },
  BILLING: { READ: 'billing:read', MANAGE: 'billing:manage' },
  BLUEPRINTS: { READ: 'blueprints:read', MANAGE: 'blueprints:manage' },
} as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'users:*',
    'settings:*',
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
    'contracts:*',
    'subscriptions:*',
    'commission:*',
    'workflows:*',
    'analytics:*',
    'billing:*',
    'blueprints:*',
  ],
  SALES_MANAGER: [
    'leads:*',
    'contacts:*',
    'accounts:*',
    'deals:*',
    'quotes:*',
    'activities:*',
    'commission:read',
    'workflows:read',
    'analytics:*',
    'users:read',
    'products:read',
  ],
  SALES_REP: [
    'leads:read',
    'leads:create',
    'leads:update',
    'leads:convert',
    'contacts:read',
    'contacts:create',
    'contacts:update',
    'accounts:read',
    'accounts:create',
    'accounts:update',
    'deals:read',
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
  ],
  FINANCE: [
    'invoices:*',
    'contracts:*',
    'subscriptions:*',
    'commission:read',
    'commission:approve',
    'products:*',
    'accounts:read',
    'deals:read',
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
  ],
  MARKETING: [
    'leads:read',
    'leads:create',
    'leads:update',
    'contacts:read',
    'accounts:read',
    'analytics:read',
  ],
  READ_ONLY: [
    'leads:read',
    'contacts:read',
    'accounts:read',
    'deals:read',
    'quotes:read',
    'activities:read',
    'analytics:read',
  ],
};

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtPayload | undefined;
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    const hasPermission = checkPermission(user.permissions ?? [], permission);
    if (!hasPermission) {
      return reply.code(403).send({
        success: false,
        error: 'FORBIDDEN',
        message: `Permission required: ${permission}`,
      });
    }
  };
}

export function checkPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(required)) return true;

  const [resource] = required.split(':');
  if (userPermissions.includes(`${resource}:*`)) return true;

  return false;
}

export function requireOwnership(resourceField: string = 'ownerId') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtPayload;
    const isAdmin =
      checkPermission(user.permissions ?? [], '*') ||
      user.roles?.includes('ADMIN') ||
      user.roles?.includes('SALES_MANAGER');
    if (isAdmin) return;

    const resource = (request as unknown as Record<string, unknown>).loadedResource as
      | Record<string, string>
      | undefined;
    if (!resource) return;

    if (resource[resourceField] !== user.sub) {
      return reply.code(403).send({
        success: false,
        error: 'FORBIDDEN',
        message: 'You do not own this resource',
      });
    }
  };
}
