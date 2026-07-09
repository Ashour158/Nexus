/**
 * IP Restriction middleware for NEXUS services.
 *
 * Usage in Fastify service:
 *   import { createIpRestrictionHook } from '@nexus/security/ip-restriction';
 *   app.addHook('preHandler', createIpRestrictionHook({
 *     getRestrictions: async (tenantId) => fetchFromAuthService(tenantId),
 *   }));
 */

export interface IpRestriction {
  type: 'ALLOW' | 'BLOCK';
  cidr: string;
  enabled: boolean;
}

function ipToLong(ip: string): number {
  const parts = ip.split('.');
  return (
    (Number(parts[0]) << 24) +
    (Number(parts[1]) << 16) +
    (Number(parts[2]) << 8) +
    Number(parts[3])
  ) >>> 0;
}

function parseCidr(cidr: string): { base: number; mask: number } {
  const [ip, prefix] = cidr.split('/');
  const base = ipToLong(ip);
  const mask = prefix ? (0xffffffff << (32 - Number(prefix))) >>> 0 : 0xffffffff;
  return { base, mask };
}

function matchesCidr(ip: string, cidr: string): boolean {
  const ipLong = ipToLong(ip);
  const { base, mask } = parseCidr(cidr);
  return (ipLong & mask) === (base & mask);
}

export function checkIpAgainstRestrictions(
  ip: string,
  restrictions: IpRestriction[]
): { allowed: boolean; reason?: string } {
  const active = restrictions.filter((r) => r.enabled);
  if (active.length === 0) return { allowed: true };

  const allows = active.filter((r) => r.type === 'ALLOW');
  const blocks = active.filter((r) => r.type === 'BLOCK');

  if (allows.length > 0) {
    const matched = allows.some((r) => matchesCidr(ip, r.cidr));
    if (!matched) return { allowed: false, reason: 'IP not in allowlist' };
  }

  const blocked = blocks.some((r) => matchesCidr(ip, r.cidr));
  if (blocked) return { allowed: false, reason: 'IP is blocked' };

  return { allowed: true };
}

export interface IpRestrictionHookOptions {
  /** Fetch restrictions for a tenant. Return empty array if none. */
  getRestrictions: (tenantId: string) => Promise<IpRestriction[]>;
  /** Skip check for these route prefixes. */
  skipPaths?: string[];
}

export function createIpRestrictionHook(opts: IpRestrictionHookOptions) {
  const skipPaths = new Set(opts.skipPaths ?? ['/health', '/ready', '/metrics', '/api/versions']);

  return async function ipRestrictionHook(request: any, reply: any) {
    const path: string = request.url;
    if (Array.from(skipPaths).some((p) => path.startsWith(p))) return;

    const tenantId = (request.requestContext as any)?.get?.('tenantId');
    if (!tenantId) return;

    const restrictions = await opts.getRestrictions(tenantId);
    const result = checkIpAgainstRestrictions(request.ip, restrictions);
    if (!result.allowed) {
      return reply.code(403).send({
        success: false,
        error: { code: 'IP_RESTRICTED', message: result.reason },
      });
    }
  };
}
