import type { AuthPrisma } from '../prisma.js';

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

export async function isIpAllowed(
  prisma: AuthPrisma,
  tenantId: string,
  ip: string
): Promise<{ allowed: boolean; reason?: string }> {
  const restrictions = await prisma.ipRestriction.findMany({
    where: { tenantId, enabled: true },
  });

  if (restrictions.length === 0) return { allowed: true };

  const allows = restrictions.filter((r) => r.type === 'ALLOW');
  const blocks = restrictions.filter((r) => r.type === 'BLOCK');

  // If any ALLOW rules exist, IP must match at least one
  if (allows.length > 0) {
    const matched = allows.some((r) => matchesCidr(ip, r.cidr));
    if (!matched) return { allowed: false, reason: 'IP not in allowlist' };
  }

  // If any BLOCK rules exist, IP must not match any
  const blocked = blocks.some((r) => matchesCidr(ip, r.cidr));
  if (blocked) return { allowed: false, reason: 'IP is blocked' };

  return { allowed: true };
}
