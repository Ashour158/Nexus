import { NextRequest } from 'next/server';

interface AdminIdentity {
  userId: string;
  role: string;
  roles: string[];
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toRoles(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

export async function requireAdmin(req?: NextRequest): Promise<AdminIdentity> {
  const roleHeader = req?.headers.get('x-admin-role') ?? req?.headers.get('x-user-role');
  if (roleHeader === 'admin') {
    return { userId: req?.headers.get('x-user-id') ?? 'admin', role: 'admin', roles: ['admin'] };
  }

  const authHeader = req?.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = token ? parseJwtPayload(token) : null;
  const role = typeof payload?.role === 'string' ? payload.role : '';
  const roles = toRoles(payload?.roles);

  if (role === 'admin' || roles.includes('admin')) {
    return {
      userId: typeof payload?.sub === 'string' ? payload.sub : 'admin',
      role: role || 'admin',
      roles,
    };
  }

  const error = new Error('Unauthorized');
  (error as Error & { status?: number }).status = 401;
  throw error;
}
